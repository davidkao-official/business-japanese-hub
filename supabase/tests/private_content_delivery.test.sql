begin;

select plan(14);

select has_table('public', 'private_content_release', 'private content delivery uses a server-only release table');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.private_content_release'::regclass),
  'private content release table has RLS enabled'
);
select ok(
  not has_table_privilege('anon', 'public.private_content_release', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'public.private_content_release', 'select,insert,update,delete'),
  'browser roles have no direct private content table privileges'
);
select ok(
  has_table_privilege('service_role', 'public.private_content_release', 'select,insert'),
  'service role can perform controlled imports and server delivery reads'
);
select ok(
  not has_table_privilege('service_role', 'public.private_content_release', 'update,delete,truncate'),
  'service role has no destructive private release privileges'
);
select throws_ok(
  $$ insert into public.private_content_release (
       content_id, revision, content_kind, access_scope, payload
     ) values ('book/private', repeat('c', 64), 'book', 'member', '{}'::jsonb) $$,
  '23514',
  'new row for relation "private_content_release" violates check constraint "private_content_release_id_bounded"',
  'the database rejects content ids the delivery boundary cannot address'
);

insert into public.private_content_release (
  content_id, revision, content_kind, access_scope, payload
) values (
  'private-test-book', repeat('a', 64), 'book', 'member', '{"fixture":"server-only"}'::jsonb
);

select is(
  (select count(*) from public.private_content_release where content_id = 'private-test-book'),
  1::bigint,
  'a server-side release is stored once with an immutable revision'
);
select throws_ok(
  $$ update public.private_content_release set payload = '{"fixture":"changed"}'::jsonb where content_id = 'private-test-book' $$,
  'P0001',
  'private_content_release rows are immutable',
  'release payload cannot be rewritten in place'
);
select throws_ok(
  $$ delete from public.private_content_release where content_id = 'private-test-book' $$,
  'P0001',
  'private_content_release rows are immutable',
  'release rows cannot be deleted in place'
);

set local role service_role;
select throws_ok(
  $$ update public.private_content_release set payload = '{"fixture":"changed"}'::jsonb where content_id = 'private-test-book' $$,
  '42501',
  'permission denied for table private_content_release',
  'service role cannot rewrite an immutable release'
);
select throws_ok(
  $$ delete from public.private_content_release where content_id = 'private-test-book' $$,
  '42501',
  'permission denied for table private_content_release',
  'service role cannot delete an immutable release'
);
select throws_ok(
  $$ truncate public.private_content_release $$,
  '42501',
  'permission denied for table private_content_release',
  'service role cannot truncate immutable releases'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);

select throws_ok(
  $$ select * from public.private_content_release $$,
  '42501',
  'permission denied for table private_content_release',
  'authenticated users cannot read proprietary payloads directly'
);
select throws_ok(
  $$ insert into public.private_content_release (
       content_id, revision, content_kind, access_scope, payload
     ) values ('forged', repeat('b', 64), 'book', 'member', '{}'::jsonb) $$,
  '42501',
  'permission denied for table private_content_release',
  'authenticated users cannot forge a private release'
);

reset role;
select * from finish();
rollback;
