-- 権限と配布の流れを確かめる。失敗すると ON_ERROR_STOP で止まる
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set P '11111111-1111-1111-1111-111111111111'
\set D '22222222-2222-2222-2222-222222222222'

-- anon はテーブルも同期の関数も触れない
set role anon;
do $$ begin
  begin perform * from koban.shares; raise exception 'anon がテーブルを読めた';
  exception when insufficient_privilege then null; end;
  begin perform public.koban_publish(gen_random_uuid(), gen_random_uuid(), '[]');
    raise exception 'anon が publish できた';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- A が作品を上げる
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
select * from public.koban_push_project(:'P', '{"title":"t"}', 1, null, false);
-- 別の端末が rev 1 を元に 2 を上げた後、同じ rev 1 を元にした版は受け付けず、サーバーの版を返す
select accepted from public.koban_push_project(:'P', '{"title":"other"}', 2, 1, false);
do $$ begin
  if (select accepted from public.koban_push_project('11111111-1111-1111-1111-111111111111', '{"title":"stale"}', 5, 1, false)) then
    raise exception '古い版を元にした上書きが通った';
  end if;
end $$;

-- A が配布する（トークン 'tok-aaaaaaaaaaaaaaaa'）
select public.koban_publish(:'P', :'D', jsonb_build_array(jsonb_build_object(
  'id', '33333333-3333-3333-3333-333333333333',
  'token_hash', encode(sha256(convert_to('tok-aaaaaaaaaaaaaaaa', 'UTF8')), 'hex'),
  'person_id', '44444444-4444-4444-4444-444444444444',
  'version', 2, 'expires_at', (extract(epoch from now() + interval '1 day') * 1000)::bigint,
  'payload', '{"v":1}'::jsonb)));

-- B は A の作品に配布も上書きもできない
select set_config('request.jwt.claim.sub', :'B', false);
do $$ begin
  begin perform public.koban_publish('11111111-1111-1111-1111-111111111111', gen_random_uuid(), '[]');
    raise exception 'B が A の作品に配布できた';
  exception when insufficient_privilege then null; end;
  begin perform public.koban_push_project('11111111-1111-1111-1111-111111111111', '{}', 99, 2, false);
    raise exception 'B が A の作品を上書きできた';
  exception when insufficient_privilege then null; end;
end $$;
select count(*) as b_sees_acks from public.koban_acks(:'P', :'D');
reset role;

-- 受け取る人（anon）が見て確認する
set role anon;
select public.koban_view('tok-aaaaaaaaaaaaaaaa') ->> 'ok' as view_ok;
select public.koban_view('wrong-token-xxxxxxxx') ->> 'reason' as wrong;
select public.koban_ack('tok-aaaaaaaaaaaaaaaa', 3) as ack_future_version;
select public.koban_ack('tok-aaaaaaaaaaaaaaaa', 2) as ack_ok;
select public.koban_ack('tok-aaaaaaaaaaaaaaaa', 2) as ack_again;
select public.koban_view('tok-aaaaaaaaaaaaaaaa') ->> 'ackedVersion' as acked;
reset role;

-- A は確認を読め、取り消すと見えなくなる
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
select version from public.koban_acks(:'P', :'D');
select public.koban_set_revoked(array['33333333-3333-3333-3333-333333333333']::uuid[], true);
reset role;
set role anon;
select public.koban_view('tok-aaaaaaaaaaaaaaaa') ->> 'reason' as after_revoke;
reset role;

-- 無料枠：11人目でエラー、全体が巻き戻る
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
do $$
declare items jsonb := '[]';
begin
  for i in 1..11 loop
    items := items || jsonb_build_object('id', gen_random_uuid(), 'token_hash', encode(sha256(convert_to('t' || i || 'xxxxxxxxxxxxxxxxx', 'UTF8')), 'hex'),
      'person_id', gen_random_uuid(), 'version', 1, 'expires_at', (extract(epoch from now() + interval '1 day') * 1000)::bigint, 'payload', '{}'::jsonb);
  end loop;
  begin
    perform public.koban_publish('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', items);
    raise exception '11人目が通った';
  exception when sqlstate 'P0001' then
    if sqlerrm like '11人目%' then raise; end if;
  end;
end $$;
reset role;
do $$ begin
  if (select count(*) from koban.shares) <> 1 then raise exception '巻き戻っていない'; end if;
end $$;
set role authenticated;
-- 2本目の無料作品は配布できない
do $$ begin
  perform public.koban_publish('55555555-5555-5555-5555-555555555555', gen_random_uuid(), jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid(), 'token_hash', encode(sha256(convert_to('p2xxxxxxxxxxxxxxxxxx', 'UTF8')), 'hex'), 'person_id', gen_random_uuid(),
    'version', 1, 'expires_at', (extract(epoch from now() + interval '1 day') * 1000)::bigint, 'payload', '{}'::jsonb)));
  -- 1本目のリンクは取り消し済みなので、ここは通るのが正しい
end $$;
do $$ begin
  perform public.koban_publish('66666666-6666-6666-6666-666666666666', gen_random_uuid(), jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid(), 'token_hash', encode(sha256(convert_to('p3xxxxxxxxxxxxxxxxxx', 'UTF8')), 'hex'), 'person_id', gen_random_uuid(),
    'version', 1, 'expires_at', (extract(epoch from now() + interval '1 day') * 1000)::bigint, 'payload', '{}'::jsonb)));
  raise exception '2本目の無料作品が通った';
exception when sqlstate 'P0001' then
  if sqlerrm like '2本目%' then raise; end if;
end $$;
-- 課金の関数は利用者からは呼べない
do $$ begin
  begin perform public.koban_admin_set_company(auth.uid(), now() + interval '1 year');
    raise exception '利用者が会社プランを自分に付けられた';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- service_role が会社プランを付けると、無料枠の制限が外れる
set role service_role;
select public.koban_admin_set_company('00000000-0000-0000-0000-00000000000a', now() + interval '1 month');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  perform public.koban_publish('66666666-6666-6666-6666-666666666666', gen_random_uuid(), jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid(), 'token_hash', encode(sha256(convert_to('p4xxxxxxxxxxxxxxxxxx', 'UTF8')), 'hex'), 'person_id', gen_random_uuid(),
    'version', 1, 'expires_at', (extract(epoch from now() + interval '1 day') * 1000)::bigint, 'payload', '{}'::jsonb)));
end $$;
select public.koban_plan() ->> 'companyUntil' is not null as company;
-- 退会
select public.koban_delete_account();
reset role;
select count(*) as users_left from auth.users;
select count(*) as shares_left from koban.shares;
