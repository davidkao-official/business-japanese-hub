begin;
select plan(27);

insert into auth.users (id, aud, role) values
  ('17400000-0000-4000-8000-000000000001', 'authenticated', 'authenticated'),
  ('17400000-0000-4000-8000-000000000002', 'authenticated', 'authenticated');

insert into public.private_content_release (content_id, revision, content_kind, access_scope, payload) values
  ('workplace-plus-lesson-test', repeat('a', 64), 'workplace-lesson', 'member', '{"body":"private"}'::jsonb),
  ('workplace-plus-lesson-test', repeat('b', 64), 'workplace-lesson', 'member', '{"body":"next private"}'::jsonb),
  ('workplace-plus-vocab-test', repeat('c', 64), 'workplace-vocabulary', 'member', '{"body":"private"}'::jsonb),
  ('workplace-wrong-kind-test', repeat('d', 64), 'reading', 'member', '{"body":"not Workplace"}'::jsonb);

select ok((select relrowsecurity from pg_class where oid = 'public.workplace_learn_publication'::regclass), 'publication projection has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.workplace_learn_saves'::regclass), 'saves table has RLS enabled');
select ok(not has_table_privilege('anon', 'public.workplace_learn_saves', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'public.workplace_learn_saves', 'select,insert,update,delete'), 'browser roles cannot read or mutate saves');
select ok(not has_table_privilege('anon', 'public.workplace_learn_publication', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'public.workplace_learn_publication', 'select,insert,update,delete'), 'browser roles cannot inspect or mutate publication projection');
select ok(has_table_privilege('service_role', 'public.workplace_learn_saves', 'select')
  and not has_table_privilege('service_role', 'public.workplace_learn_saves', 'insert,update,delete,truncate'), 'service can list saves but cannot write around RPCs');
select ok(has_function_privilege('service_role', 'public.save_workplace_learn_item(uuid,text,text,text)', 'execute')
  and has_function_privilege('service_role', 'public.remove_workplace_learn_item(uuid,text)', 'execute'), 'service can invoke bounded save and remove RPCs');
select ok(not has_function_privilege('authenticated', 'public.save_workplace_learn_item(uuid,text,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.remove_workplace_learn_item(uuid,text)', 'execute'), 'browser roles cannot invoke save or remove RPCs');
select is((select count(*) from public.workplace_learn_publication where access_scope = 'free'), 2::bigint, 'only the original Free lesson and vocabulary pair is seeded');
select is((select count(*) from public.workplace_learn_publication where access_scope = 'plus'), 0::bigint, 'Plus releases are not implicitly published');
select throws_ok($$ insert into public.workplace_learn_publication
  (item_id, item_kind, access_scope, revision, sample_classification, available)
  values ('workplace-null-classification-test', 'lesson', 'free', null, null, true) $$,
  '23514', null, 'Free publication rejects a NULL sample classification');

set local role service_role;
select is(public.save_workplace_learn_item('17400000-0000-4000-8000-000000000001', 'workplace-learn-sample-status-update', 'lesson', null)->>'status', 'saved', 'Free sample can be saved with a null revision');
select is((select revision from public.workplace_learn_saves where user_id = '17400000-0000-4000-8000-000000000001' and item_id = 'workplace-learn-sample-status-update'), null::text, 'Free save stores no invented release revision');
select is(public.save_workplace_learn_item('17400000-0000-4000-8000-000000000001', 'workplace-learn-sample-mikomi', 'vocabulary', null)->>'status', 'saved', 'correctly classified Free vocabulary sample can be saved');
select is(public.save_workplace_learn_item('17400000-0000-4000-8000-000000000001', 'workplace-learn-sample-mikomi', 'lesson', null)->>'status', 'stale', 'stable ID cannot be saved using a different item kind');
select is(public.save_workplace_learn_item('17400000-0000-4000-8000-000000000001', 'workplace-learn-sample-mikomi', 'vocabulary', repeat('e', 64))->>'status', 'stale', 'Free sample rejects a non-null revision');

select throws_ok($$ select public.publish_workplace_learn_item('workplace-wrong-kind-test', 'lesson', repeat('d', 64)) $$,
  '22023', 'invalid Workplace Learn publication release', 'publication rejects wrong private release kind');
select public.publish_workplace_learn_item('workplace-plus-lesson-test', 'lesson', repeat('a', 64));
select is((select count(*) from public.workplace_learn_publication where item_id = 'workplace-plus-lesson-test' and available and revision = repeat('a', 64)), 1::bigint, 'controlled publication projects exact current revision');
select throws_ok($$ update public.workplace_learn_publication set item_kind = 'vocabulary' where item_id = 'workplace-plus-lesson-test' $$,
  '42501', null, 'service role cannot directly retype a published identity');

select (public.save_workplace_learn_item('17400000-0000-4000-8000-000000000001', 'workplace-plus-lesson-test', 'lesson', repeat('a', 64)))->>'saved_at' as first_saved_at \gset
select is(public.save_workplace_learn_item('17400000-0000-4000-8000-000000000001', 'workplace-plus-lesson-test', 'lesson', repeat('a', 64))->>'saved_at', :'first_saved_at', 'same revision save retry preserves saved_at');
select public.publish_workplace_learn_item('workplace-plus-lesson-test', 'lesson', repeat('b', 64));
select is(public.save_workplace_learn_item('17400000-0000-4000-8000-000000000001', 'workplace-plus-lesson-test', 'lesson', repeat('a', 64))->>'status', 'stale', 'old revision cannot overwrite save after publication advances');
select pg_sleep(0.02);
select isnt((public.save_workplace_learn_item('17400000-0000-4000-8000-000000000001', 'workplace-plus-lesson-test', 'lesson', repeat('b', 64)))->>'saved_at', :'first_saved_at', 'changed revision refreshes saved_at');
select is(public.save_workplace_learn_item('17400000-0000-4000-8000-000000000001', 'workplace-plus-lesson-test', 'vocabulary', repeat('b', 64))->>'status', 'stale', 'save RPC rejects a mismatched kind');

select public.publish_workplace_learn_item('workplace-plus-vocab-test', 'vocabulary', repeat('c', 64));
select public.save_workplace_learn_item('17400000-0000-4000-8000-000000000002', 'workplace-plus-lesson-test', 'lesson', repeat('b', 64));
select is((select count(*) from public.workplace_learn_saves where item_id = 'workplace-plus-lesson-test'), 2::bigint, 'different owners have isolated preferences for the same stable ID');
select public.retire_workplace_learn_item('workplace-plus-lesson-test');
select is(public.save_workplace_learn_item('17400000-0000-4000-8000-000000000001', 'workplace-plus-lesson-test', 'lesson', repeat('b', 64))->>'status', 'stale', 'retired publication rejects new saves');
select ok((public.remove_workplace_learn_item('17400000-0000-4000-8000-000000000001', 'workplace-plus-lesson-test') ? 'server_timestamp')
  and (public.remove_workplace_learn_item('17400000-0000-4000-8000-000000000001', 'workplace-plus-lesson-test') ? 'server_timestamp'), 'remove remains idempotent after retirement');
select is((select count(*) from public.workplace_learn_saves where user_id = '17400000-0000-4000-8000-000000000002' and item_id = 'workplace-plus-lesson-test'), 1::bigint, 'owner removal cannot delete another member save');
select ok(not (public.save_workplace_learn_item('17400000-0000-4000-8000-000000000001', 'workplace-plus-vocab-test', 'vocabulary', repeat('c', 64)) ? 'payload'), 'save receipt cannot contain a release body');
reset role;

select * from finish();
rollback;
