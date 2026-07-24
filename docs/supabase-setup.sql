-- Tsumugi — アカウント同期（Phase B）用スキーマ + RLS
-- Supabase の SQL Editor にこの内容を貼って実行する。冪等（何度流しても安全）。
--
-- 設計：行 = 作品（Outline）1 件。ローカルの Outline をほぼそのまま jsonb で持つ。
-- ゴミ箱（deleted_at）も同期する＝完全削除だけが行を消す。
-- RLS で「自分の行しか読み書きできない」を担保する。

-- 1) テーブル ---------------------------------------------------------------
create table if not exists public.outlines (
  id         text primary key,                        -- ローカル uid() をそのまま使う
  user_id    uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
  title      text  not null default '',
  structure  text  not null default 'three-act',      -- 'three-act' | 'kishotenketsu' | 'free'
  boxes      jsonb not null default '[]'::jsonb,       -- Box[] を丸ごと
  updated    bigint not null,                          -- ローカルの updated(ms) と同一系。LWW の基準
  deleted_at bigint,                                   -- ソフト削除時刻(ms)。null なら生存
  synced_at  timestamptz not null default now()        -- サーバ側の最終書き込み時刻
);

comment on table public.outlines is 'Tsumugi の箱書き作品（1行=1作品）。ローカル localStorage の複製。';

-- 自分の行の絞り込み用インデックス
create index if not exists outlines_user_id_idx on public.outlines (user_id);

-- 2) 行レベルセキュリティ ---------------------------------------------------
alter table public.outlines enable row level security;

-- 既存ポリシーがあれば作り直す（冪等化）
drop policy if exists "outlines are private to their owner" on public.outlines;
create policy "outlines are private to their owner"
  on public.outlines
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 3) synced_at の自動更新（任意）-------------------------------------------
create or replace function public.touch_synced_at()
returns trigger
language plpgsql
as $$
begin
  new.synced_at := now();
  return new;
end;
$$;

drop trigger if exists outlines_touch_synced_at on public.outlines;
create trigger outlines_touch_synced_at
  before insert or update on public.outlines
  for each row execute function public.touch_synced_at();

-- 完了。以降、クライアント（anon key）は自分の user_id の行だけを
-- select / insert / update / delete できる。他人の行は RLS で不可視。
