-- KOBAN 段階1 のサーバー側（Supabase / PostgreSQL 15 以上）。
-- Supabase の SQL エディタでこのファイルを丸ごと実行する。何度実行しても同じ状態になる。
--
-- 方針（要件 9章「権限」、08 T1・T4 の教訓）
--   * テーブルは公開しない koban スキーマに置き、anon / authenticated から直接触らせない。
--   * 利用者が呼べるのは public の koban_* 関数だけ。関数は security definer で、
--     search_path を空にし、名前はすべてスキーマ付きで書く。
--   * 所有者・プランなどサーバーが決める値は、関数の引数からは受け取らない。
--   * 配布リンクの秘密はハッシュ（SHA-256）だけを持つ。

create schema if not exists koban;
revoke all on schema koban from public, anon, authenticated;

-- ---- テーブル ----

create table if not exists koban.projects (
  id          uuid primary key,
  owner       uuid not null references auth.users (id) on delete cascade,
  data        jsonb not null,
  rev         integer not null,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists projects_owner_idx on koban.projects (owner, updated_at);

create table if not exists koban.shares (
  id          uuid primary key,
  owner       uuid not null references auth.users (id) on delete cascade,
  project_id  uuid not null,
  day_id      uuid not null,
  person_id   uuid,
  token_hash  text not null unique,
  version     integer not null,
  payload     jsonb not null,
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists shares_owner_day_idx on koban.shares (owner, project_id, day_id);

create table if not exists koban.acks (
  share_id    uuid not null references koban.shares (id) on delete cascade,
  version     integer not null,
  at          timestamptz not null default now(),
  primary key (share_id, version)
);

-- 会社プラン（月額）。Stripe の webhook（service_role）だけが書く
create table if not exists koban.entitlements (
  owner          uuid primary key references auth.users (id) on delete cascade,
  company_until  timestamptz,
  stripe_customer text,
  updated_at     timestamptz not null default now()
);

-- 作品プラン（作品ごとの買い切り）。Stripe の webhook だけが書く
create table if not exists koban.project_plans (
  project_id  uuid primary key,
  owner       uuid not null references auth.users (id) on delete cascade,
  paid_at     timestamptz not null,
  edit_until  timestamptz,
  source      text not null default 'card'
);

alter table koban.projects enable row level security;
alter table koban.shares enable row level security;
alter table koban.acks enable row level security;
alter table koban.entitlements enable row level security;
alter table koban.project_plans enable row level security;
-- ポリシーは作らない（関数を通してだけ触る）

-- ---- 補助 ----

create or replace function koban.token_hash(p_token text)
returns text language sql immutable set search_path = '' as $$
  select encode(pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8')), 'hex')
$$;

create or replace function koban.require_user()
returns uuid language plpgsql stable set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'ログインが必要です' using errcode = '28000';
  end if;
  return uid;
end $$;

-- 作品が有料か（作品プランの編集期間内、または会社プランが有効）
create or replace function koban.is_paid(p_owner uuid, p_project uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from koban.entitlements e
     where e.owner = p_owner and e.company_until is not null and e.company_until > now()
  ) or exists (
    select 1 from koban.project_plans pp
     where pp.project_id = p_project and pp.owner = p_owner
       and (pp.edit_until is null or pp.edit_until > now())
  )
$$;

-- ---- 作品の同期（作品単位の楽観ロック。端末側は競合したら自分の版を写しとして残す） ----
-- p_base_rev は端末が最後に同期した rev。クラウドの rev がそれと一致するときだけ受け付ける
-- （他の端末の編集を黙って上書きしない）。受け付けなければクラウドの版を返す。

drop function if exists public.koban_push_project(uuid, jsonb, integer, boolean);
create or replace function public.koban_push_project(p_id uuid, p_data jsonb, p_rev integer, p_base_rev integer, p_deleted boolean)
returns table (accepted boolean, server_rev integer, server_data jsonb)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := koban.require_user();
  cur koban.projects%rowtype;
begin
  if pg_catalog.octet_length(p_data::text) > 5 * 1024 * 1024 then
    raise exception '作品のデータが大きすぎます' using errcode = '54000';
  end if;
  if p_base_rev is not null and p_rev <= p_base_rev then
    raise exception 'rev が正しくありません' using errcode = '22023';
  end if;
  select * into cur from koban.projects where id = p_id for update;
  if found and cur.owner <> uid then
    raise exception 'この作品は別のアカウントのものです' using errcode = '42501';
  end if;
  if found and cur.rev is distinct from p_base_rev then
    return query select false, cur.rev, cur.data;
    return;
  end if;
  if found then
    update koban.projects
       set data = p_data, rev = p_rev, updated_at = now(),
           deleted_at = case when p_deleted then coalesce(deleted_at, now()) end
     where id = p_id;
  else
    insert into koban.projects (id, owner, data, rev, updated_at, deleted_at)
    values (p_id, uid, p_data, p_rev, now(), case when p_deleted then now() end)
    on conflict (id) do nothing;
    if not found then
      select * into cur from koban.projects where id = p_id;
      return query select false, cur.rev, cur.data;
      return;
    end if;
  end if;
  return query select true, p_rev, null::jsonb;
end $$;

create or replace function public.koban_pull_projects(p_since timestamptz)
returns table (id uuid, data jsonb, rev integer, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := koban.require_user();
begin
  return query
    select p.id, p.data, p.rev, p.updated_at from koban.projects p
     where p.owner = uid and (p_since is null or p.updated_at > p_since)
     order by p.updated_at;
end $$;

-- ---- 配布（D-1〜D-9） ----

-- p_items: [{ id, token_hash, person_id, version, expires_at(ms), payload }]
create or replace function public.koban_publish(p_project uuid, p_day uuid, p_items jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := koban.require_user();
  it jsonb;
  paid boolean;
  recipients integer;
  active_free integer;
begin
  if pg_catalog.jsonb_typeof(p_items) <> 'array' or pg_catalog.jsonb_array_length(p_items) > 500 then
    raise exception '配布の指定が正しくありません' using errcode = '22023';
  end if;
  if exists (select 1 from koban.projects where id = p_project and owner <> uid)
     or exists (select 1 from koban.shares where project_id = p_project and owner <> uid) then
    raise exception 'この作品は別のアカウントのものです' using errcode = '42501';
  end if;

  for it in select * from pg_catalog.jsonb_array_elements(p_items) loop
    if pg_catalog.octet_length((it -> 'payload')::text) > 256 * 1024 then
      raise exception '日々スケが大きすぎます' using errcode = '54000';
    end if;
    if pg_catalog.length(it ->> 'token_hash') <> 64 then
      raise exception 'リンクの形式が正しくありません' using errcode = '22023';
    end if;
    insert into koban.shares as s (id, owner, project_id, day_id, person_id, token_hash, version, payload, expires_at)
    values (
      (it ->> 'id')::uuid, uid, p_project, p_day, nullif(it ->> 'person_id', '')::uuid,
      it ->> 'token_hash', (it ->> 'version')::integer, it -> 'payload',
      pg_catalog.to_timestamp(((it ->> 'expires_at')::bigint) / 1000.0)
    )
    on conflict (id) do update
      set version = excluded.version, payload = excluded.payload, expires_at = excluded.expires_at,
          person_id = excluded.person_id, updated_at = now()
      where s.owner = uid and s.project_id = p_project and s.day_id = p_day;
  end loop;

  -- 無料枠（要件 12章）：配布先は作品ごとに10人まで、進行中の無料作品は1本まで
  paid := koban.is_paid(uid, p_project);
  if not paid then
    select count(distinct person_id) into recipients
      from koban.shares where owner = uid and project_id = p_project and revoked_at is null and person_id is not null;
    if recipients > 10 then
      raise exception '無料枠の配布先（10人）を超えます。作品プランにすると上限がなくなります。' using errcode = 'P0001', hint = 'limit-recipients';
    end if;
    select count(distinct s.project_id) into active_free
      from koban.shares s
     where s.owner = uid and s.revoked_at is null and s.expires_at > now()
       and not koban.is_paid(uid, s.project_id);
    if active_free > 1 then
      raise exception '無料で配布できる作品は1本までです。前の作品のリンクが期限切れになるか、作品プランにすると配布できます。' using errcode = 'P0001', hint = 'limit-projects';
    end if;
  end if;
end $$;

create or replace function public.koban_set_revoked(p_ids uuid[], p_revoked boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := koban.require_user();
begin
  update koban.shares set revoked_at = case when p_revoked then now() end, updated_at = now()
   where owner = uid and id = any (p_ids);
end $$;

create or replace function public.koban_acks(p_project uuid, p_day uuid)
returns table (share_id uuid, version integer, at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare uid uuid := koban.require_user();
begin
  return query
    select a.share_id, a.version, a.at from koban.acks a
      join koban.shares s on s.id = a.share_id
     where s.owner = uid and s.project_id = p_project and s.day_id = p_day;
end $$;

-- ---- 閲覧ページ（ログイン不要。秘密を知っている人だけが読める） ----

create or replace function public.koban_view(p_token text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s koban.shares%rowtype;
  acked integer;
begin
  if p_token is null or pg_catalog.length(p_token) < 16 or pg_catalog.length(p_token) > 64 then
    return jsonb_build_object('ok', false, 'reason', 'not-found');
  end if;
  select * into s from koban.shares where token_hash = koban.token_hash(p_token);
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not-found');
  end if;
  if s.revoked_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'revoked');
  end if;
  if s.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  select max(a.version) into acked from koban.acks a where a.share_id = s.id;
  return jsonb_build_object('ok', true, 'payload', s.payload, 'ackedVersion', acked);
end $$;

create or replace function public.koban_ack(p_token text, p_version integer)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare s koban.shares%rowtype;
begin
  select * into s from koban.shares where token_hash = koban.token_hash(p_token);
  if not found or s.revoked_at is not null or s.expires_at < now() or p_version > s.version or p_version < 1 then
    return false;
  end if;
  insert into koban.acks (share_id, version) values (s.id, p_version) on conflict do nothing;
  return true;
end $$;

-- ---- 退会（E-2）。作品・配布・確認・権利をすべて消し、ログインのアカウントも消す ----

create or replace function public.koban_delete_account()
returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := koban.require_user();
begin
  delete from koban.shares where owner = uid;
  delete from koban.projects where owner = uid;
  delete from koban.project_plans where owner = uid;
  delete from koban.entitlements where owner = uid;
  delete from auth.users where id = uid;
end $$;

-- プランの状態（画面の表示用。書き換えはできない）
create or replace function public.koban_plan()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := koban.require_user();
begin
  return jsonb_build_object(
    'companyUntil', (select company_until from koban.entitlements where owner = uid),
    'paidProjects', coalesce((select jsonb_agg(jsonb_build_object('projectId', project_id, 'editUntil', edit_until))
                                from koban.project_plans where owner = uid), '[]'::jsonb)
  );
end $$;

-- ---- 実行権限 ----

revoke all on function public.koban_push_project(uuid, jsonb, integer, integer, boolean) from public, anon;
revoke all on function public.koban_pull_projects(timestamptz) from public, anon;
revoke all on function public.koban_publish(uuid, uuid, jsonb) from public, anon;
revoke all on function public.koban_set_revoked(uuid[], boolean) from public, anon;
revoke all on function public.koban_acks(uuid, uuid) from public, anon;
revoke all on function public.koban_delete_account() from public, anon;
revoke all on function public.koban_plan() from public, anon;
grant execute on function public.koban_push_project(uuid, jsonb, integer, integer, boolean) to authenticated;
grant execute on function public.koban_pull_projects(timestamptz) to authenticated;
grant execute on function public.koban_publish(uuid, uuid, jsonb) to authenticated;
grant execute on function public.koban_set_revoked(uuid[], boolean) to authenticated;
grant execute on function public.koban_acks(uuid, uuid) to authenticated;
grant execute on function public.koban_delete_account() to authenticated;
grant execute on function public.koban_plan() to authenticated;

revoke all on function public.koban_view(text) from public;
revoke all on function public.koban_ack(text, integer) from public;
grant execute on function public.koban_view(text) to anon, authenticated;
grant execute on function public.koban_ack(text, integer) to anon, authenticated;

revoke all on all functions in schema koban from public, anon, authenticated;
