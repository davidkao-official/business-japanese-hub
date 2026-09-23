-- The lifecycle bootstrap preflight rejects legacy evidence/projections and
-- leaves every row untouched. Production operators run the documented query
-- before the full migration chain; this fixture exercises the read-only guard.
begin;

select plan(12);

select is(
  (select currency || ':' || amount_minor::text || ':' || active::text from public.plus_membership_plan where plan_code='plus_early_access_monthly'),
  'TWD:29900:true',
  'Early Access remains TWD 299 per month and active'
);
select is(
  (select currency || ':' || amount_minor::text || ':' || active::text from public.plus_membership_plan where plan_code='plus_standard_monthly'),
  'TWD:39900:false',
  'Standard remains TWD 399 per month and inactive until approved'
);

select lives_ok(
  $$select public.assert_plus_membership_lifecycle_bootstrap_empty()$$,
  'empty lifecycle tables pass bootstrap preflight'
);

insert into auth.users (id, aud, role) values
 ('50000000-0000-0000-0000-000000000322','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000323','authenticated','authenticated');

insert into public.plus_membership_subscription (
  source_system, source_customer_id, source_subscription_id, user_id
) values ('legacy-source','legacy-customer-322','legacy-subscription-322','50000000-0000-0000-0000-000000000322');

insert into public.plus_membership_event (
  event_id, source_system, source_customer_id, source_subscription_id,
  source_event_id, user_id, plan_code, event_type, occurred_at,
  period_start, period_end, membership_status, plan_active_when_observed,
  activation_eligible_when_observed, reducer_version
) values (
  'legacy-event-322','legacy-source','legacy-customer-322','legacy-subscription-322',
  'legacy-start-322','50000000-0000-0000-0000-000000000322',
  'plus_early_access_monthly','membership_started','2026-09-01',
  '2026-09-01','2026-10-01','active',true,true,null
);

insert into public.plus_membership_state (
  user_id, plan_code, membership_status, period_start, period_end,
  source_system, source_customer_id, source_subscription_id,
  cancel_at_period_end, last_event_occurred_at, last_event_id,
  applied_event_occurred_at, applied_event_id, updated_at
) values (
  '50000000-0000-0000-0000-000000000322','plus_early_access_monthly','active',
  '2026-09-01','2026-10-01','legacy-source','legacy-customer-322',
  'legacy-subscription-322',false,'2026-09-01','legacy-event-322',
  '2026-09-01','legacy-event-322',now()
);

select throws_ok(
  $$select public.assert_plus_membership_lifecycle_bootstrap_empty()$$,
  'P0001',
  'Plus membership lifecycle bootstrap requires empty lifecycle tables',
  'legacy event, binding, and state fail the bootstrap preflight'
);
select is((select count(*) from public.plus_membership_subscription where source_subscription_id='legacy-subscription-322'),1::bigint,'legacy binding is preserved');
select is((select count(*) from public.plus_membership_event where event_id='legacy-event-322'),1::bigint,'legacy event is preserved');
select is((select count(*) from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000322'),1::bigint,'legacy state is preserved');
select is((select count(*) from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000322'),0::bigint,'event fixture has no access row to remove');

insert into public.plus_membership_access (
  user_id, membership_status, current_period_start, current_period_end
) values (
  '50000000-0000-0000-0000-000000000323','active','2026-09-01','2026-10-01'
);

select throws_ok(
  $$select public.assert_plus_membership_lifecycle_bootstrap_empty()$$,
  'P0001',
  'Plus membership lifecycle bootstrap requires empty lifecycle tables',
  'projection-only data also fails the bootstrap preflight'
);
select is((select count(*) from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000323'),1::bigint,'projection-only row is preserved');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000323'),'active','projection-only status is preserved');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000323'),'2026-10-01'::timestamptz,'projection-only horizon is preserved');

select * from finish();
rollback;
