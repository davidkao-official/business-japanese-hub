begin;

select plan(22);

insert into auth.users (id, aud, role) values
  ('17100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated'),
  ('17100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated');

insert into public.private_content_release (content_id, revision, content_kind, access_scope, payload) values
  ('reading-plus-contract-test', repeat('a', 64), 'reading', 'member', '{"test":"release-a"}'::jsonb),
  ('reading-plus-contract-test', repeat('b', 64), 'reading', 'member', '{"test":"release-b"}'::jsonb),
  ('reading-book-contract-test', repeat('c', 64), 'book', 'member', '{"test":"not-reading"}'::jsonb);

select ok((select relrowsecurity from pg_class where oid = 'public.reading_saves'::regclass), 'Reading save table has RLS enabled');
select ok(
  not has_table_privilege('anon', 'public.reading_saves', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'public.reading_saves', 'select,insert,update,delete'),
  'browser roles cannot read or mutate Reading saves directly'
);
select ok(has_table_privilege('service_role', 'public.reading_saves', 'select'), 'service can list bounded saved metadata');
select ok(
  not has_table_privilege('service_role', 'public.reading_saves', 'insert,update,delete,truncate'),
  'service writes are restricted to the narrow save RPCs'
);
select ok(has_function_privilege('service_role', 'public.save_reading_item(uuid,text,text)', 'execute'), 'service can call the save RPC');
select ok(has_function_privilege('service_role', 'public.remove_reading_item(uuid,text)', 'execute'), 'service can call the remove RPC');
select ok(
  not has_function_privilege('authenticated', 'public.save_reading_item(uuid,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.remove_reading_item(uuid,text)', 'execute'),
  'browser roles cannot invoke write RPCs directly'
);

set local role service_role;
select public.save_reading_item('17100000-0000-4000-8000-000000000001', 'reading-plus-contract-test', repeat('a', 64)) as first_save \gset
select is((:'first_save'::jsonb ->> 'item_id'), 'reading-plus-contract-test', 'save returns only the bounded item identity');
select is((:'first_save'::jsonb ->> 'revision'), repeat('a', 64), 'save returns the exact Plus revision');
select ok((:'first_save'::jsonb ? 'saved_at') and not (:'first_save'::jsonb ? 'payload'), 'save receipt has a timestamp and no content payload');

select public.save_reading_item('17100000-0000-4000-8000-000000000001', 'reading-plus-contract-test', repeat('a', 64)) as same_save \gset
select is(:'same_save'::jsonb ->> 'saved_at', :'first_save'::jsonb ->> 'saved_at', 'same-revision retry preserves the original save timestamp');

select pg_sleep(0.02);
select public.save_reading_item('17100000-0000-4000-8000-000000000001', 'reading-plus-contract-test', repeat('b', 64)) as changed_save \gset
select is((:'changed_save'::jsonb ->> 'revision'), repeat('b', 64), 'a changed current revision replaces the saved revision');
select isnt(:'changed_save'::jsonb ->> 'saved_at', :'first_save'::jsonb ->> 'saved_at', 'a changed revision receives a fresh server timestamp');

select throws_ok(
  $$ select public.save_reading_item('17100000-0000-4000-8000-000000000001', 'reading-book-contract-test', repeat('c', 64)) $$,
  '22023', 'invalid Reading save release', 'save RPC rejects a non-Reading release'
);
select throws_ok(
  $$ select public.save_reading_item('17100000-0000-4000-8000-000000000001', 'reading-plus-contract-test', repeat('d', 64)) $$,
  '22023', 'invalid Reading save release', 'save RPC rejects a nonexistent or stale release'
);
select throws_ok(
  $$ select public.save_reading_item('17100000-0000-4000-8000-000000000001', 'invalid id', null) $$,
  '22023', 'invalid Reading save reference', 'save RPC rejects malformed IDs'
);

select public.save_reading_item('17100000-0000-4000-8000-000000000002', 'reading-plus-contract-test', repeat('b', 64));
select is(
  (select count(*) from public.reading_saves where item_id = 'reading-plus-contract-test'),
  2::bigint,
  'same item remains separately owned for two members'
);
select is(
  (select revision from public.reading_saves where user_id = '17100000-0000-4000-8000-000000000001' and item_id = 'reading-plus-contract-test'),
  repeat('b', 64),
  'one member revision update leaves the other member row intact'
);

select public.remove_reading_item('17100000-0000-4000-8000-000000000001', 'reading-plus-contract-test') as first_remove \gset
select is((:'first_remove'::jsonb ->> 'revision'), repeat('b', 64), 'remove receipt includes the removed revision');
select ok(:'first_remove'::jsonb ? 'server_timestamp', 'remove receipt includes a database timestamp');
select public.remove_reading_item('17100000-0000-4000-8000-000000000001', 'reading-plus-contract-test') as second_remove \gset
select is((:'second_remove'::jsonb ->> 'revision'), null::text, 'repeated remove is idempotent when the row is already absent');
select is(
  (select count(*) from public.reading_saves where user_id = '17100000-0000-4000-8000-000000000002'),
  1::bigint,
  'removing one owner row cannot remove another owner row'
);
reset role;

select * from finish();
rollback;
