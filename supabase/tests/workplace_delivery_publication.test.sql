begin;

select plan(16);

insert into auth.users (id, aud, role) values
  ('18400000-0000-4000-8000-000000000001', 'authenticated', 'authenticated'),
  ('18400000-0000-4000-8000-000000000002', 'authenticated', 'authenticated');

insert into public.private_content_release (content_id, revision, content_kind, access_scope, payload) values
  ('workplace-delivery-lesson', repeat('a', 64), 'workplace-lesson', 'member', '{"body":"lesson revision a"}'::jsonb),
  ('workplace-delivery-lesson', repeat('b', 64), 'workplace-lesson', 'member', '{"body":"lesson revision b"}'::jsonb),
  ('workplace-delivery-vocabulary', repeat('c', 64), 'workplace-vocabulary', 'member', '{"body":"vocabulary body"}'::jsonb),
  ('workplace-delivery-wrong-kind', repeat('d', 64), 'reading', 'member', '{"body":"not Workplace"}'::jsonb);

select ok(has_function_privilege('service_role', 'public.get_member_workplace_learn_release(uuid,text,text)', 'execute'),
  'service role can invoke the Workplace delivery gate');
select ok(not has_function_privilege('authenticated', 'public.get_member_workplace_learn_release(uuid,text,text)', 'execute'),
  'browser roles cannot invoke the Workplace delivery gate');

set local role service_role;
select is(public.record_plus_membership_event(
  'workplace-delivery-test', 'customer-184', 'subscription-184', 'started-184',
  '18400000-0000-4000-8000-000000000001', 'plus_early_access_monthly',
  'membership_started', now() - interval '1 hour', now() - interval '2 hours',
  now() + interval '1 day'
), 'applied', 'first test user has canonical temporal Plus coverage');
select is((select provolatile from pg_proc
  where oid = 'public._resolve_plus_membership_access_at(uuid,timestamptz)'::regprocedure),
  's', 'fixed-time membership helper shares the delivery statement snapshot');

select is(public.get_member_workplace_learn_release('18400000-0000-4000-8000-000000000001',
  'workplace-delivery-lesson', repeat('a', 64)) ->> 'status', 'missing',
  'importing a Workplace lesson does not publish it');
select is(public.get_member_workplace_learn_release('18400000-0000-4000-8000-000000000001',
  'workplace-delivery-lesson', repeat('e', 64)) ->> 'status', 'missing',
  'a wrong revision is unavailable');

select public.publish_workplace_learn_item('workplace-delivery-lesson', 'lesson', repeat('a', 64));
select is(public.get_member_workplace_learn_release('18400000-0000-4000-8000-000000000001',
  'workplace-delivery-lesson', repeat('a', 64)) -> 'payload' ->> 'body', 'lesson revision a',
  'published exact lesson revision is delivered to active member');
select public.publish_workplace_learn_item('workplace-delivery-vocabulary', 'vocabulary', repeat('c', 64));
select is(public.get_member_workplace_learn_release('18400000-0000-4000-8000-000000000001',
  'workplace-delivery-vocabulary', repeat('c', 64)) -> 'payload' ->> 'body', 'vocabulary body',
  'published exact vocabulary revision is delivered to active member');
select is(public.get_member_workplace_learn_release('18400000-0000-4000-8000-000000000001',
  'workplace-delivery-vocabulary', repeat('c', 64)) ->> 'content_kind', 'workplace-vocabulary',
  'vocabulary publication maps to the immutable vocabulary release kind');

reset role;
update public.plus_membership_access_window
set window_end = now() - interval '1 minute'
where user_id = '18400000-0000-4000-8000-000000000001';
set local role service_role;
select is(public.get_member_workplace_learn_release('18400000-0000-4000-8000-000000000001',
  'workplace-delivery-vocabulary', repeat('c', 64)) ->> 'status', 'non-member',
  'expired temporal membership cannot receive a published Workplace body');
reset role;
update public.plus_membership_access_window
set window_end = now() + interval '1 day'
where user_id = '18400000-0000-4000-8000-000000000001';
set local role service_role;

select is(public.get_member_workplace_learn_release('18400000-0000-4000-8000-000000000002',
  'workplace-delivery-lesson', repeat('a', 64)) ->> 'status', 'non-member',
  'inactive user cannot receive an otherwise published body');

select public.publish_workplace_learn_item('workplace-delivery-lesson', 'lesson', repeat('b', 64));
select is(public.get_member_workplace_learn_release('18400000-0000-4000-8000-000000000001',
  'workplace-delivery-lesson', repeat('a', 64)) ->> 'status', 'missing',
  'superseded lesson revision is unavailable');
select is(public.get_member_workplace_learn_release('18400000-0000-4000-8000-000000000001',
  'workplace-delivery-lesson', repeat('b', 64)) -> 'payload' ->> 'body', 'lesson revision b',
  'new exact lesson revision can be delivered');

select public.retire_workplace_learn_item('workplace-delivery-lesson');
select is(public.get_member_workplace_learn_release('18400000-0000-4000-8000-000000000001',
  'workplace-delivery-lesson', repeat('b', 64)) ->> 'status', 'missing',
  'retired lesson cannot be delivered');
select is(public.get_member_workplace_learn_release('18400000-0000-4000-8000-000000000001',
  'workplace-delivery-wrong-kind', repeat('d', 64)) ->> 'status', 'missing',
  'a non-Workplace release is not delivered through the Workplace gate');
select is(public.get_member_workplace_learn_release('18400000-0000-4000-8000-000000000001',
  'bad/id', repeat('a', 64)) ->> 'status', 'missing',
  'malformed references fail closed');
reset role;

select * from finish();
rollback;
