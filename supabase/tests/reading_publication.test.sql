begin;

select plan(22);

insert into auth.users (id, aud, role) values
  ('18200000-0000-4000-8000-000000000001', 'authenticated', 'authenticated'),
  ('18200000-0000-4000-8000-000000000002', 'authenticated', 'authenticated');

insert into public.private_content_release (content_id, revision, content_kind, access_scope, payload) values
  ('reading-publication-contract-test', repeat('a', 64), 'reading', 'member', '{"body":"private fixture a"}'::jsonb),
  ('reading-publication-contract-test', repeat('b', 64), 'reading', 'member', '{"body":"private fixture b"}'::jsonb),
  ('reading-publication-wrong-kind-test', repeat('c', 64), 'book', 'member', '{"body":"not reading"}'::jsonb);

select ok((select relrowsecurity from pg_class where oid = 'public.reading_publication'::regclass),
  'Reading publication has row-level security');
select ok(
  not has_table_privilege('anon', 'public.reading_publication', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'public.reading_publication', 'select,insert,update,delete'),
  'browser roles cannot inspect or mutate publication rows'
);
select ok(has_table_privilege('service_role', 'public.reading_publication', 'select'),
  'service role can read the body-free projection');
select ok(not has_table_privilege('service_role', 'public.reading_publication', 'insert,update,delete,truncate'),
  'service role writes only through controlled RPCs');
select ok(has_function_privilege('service_role', 'public.publish_reading_item(text,text)', 'execute')
  and has_function_privilege('service_role', 'public.retire_reading_item(text)', 'execute')
  and has_function_privilege('service_role', 'public.get_member_reading_release(uuid,text,text)', 'execute'),
  'service role can publish, retire, and perform gated delivery');
select ok(not has_function_privilege('authenticated', 'public.publish_reading_item(text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.retire_reading_item(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.get_member_reading_release(uuid,text,text)', 'execute'),
  'browser roles cannot invoke publication or delivery RPCs');
select is((select count(*) from public.reading_publication where item_id = 'reading-publication-contract-test'),
  0::bigint, 'imported releases are not automatically published');

set local role service_role;
select is(public.record_plus_membership_event(
  'reading-publication-test', 'customer-182', 'subscription-182', 'started-182',
  '18200000-0000-4000-8000-000000000001', 'plus_early_access_monthly',
  'membership_started', now() - interval '1 hour', now() - interval '2 hours',
  now() + interval '1 day'
), 'applied', 'test member gains canonical paid temporal coverage');
select is((select provolatile from pg_proc
  where oid = 'public._resolve_plus_membership_access_at(uuid,timestamptz)'::regprocedure),
  's', 'fixed-time membership helper shares the delivery statement snapshot');

-- Reproduce a statement-snapshot race without dblink. The test-only wrappers
-- are installed before the delivery function caches its query and mutate only
-- while the transaction-local test flag is enabled below.
reset role;
create function public._reading_publication_race_test_mutate()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.reading_publication_race_test', true) = 'on'
    and exists (
      select 1 from public.reading_publication
      where item_id = 'reading-publication-contract-test'
        and revision = repeat('a', 64)
    ) then
    perform public.publish_reading_item(
      'reading-publication-contract-test', repeat('b', 64)
    );
    update public.plus_membership_access_window
    set window_end = statement_timestamp()
    where user_id = '18200000-0000-4000-8000-000000000001'
      and window_end > statement_timestamp();
  end if;
end;
$$;
revoke all on function public._reading_publication_race_test_mutate() from public, anon, authenticated, service_role;

alter function public._resolve_plus_membership_access_at(uuid, timestamptz)
  rename to _reading_publication_race_original_access_at;
alter function public.resolve_plus_membership_access(uuid)
  rename to _reading_publication_race_original_access;

create function public._resolve_plus_membership_access_at(
  p_user_id uuid,
  p_now timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._reading_publication_race_test_mutate();
  return public._reading_publication_race_original_access_at(p_user_id, p_now);
end;
$$;
revoke all on function public._resolve_plus_membership_access_at(uuid, timestamptz)
  from public, anon, authenticated, service_role;

create function public.resolve_plus_membership_access(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._reading_publication_race_test_mutate();
  return public._reading_publication_race_original_access(p_user_id);
end;
$$;
revoke all on function public.resolve_plus_membership_access(uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_plus_membership_access(uuid) to service_role;

set local role service_role;
select is(public.get_member_reading_release('18200000-0000-4000-8000-000000000001',
  'reading-publication-contract-test', repeat('a', 64)) ->> 'status', 'missing',
  'an imported but unpublished Reading release has no delivery body');
select throws_ok(
  $$ select public.publish_reading_item('reading-publication-wrong-kind-test', repeat('c', 64)) $$,
  '22023', 'invalid Reading publication release', 'publisher rejects the wrong immutable content kind'
);
select public.publish_reading_item('reading-publication-contract-test', repeat('a', 64));
select is((select revision from public.reading_publication where item_id = 'reading-publication-contract-test'),
  repeat('a', 64), 'publication points to the exact current revision');
select is(public.get_member_reading_release('18200000-0000-4000-8000-000000000001',
  'reading-publication-contract-test', repeat('a', 64)) -> 'payload' ->> 'body', 'private fixture a',
  'only the exact published Reading body is delivered to an active member');
select is(public.get_member_reading_release('18200000-0000-4000-8000-000000000002',
  'reading-publication-contract-test', repeat('a', 64)) ->> 'status', 'non-member',
  'an inactive member cannot receive the published body');

select set_config('app.reading_publication_race_test', 'on', true);
select is(public.get_member_reading_release('18200000-0000-4000-8000-000000000001',
  'reading-publication-contract-test', repeat('b', 64)) ->> 'status', 'missing',
  'delivery snapshot cannot see a revision published after its authorization snapshot');
select is(public.get_member_reading_release('18200000-0000-4000-8000-000000000001',
  'reading-publication-contract-test', repeat('b', 64)) ->> 'status', 'non-member',
  'a later delivery statement observes revoked temporal access');
select set_config('app.reading_publication_race_test', 'off', true);

reset role;
drop function public.resolve_plus_membership_access(uuid);
alter function public._reading_publication_race_original_access(uuid)
  rename to resolve_plus_membership_access;
drop function public._resolve_plus_membership_access_at(uuid, timestamptz);
alter function public._reading_publication_race_original_access_at(uuid, timestamptz)
  rename to _resolve_plus_membership_access_at;
drop function public._reading_publication_race_test_mutate();

set local role service_role;
select public.publish_reading_item('reading-publication-contract-test', repeat('b', 64));
select is((select count(*) from public.reading_publication where item_id = 'reading-publication-contract-test'),
  1::bigint, 'a new publication revision replaces the single current row');
select is((select revision from public.reading_publication where item_id = 'reading-publication-contract-test'),
  repeat('b', 64), 'older revision is no longer the current publication');
select is(public.get_member_reading_release('18200000-0000-4000-8000-000000000001',
  'reading-publication-contract-test', repeat('a', 64)) ->> 'status', 'missing',
  'old revision cannot be delivered after replacement');
select is(public.get_member_reading_release('18200000-0000-4000-8000-000000000001',
  'reading-publication-contract-test', repeat('b', 64)) -> 'payload' ->> 'body', 'private fixture b',
  'new exact revision can be delivered');
select public.retire_reading_item('reading-publication-contract-test');
select ok(not (select available from public.reading_publication where item_id = 'reading-publication-contract-test'),
  'retirement makes the current publication unavailable');
select is(public.get_member_reading_release('18200000-0000-4000-8000-000000000001',
  'reading-publication-contract-test', repeat('b', 64)) ->> 'status', 'missing',
  'retired current revision cannot be delivered');
reset role;

select * from finish();
rollback;
