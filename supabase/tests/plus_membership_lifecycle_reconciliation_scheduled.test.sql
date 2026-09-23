-- Scheduled cancellation is a stream-local access cutoff, never a start grant.
begin;

select plan(17);

insert into auth.users (id, aud, role) values
 ('50000000-0000-0000-0000-000000000350','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000351','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000352','authenticated','authenticated');

update public.plus_membership_plan set active = true
where plan_code='plus_early_access_monthly';

-- Once active, scheduled cancellation clamps the stream and its access horizon.
select is(public.record_plus_membership_event(
  'schedule-source','customer-350','subscription-350','start-350',
  '50000000-0000-0000-0000-000000000350','plus_early_access_monthly',
  'membership_started',now()-interval '10 days',now()-interval '10 days',now()+interval '30 days'
),'applied','350 confirmed start selects the stream');
select is(public.record_plus_membership_event(
  'schedule-source','customer-350','subscription-350','cancel-350',
  '50000000-0000-0000-0000-000000000350','plus_early_access_monthly',
  'membership_canceled',now()-interval '5 days',now()-interval '10 days',now()+interval '10 days',true
),'applied','350 future cancellation applies');
select is((select terminal_at from public.plus_membership_stream_summary where source_subscription_id='subscription-350'),now()+interval '10 days','350 summary records its own future cutoff');
select is((select access_period_end from public.plus_membership_stream_summary where source_subscription_id='subscription-350'),now()+interval '10 days','350 summary clamps access at cutoff');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000350'),now()+interval '10 days','350 access projection uses the same cutoff');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000350'),'active','350 remains active only before its future cutoff');

-- A future scheduled cutoff received first is retained, then folded if the start precedes it.
select is(public.record_plus_membership_event(
  'schedule-source','customer-351','subscription-351','cancel-351',
  '50000000-0000-0000-0000-000000000351','plus_early_access_monthly',
  'membership_canceled',now()-interval '5 days',now()-interval '10 days',now()+interval '10 days',true
),'stale','351 terminal-only scheduled event has no access authority');
select is((select count(*) from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000351'),0::bigint,'351 scheduled terminal alone creates no access');
select is(public.record_plus_membership_event(
  'schedule-source','customer-351','subscription-351','start-351',
  '50000000-0000-0000-0000-000000000351','plus_early_access_monthly',
  'membership_started',now()-interval '10 days',now()-interval '10 days',now()+interval '30 days'
),'applied','351 delayed start before cutoff qualifies');
select is((select qualified from public.plus_membership_stream_summary where source_subscription_id='subscription-351'),true,'351 stream qualifies from its trusted start');
select is((select terminal_at from public.plus_membership_stream_summary where source_subscription_id='subscription-351'),now()+interval '10 days','351 fold retains prior scheduled cutoff');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000351'),now()+interval '10 days','351 access remains bounded by its scheduled cutoff');

-- A cutoff already at or before the effective start prevents admission.
select is(public.record_plus_membership_event(
  'schedule-source','customer-352','subscription-352','cancel-352',
  '50000000-0000-0000-0000-000000000352','plus_early_access_monthly',
  'membership_canceled',now()-interval '2 days',now()-interval '3 days',now()-interval '1 day',true
),'stale','352 elapsed schedule is audit only without a start');
select is(public.record_plus_membership_event(
  'schedule-source','customer-352','subscription-352','start-352',
  '50000000-0000-0000-0000-000000000352','plus_early_access_monthly',
  'membership_started',now(),now(),now()+interval '20 days'
),'stale','352 start at or after cutoff cannot qualify');
select is((select qualified from public.plus_membership_stream_summary where source_subscription_id='subscription-352'),false,'352 summary remains unqualified after elapsed cutoff');
select is((select count(*) from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000352'),0::bigint,'352 cutoff does not create state');
select is((select count(*) from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000352'),0::bigint,'352 cutoff does not grant access');

select * from finish();
rollback;
