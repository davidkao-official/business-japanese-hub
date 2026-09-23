-- Unknown legacy start identity keeps a touched stream fail-closed.
begin;

select plan(9);

insert into auth.users (id, aud, role)
values ('50000000-0000-0000-0000-000000000320','authenticated','authenticated');

select is(public.record_plus_membership_event(
  'source-legacy','customer-320','subscription-320','pending-320',
  '50000000-0000-0000-0000-000000000320','plus_early_access_monthly',
  'membership_pending','2026-09-01','2026-09-01','2026-10-01'
),'stale','pending establishes a source binding without membership access');

-- Represent pre-reducer immutable audit evidence: its proof version is NULL.
insert into public.plus_membership_event (
  event_id, source_system, source_customer_id, source_subscription_id,
  source_event_id, user_id, plan_code, event_type, occurred_at,
  period_start, period_end, membership_status, plan_active_when_observed,
  activation_eligible_when_observed, reducer_version
) values (
  'legacy-event-320','source-legacy','customer-320','subscription-320',
  'legacy-start-320','50000000-0000-0000-0000-000000000320',
  'plus_early_access_monthly','membership_started','2026-08-31',
  '2026-08-31','2026-09-30','active',true,true,null
);

select is(public.record_plus_membership_event(
  'source-legacy','customer-320','subscription-320','new-start-320',
  '50000000-0000-0000-0000-000000000320','plus_early_access_monthly',
  'membership_started','2026-09-02','2026-09-02','2026-10-02'
),'stale','new start cannot qualify an ambiguous legacy stream');
select is((select reducer_version from public.plus_membership_event where source_event_id='new-start-320'),1,'new start retains its immutable reducer receipt proof');
select is((select plan_active_when_observed from public.plus_membership_event where source_event_id='new-start-320'),true,'new start retains its immutable active-plan receipt fact');
select is((select count(*) from public.plus_membership_event where source_subscription_id='subscription-320' and event_type='membership_started'),2::bigint,'legacy and new start evidence both remain append-only');
select is((select qualified from public.plus_membership_stream_summary where source_subscription_id='subscription-320'),false,'legacy start ambiguity leaves stream unqualified');
select is((select conflicted from public.plus_membership_stream_summary where source_subscription_id='subscription-320'),false,'legacy ambiguity is not misreported as a two-new-start conflict');
select is((select count(*) from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000320'),0::bigint,'ambiguous stream creates no derived membership state');
select is((select count(*) from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000320'),0::bigint,'ambiguous stream creates no access projection');

select * from finish();
rollback;
