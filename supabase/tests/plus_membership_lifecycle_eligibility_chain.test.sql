-- Receipt eligibility survives catalog closure; only a valid start admits access.
begin;

select plan(35);

insert into auth.users (id, aud, role) values
  ('50000000-0000-0000-0000-000000000680', 'authenticated', 'authenticated');

update public.plus_membership_plan
set active = true
where plan_code in ('plus_early_access_monthly', 'plus_standard_monthly');

-- The first Standard renewal is received while Standard is catalog-active. It
-- is eligible buffered evidence, but cannot create first admission or access.
select lives_ok($$select public.record_plus_membership_event(
  'source-eligibility','customer-680','subscription-680',
  'renew-680-standard-first','50000000-0000-0000-0000-000000000680',
  'plus_standard_monthly','membership_renewed',
  now() - interval '20 days', now() - interval '20 days',
  now() + interval '45 days'
)$$, 'first Standard renewal is accepted as buffered evidence');
select is((select plan_active_when_observed from public.plus_membership_event
           where source_event_id = 'renew-680-standard-first'), true,
          'first Standard renewal records active catalog receipt');
select is((select activation_eligible_when_observed from public.plus_membership_event
           where source_event_id = 'renew-680-standard-first'), true,
          'first Standard renewal records trusted activation eligibility');
select is((select membership_status from public.plus_membership_state
           where user_id = '50000000-0000-0000-0000-000000000680'),
          'pending', 'first Standard renewal leaves the unadmitted stream pending');
select is((select membership_status from public.plus_membership_access
           where user_id = '50000000-0000-0000-0000-000000000680'),
          'pending', 'first Standard renewal grants no access before start');
select ok((select admitted_at is null and admitted_plan_code is null
           from public.plus_membership_subscription
           where source_subscription_id = 'subscription-680'),
          'first Standard renewal leaves admission markers null');

-- Catalog closure must not erase the earlier eligible candidate. The later
-- same-plan renewal is received while catalog-inactive but is accepted because
-- the earlier same-stream Standard evidence is already eligible. It still
-- cannot grant access before the older EA start.
update public.plus_membership_plan
set active = false
where plan_code = 'plus_standard_monthly';
select is((select active from public.plus_membership_plan
           where plan_code = 'plus_standard_monthly'), false,
          'Standard closes before the later renewal is received');
select lives_ok($$select public.record_plus_membership_event(
  'source-eligibility','customer-680','subscription-680',
  'renew-680-standard-later','50000000-0000-0000-0000-000000000680',
  'plus_standard_monthly','membership_renewed',
  now() - interval '15 days', now() - interval '15 days',
  now() + interval '60 days'
)$$, 'later same-plan renewal is accepted after catalog closure');
select is((select plan_active_when_observed from public.plus_membership_event
           where source_event_id = 'renew-680-standard-later'), false,
          'later Standard renewal records closed-catalog receipt');
select is((select activation_eligible_when_observed from public.plus_membership_event
           where source_event_id = 'renew-680-standard-later'), true,
          'later Standard renewal inherits earlier same-plan eligibility');
select is((select count(*) from public.plus_membership_event
           where source_subscription_id = 'subscription-680'), 2::bigint,
          'both Standard renewals remain durable buffered facts');
select is((select membership_status from public.plus_membership_state
           where user_id = '50000000-0000-0000-0000-000000000680'),
          'pending', 'later eligible renewal remains pending before start');
select is((select membership_status from public.plus_membership_access
           where user_id = '50000000-0000-0000-0000-000000000680'),
          'pending', 'later eligible renewal still grants no access before start');
select ok((select admitted_at is null and admitted_plan_code is null
           from public.plus_membership_subscription
           where source_subscription_id = 'subscription-680'),
          'later eligible renewal cannot create first admission');

-- The older EA start is the first actual admission. Its fold processes the
-- eligible Standard events in event-time order and leaves the longer second
-- Standard horizon as the final applied projection.
select is(public.record_plus_membership_event(
  'source-eligibility','customer-680','subscription-680',
  'start-680-ea','50000000-0000-0000-0000-000000000680',
  'plus_early_access_monthly','membership_started',
  now() - interval '25 days', now() - interval '25 days',
  now() + interval '40 days'
), 'applied', 'older EA start confirms the buffered eligibility chain');
select is((select plan_active_when_observed from public.plus_membership_event
           where source_event_id = 'start-680-ea'), true,
          'EA start records active catalog receipt');
select is((select activation_eligible_when_observed from public.plus_membership_event
           where source_event_id = 'start-680-ea'), true,
          'EA start records trusted activation eligibility');
select is((select source_subscription_id from public.plus_membership_state
           where user_id = '50000000-0000-0000-0000-000000000680'),
          'subscription-680',
          'eligibility-chain start selects the buffered stream');
select is((select plan_code from public.plus_membership_state
           where user_id = '50000000-0000-0000-0000-000000000680'),
          'plus_standard_monthly',
          'eligibility-chain fold advances to Standard');
select is((select membership_status from public.plus_membership_state
           where user_id = '50000000-0000-0000-0000-000000000680'),
          'active', 'eligibility-chain fold ends active');
select is((select period_end from public.plus_membership_state
           where user_id = '50000000-0000-0000-0000-000000000680'),
          now() + interval '60 days',
          'eligibility-chain state keeps the later Standard horizon');
select is((select membership_status from public.plus_membership_access
           where user_id = '50000000-0000-0000-0000-000000000680'),
          'active', 'eligibility-chain grants access only after actual start');
select is((select current_period_end from public.plus_membership_access
           where user_id = '50000000-0000-0000-0000-000000000680'),
          now() + interval '60 days',
          'eligibility-chain access keeps the later Standard horizon');
select is((select admitted_plan_code from public.plus_membership_subscription
           where source_subscription_id = 'subscription-680'),
          'plus_standard_monthly',
          'eligibility-chain records the exact Standard admission marker');
select is((select admitted_at from public.plus_membership_subscription
           where source_subscription_id = 'subscription-680'),
          now() - interval '20 days',
          'eligibility-chain admission starts at the first eligible Standard event');
select is((select event_type from public.plus_membership_event e
           join public.plus_membership_state s on s.applied_event_id = e.event_id
           where s.user_id = '50000000-0000-0000-0000-000000000680'),
          'membership_renewed',
          'eligibility-chain applied marker is the later Standard renewal');
select is((select applied_event_occurred_at from public.plus_membership_state
           where user_id = '50000000-0000-0000-0000-000000000680'),
          now() - interval '15 days',
          'eligibility-chain applied timestamp is the later renewal');
select is((select last_event_occurred_at from public.plus_membership_state
           where user_id = '50000000-0000-0000-0000-000000000680'),
          now() - interval '15 days',
          'eligibility-chain observed watermark reaches the later renewal');

-- Once admitted, switching away ends eligibility inherited from old receipts.
-- A closed former plan cannot be re-entered through its historical candidate.
select is(public.record_plus_membership_event(
  'source-eligibility','customer-680','subscription-680',
  'renew-680-back-ea','50000000-0000-0000-0000-000000000680',
  'plus_early_access_monthly','membership_renewed',
  now() - interval '10 days', now() - interval '10 days', now() + interval '65 days'
), 'applied', 'admitted stream may switch back to active EA');
select is((select admitted_plan_code from public.plus_membership_subscription
  where source_subscription_id = 'subscription-680'), 'plus_early_access_monthly',
  'active EA switch replaces the exact admission marker');
select throws_ok($$select public.record_plus_membership_event(
  'source-eligibility','customer-680','subscription-680',
  'renew-680-closed-standard','50000000-0000-0000-0000-000000000680',
  'plus_standard_monthly','membership_renewed',
  now() - interval '5 days', now() - interval '5 days', now() + interval '70 days'
)$$, 'P0001', 'plan plus_standard_monthly is not active for membership activation',
  'historical eligible receipts cannot re-enter a closed former plan');
select is((select count(*) from public.plus_membership_event
  where source_event_id = 'renew-680-closed-standard'), 0::bigint,
  'rejected closed-plan transition creates no event');
select is((select plan_code from public.plus_membership_state
  where user_id = '50000000-0000-0000-0000-000000000680'), 'plus_early_access_monthly',
  'rejected closed-plan transition preserves EA state');
select is((select admitted_plan_code from public.plus_membership_subscription
  where source_subscription_id = 'subscription-680'), 'plus_early_access_monthly',
  'rejected closed-plan transition preserves EA admission');
select is((select current_period_end from public.plus_membership_access
  where user_id = '50000000-0000-0000-0000-000000000680'), now() + interval '65 days',
  'rejected closed-plan transition cannot extend access');

update public.plus_membership_plan
set active = true
where plan_code in ('plus_early_access_monthly', 'plus_standard_monthly');

select * from finish();
rollback;
