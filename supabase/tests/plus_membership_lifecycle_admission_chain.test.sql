-- Delayed confirmation preserves chronological plan admission and terminal authority.
begin;

select plan(90);

insert into auth.users (id, aud, role) values
  ('50000000-0000-0000-0000-000000000650', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000651', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000652', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000653', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000654', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000655', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000656', 'authenticated', 'authenticated');

update public.plus_membership_plan
set active = true
where plan_code in ('plus_early_access_monthly', 'plus_standard_monthly');

-- No-state follow-up evidence cannot establish first admission. It remains
-- pending, with trusted receipt proof retained, until the older started event
-- arrives. The fold then selects the started stream and applies the buffered
-- same-plan horizon.
select is(public.record_plus_membership_event(
  'source-chain','customer-650','subscription-650',
  'reactivate-650','50000000-0000-0000-0000-000000000650',
  'plus_early_access_monthly','membership_reactivated',
  now() - interval '15 days', now() - interval '15 days',
  now() + interval '45 days'
), 'applied', 'reactivated-first is durably accepted as pending evidence');
select is((select plan_active_when_observed
           from public.plus_membership_event
           where source_system = 'source-chain'
             and source_event_id = 'reactivate-650'), true,
          'reactivated-first stores active-plan receipt proof');
select is((select membership_status from public.plus_membership_state
           where user_id = '50000000-0000-0000-0000-000000000650'),
          'pending', 'reactivated-first keeps the no-state reducer pending');
select is((select membership_status from public.plus_membership_access
           where user_id = '50000000-0000-0000-0000-000000000650'),
          'pending', 'reactivated-first grants no access before confirmation');
select is((select admitted_at from public.plus_membership_subscription
           where source_subscription_id = 'subscription-650'), null,
          'reactivated-first leaves the stream unadmitted');
select is(public.record_plus_membership_event(
  'source-chain','customer-650','subscription-650',
  'start-650','50000000-0000-0000-0000-000000000650',
  'plus_early_access_monthly','membership_started',
  now() - interval '20 days', now() - interval '20 days',
  now() + interval '40 days'
), 'applied', 'older start confirms the reactivated-first stream');
select is((select plan_active_when_observed
           from public.plus_membership_event
           where source_system = 'source-chain'
             and source_event_id = 'start-650'), true,
          'reactivated-first start stores active-plan receipt proof');
select is((select membership_status from public.plus_membership_state
           where user_id = '50000000-0000-0000-0000-000000000650'),
          'active', 'reactivated-first folds to active');
select is((select membership_status from public.plus_membership_access
           where user_id = '50000000-0000-0000-0000-000000000650'),
          'active', 'reactivated-first projects active access after confirmation');
select is((select current_period_end from public.plus_membership_access
           where user_id = '50000000-0000-0000-0000-000000000650'),
          now() + interval '45 days',
          'reactivated-first fold keeps the later reactivation horizon');
select is((select admitted_plan_code from public.plus_membership_subscription
           where source_subscription_id = 'subscription-650'),
          'plus_early_access_monthly',
          'reactivated-first records the exact admitted plan');
select is((select admitted_at from public.plus_membership_subscription
           where source_subscription_id = 'subscription-650'),
          now() - interval '20 days',
          'reactivated-first admission time is the confirming start');
select is((select event_type from public.plus_membership_event e
           join public.plus_membership_state s on s.applied_event_id = e.event_id
           where s.user_id = '50000000-0000-0000-0000-000000000650'),
          'membership_reactivated',
          'reactivated-first applied marker identifies the folded lifecycle event');

select is(public.record_plus_membership_event(
  'source-chain','customer-651','subscription-651',
  'restore-651','50000000-0000-0000-0000-000000000651',
  'plus_early_access_monthly','membership_restored',
  now() - interval '15 days', now() - interval '15 days',
  now() + interval '45 days'
), 'applied', 'restored-first is durably accepted as pending evidence');
select is((select plan_active_when_observed
           from public.plus_membership_event
           where source_system = 'source-chain'
             and source_event_id = 'restore-651'), true,
          'restored-first stores active-plan receipt proof');
select is((select membership_status from public.plus_membership_state
           where user_id = '50000000-0000-0000-0000-000000000651'),
          'pending', 'restored-first keeps the no-state reducer pending');
select is((select membership_status from public.plus_membership_access
           where user_id = '50000000-0000-0000-0000-000000000651'),
          'pending', 'restored-first grants no access before confirmation');
select is((select admitted_at from public.plus_membership_subscription
           where source_subscription_id = 'subscription-651'), null,
          'restored-first leaves the stream unadmitted');
select is(public.record_plus_membership_event(
  'source-chain','customer-651','subscription-651',
  'start-651','50000000-0000-0000-0000-000000000651',
  'plus_early_access_monthly','membership_started',
  now() - interval '20 days', now() - interval '20 days',
  now() + interval '40 days'
), 'applied', 'older start confirms the restored-first stream');
select is((select plan_active_when_observed
           from public.plus_membership_event
           where source_system = 'source-chain'
             and source_event_id = 'start-651'), true,
          'restored-first start stores active-plan receipt proof');
select is((select membership_status from public.plus_membership_state
           where user_id = '50000000-0000-0000-0000-000000000651'),
          'active', 'restored-first folds to active');
select is((select membership_status from public.plus_membership_access
           where user_id = '50000000-0000-0000-0000-000000000651'),
          'active', 'restored-first projects active access after confirmation');
select is((select current_period_end from public.plus_membership_access
           where user_id = '50000000-0000-0000-0000-000000000651'),
          now() + interval '45 days',
          'restored-first fold keeps the later restoration horizon');
select is((select admitted_plan_code from public.plus_membership_subscription
           where source_subscription_id = 'subscription-651'),
          'plus_early_access_monthly',
          'restored-first records the exact admitted plan');
select is((select admitted_at from public.plus_membership_subscription
           where source_subscription_id = 'subscription-651'),
          now() - interval '20 days',
          'restored-first admission time is the confirming start');
select is((select event_type from public.plus_membership_event e
           join public.plus_membership_state s on s.applied_event_id = e.event_id
           where s.user_id = '50000000-0000-0000-0000-000000000651'),
          'membership_restored',
          'restored-first applied marker identifies the folded lifecycle event');

-- A is current. C's Standard renewal and future period-end cancellation are
-- received while C is unadmitted. After Standard closes, an older EA start
-- must fold the true-at-receipt Standard renewal before its future cutoff.
-- The reverse delivery order must converge to the same semantic state.
select is(public.record_plus_membership_event(
  'source-chain','customer-652','subscription-652-a',
  'start-652-a','50000000-0000-0000-0000-000000000652',
  'plus_early_access_monthly','membership_started',
  now() - interval '30 days', now() - interval '30 days',
  now() + interval '30 days'
), 'applied', 'forward comparator starts current A');
select is(public.record_plus_membership_event(
  'source-chain','customer-652','subscription-652-c',
  'renew-652-c-standard','50000000-0000-0000-0000-000000000652',
  'plus_standard_monthly','membership_renewed',
  now() - interval '15 days', now() - interval '15 days',
  now() + interval '45 days'
), 'stale', 'forward comparator retains C Standard renewal as buffered evidence');
select is((select plan_active_when_observed from public.plus_membership_event
           where source_system = 'source-chain'
             and source_event_id = 'renew-652-c-standard'), true,
          'forward comparator Standard renewal stores receipt proof');
select is(public.record_plus_membership_event(
  'source-chain','customer-652','subscription-652-c',
  'cancel-652-c-standard','50000000-0000-0000-0000-000000000652',
  'plus_standard_monthly','membership_canceled',
  now() - interval '10 days', now() - interval '15 days',
  now() + interval '20 days', true
), 'stale', 'forward comparator retains future Standard cutoff');
select is((select plan_active_when_observed from public.plus_membership_event
           where source_system = 'source-chain'
             and source_event_id = 'cancel-652-c-standard'), true,
          'forward comparator cancellation stores receipt proof');
select is((select active from public.plus_membership_plan
           where plan_code = 'plus_standard_monthly'), true,
          'forward comparator closes Standard only after both receipts');
update public.plus_membership_plan set active = false
where plan_code = 'plus_standard_monthly';
select is((select active from public.plus_membership_plan
           where plan_code = 'plus_standard_monthly'), false,
          'forward comparator Standard is closed before confirmation');
select is(public.record_plus_membership_event(
  'source-chain','customer-652','subscription-652-c',
  'start-652-c-ea','50000000-0000-0000-0000-000000000652',
  'plus_early_access_monthly','membership_started',
  now() - interval '20 days', now() - interval '20 days',
  now() + interval '40 days'
), 'applied', 'forward comparator accepts the older EA confirmation');
select is((select plan_active_when_observed from public.plus_membership_event
           where source_system = 'source-chain'
             and source_event_id = 'start-652-c-ea'), true,
          'forward comparator EA start stores receipt proof');
select is((select plan_code from public.plus_membership_state
           where user_id = '50000000-0000-0000-0000-000000000652'),
          'plus_standard_monthly',
          'forward comparator folds the chronological Standard renewal marker');
select is((select membership_status from public.plus_membership_state
           where user_id = '50000000-0000-0000-0000-000000000652'),
          'active', 'forward comparator remains active before Standard cutoff');
select is((select membership_status from public.plus_membership_access
           where user_id = '50000000-0000-0000-0000-000000000652'),
          'active', 'forward comparator preserves active access before cutoff');
select is((select current_period_end from public.plus_membership_access
           where user_id = '50000000-0000-0000-0000-000000000652'),
          now() + interval '20 days',
          'forward comparator clamps access to the Standard cutoff');
select is((select admitted_plan_code from public.plus_membership_subscription
           where source_subscription_id = 'subscription-652-c'),
          'plus_standard_monthly',
          'forward comparator records the Standard admission marker');
select is((select admitted_at from public.plus_membership_subscription
           where source_subscription_id = 'subscription-652-c'),
          now() - interval '15 days',
          'forward comparator admission marker uses the renewal occurrence');
select is((select terminal_at from public.plus_membership_subscription
           where source_subscription_id = 'subscription-652-c'),
          now() + interval '20 days',
          'forward comparator retains the future Standard cutoff');
select is((select event_type from public.plus_membership_event e
           join public.plus_membership_subscription s
             on s.terminal_event_id = e.event_id
           where s.source_subscription_id = 'subscription-652-c'),
          'membership_canceled',
          'forward comparator keeps cancellation as terminal authority');
select is((select event_type from public.plus_membership_event e
           join public.plus_membership_state s on s.applied_event_id = e.event_id
           where s.user_id = '50000000-0000-0000-0000-000000000652'),
          'membership_canceled',
          'forward comparator applied marker includes exact-plan scheduled cancellation');

select is(public.record_plus_membership_event(
  'source-chain','customer-653','subscription-653-a',
  'start-653-a','50000000-0000-0000-0000-000000000653',
  'plus_early_access_monthly','membership_started',
  now() - interval '30 days', now() - interval '30 days',
  now() + interval '30 days'
), 'applied', 'reverse comparator starts current A');
update public.plus_membership_plan set active = true
where plan_code = 'plus_standard_monthly';
select is(public.record_plus_membership_event(
  'source-chain','customer-653','subscription-653-c',
  'cancel-653-c-standard','50000000-0000-0000-0000-000000000653',
  'plus_standard_monthly','membership_canceled',
  now() - interval '10 days', now() - interval '15 days',
  now() + interval '20 days', true
), 'stale', 'reverse comparator receives the future cutoff first');
select is(public.record_plus_membership_event(
  'source-chain','customer-653','subscription-653-c',
  'renew-653-c-standard','50000000-0000-0000-0000-000000000653',
  'plus_standard_monthly','membership_renewed',
  now() - interval '15 days', now() - interval '15 days',
  now() + interval '45 days'
), 'stale', 'reverse comparator receives the earlier renewal second');
update public.plus_membership_plan set active = false
where plan_code = 'plus_standard_monthly';
select is((select plan_active_when_observed from public.plus_membership_event
           where source_system = 'source-chain'
             and source_event_id = 'renew-653-c-standard'), true,
          'reverse comparator renewal stores receipt proof');
select is((select plan_active_when_observed from public.plus_membership_event
           where source_system = 'source-chain'
             and source_event_id = 'cancel-653-c-standard'), true,
          'reverse comparator cancellation stores receipt proof');
select is(public.record_plus_membership_event(
  'source-chain','customer-653','subscription-653-c',
  'start-653-c-ea','50000000-0000-0000-0000-000000000653',
  'plus_early_access_monthly','membership_started',
  now() - interval '20 days', now() - interval '20 days',
  now() + interval '40 days'
), 'applied', 'reverse comparator accepts the older EA confirmation');
select is((select plan_code from public.plus_membership_state
           where user_id = '50000000-0000-0000-0000-000000000653'),
          'plus_standard_monthly',
          'reverse comparator folds the same Standard renewal marker');
select is((select membership_status from public.plus_membership_state
           where user_id = '50000000-0000-0000-0000-000000000653'),
          'active', 'reverse comparator remains active before Standard cutoff');
select is((select membership_status from public.plus_membership_access
           where user_id = '50000000-0000-0000-0000-000000000653'),
          'active', 'reverse comparator preserves active access before cutoff');
select is((select current_period_end from public.plus_membership_access
           where user_id = '50000000-0000-0000-0000-000000000653'),
          now() + interval '20 days',
          'reverse comparator clamps access to the same Standard cutoff');
select is((select admitted_plan_code from public.plus_membership_subscription
           where source_subscription_id = 'subscription-653-c'),
          'plus_standard_monthly',
          'reverse comparator records the Standard admission marker');
select is((select admitted_at from public.plus_membership_subscription
           where source_subscription_id = 'subscription-653-c'),
          now() - interval '15 days',
          'reverse comparator admission marker uses the renewal occurrence');
select is((select terminal_at from public.plus_membership_subscription
           where source_subscription_id = 'subscription-653-c'),
          now() + interval '20 days',
          'reverse comparator retains the same future cutoff');
select is((select event_type from public.plus_membership_event e
           join public.plus_membership_state s on s.applied_event_id = e.event_id
           where s.user_id = '50000000-0000-0000-0000-000000000653'),
          'membership_canceled',
          'reverse comparator applied marker includes exact-plan scheduled cancellation');

select is((select plan_code from public.plus_membership_state
           where user_id = '50000000-0000-0000-0000-000000000652'),
          (select plan_code from public.plus_membership_state
           where user_id = '50000000-0000-0000-0000-000000000653'),
          'delivery permutations converge on the same plan marker');
select is((select membership_status from public.plus_membership_state
           where user_id = '50000000-0000-0000-0000-000000000652'),
          (select membership_status from public.plus_membership_state
           where user_id = '50000000-0000-0000-0000-000000000653'),
          'delivery permutations converge on the same state status');
select is((select membership_status from public.plus_membership_access
           where user_id = '50000000-0000-0000-0000-000000000652'),
          (select membership_status from public.plus_membership_access
           where user_id = '50000000-0000-0000-0000-000000000653'),
          'delivery permutations converge on the same access status');
select is((select current_period_end from public.plus_membership_access
           where user_id = '50000000-0000-0000-0000-000000000652'),
          (select current_period_end from public.plus_membership_access
           where user_id = '50000000-0000-0000-0000-000000000653'),
          'delivery permutations converge on the same access horizon');
select is((select admitted_plan_code from public.plus_membership_subscription
           where source_subscription_id = 'subscription-652-c'),
          (select admitted_plan_code from public.plus_membership_subscription
           where source_subscription_id = 'subscription-653-c'),
          'delivery permutations converge on the same admitted plan');
select is((select admitted_at from public.plus_membership_subscription
           where source_subscription_id = 'subscription-652-c'),
          (select admitted_at from public.plus_membership_subscription
           where source_subscription_id = 'subscription-653-c'),
          'delivery permutations converge on the same admission time');
select is((select terminal_at from public.plus_membership_subscription
           where source_subscription_id = 'subscription-652-c'),
          (select terminal_at from public.plus_membership_subscription
           where source_subscription_id = 'subscription-653-c'),
          'delivery permutations converge on the same terminal cutoff');
select is((select e.event_type from public.plus_membership_event e
           join public.plus_membership_state s on s.applied_event_id = e.event_id
           where s.user_id = '50000000-0000-0000-0000-000000000652'),
          (select e.event_type from public.plus_membership_event e
           join public.plus_membership_state s on s.applied_event_id = e.event_id
           where s.user_id = '50000000-0000-0000-0000-000000000653'),
          'delivery permutations converge on the same applied event type');

-- Unknown receipt provenance is fail-closed. A manually seeded changed-plan
-- event with NULL proof must not be allowed to establish Standard when an EA
-- confirmation folds it: raise and preserve A without creating admission.
select is(public.record_plus_membership_event(
  'source-chain','customer-654','subscription-654-a',
  'start-654-a','50000000-0000-0000-0000-000000000654',
  'plus_early_access_monthly','membership_started',
  now() - interval '30 days', now() - interval '30 days',
  now() + interval '30 days'
), 'applied', 'NULL-proof fixture starts current A');
insert into public.plus_membership_subscription (
  source_system, source_customer_id, source_subscription_id, user_id
) values (
  'source-chain','customer-654','subscription-654-c',
  '50000000-0000-0000-0000-000000000654'
);
insert into public.plus_membership_event (
  event_id, source_system, source_customer_id, source_subscription_id,
  source_event_id, user_id, plan_code, event_type, occurred_at,
  period_start, period_end, membership_status, cancel_at_period_end,
  metadata, plan_active_when_observed
) values (
  'manual-null-event-654','source-chain','customer-654','subscription-654-c',
  'manual-null-renew-654','50000000-0000-0000-0000-000000000654',
  'plus_standard_monthly','membership_renewed',
  now() - interval '15 days', now() - interval '15 days',
  now() + interval '45 days', 'active', false, '{}'::jsonb, null
);
select is((select plan_active_when_observed from public.plus_membership_event
           where event_id = 'manual-null-event-654'), null,
          'NULL-proof fixture preserves unknown receipt provenance');
update public.plus_membership_plan set active = false
where plan_code = 'plus_standard_monthly';
select throws_ok($$select public.record_plus_membership_event(
  'source-chain','customer-654','subscription-654-c',
  'start-654-c-ea','50000000-0000-0000-0000-000000000654',
  'plus_early_access_monthly','membership_started',
  now() - interval '20 days', now() - interval '20 days',
  now() + interval '40 days'
)$$, 'P0001', 'plan plus_standard_monthly is not active for membership activation',
  'NULL-proof changed-plan evidence fails closed');
select is((select source_subscription_id from public.plus_membership_state
           where user_id = '50000000-0000-0000-0000-000000000654'),
          'subscription-654-a',
          'NULL-proof fold preserves the already-current stream');
select is((select plan_code from public.plus_membership_state
           where user_id = '50000000-0000-0000-0000-000000000654'),
          'plus_early_access_monthly',
          'NULL-proof fold never admits the changed Standard plan');
select is((select admitted_at from public.plus_membership_subscription
           where source_subscription_id = 'subscription-654-c'), null,
          'NULL-proof changed stream remains unadmitted');

-- Immediate terminal evidence dominates a later active event on the same
-- successor stream. The current A stream remains current and active.
update public.plus_membership_plan set active = true
where plan_code = 'plus_early_access_monthly';
select is(public.record_plus_membership_event(
  'source-chain','customer-655','subscription-655-a',
  'start-655-a','50000000-0000-0000-0000-000000000655',
  'plus_early_access_monthly','membership_started',
  now() - interval '30 days', now() - interval '30 days',
  now() + interval '30 days'
), 'applied', 'immediate-terminal fixture starts current A');
select is(public.record_plus_membership_event(
  'source-chain','customer-655','subscription-655-c',
  'revoke-655-c','50000000-0000-0000-0000-000000000655',
  'plus_early_access_monthly','membership_revoked',
  now() - interval '5 days', now() - interval '10 days',
  now() + interval '20 days'
), 'stale', 'immediate-terminal fixture buffers terminal C');
select is((select plan_active_when_observed from public.plus_membership_event
           where source_event_id = 'revoke-655-c'), true,
          'immediate terminal stores receipt proof');
select lives_ok($$select public.record_plus_membership_event(
  'source-chain','customer-655','subscription-655-c',
  'start-655-c-later','50000000-0000-0000-0000-000000000655',
  'plus_early_access_monthly','membership_started',
  now() - interval '2 days', now() - interval '2 days',
  now() + interval '28 days'
)$$, 'later active event after immediate terminal is safely rejected');
select is((select plan_active_when_observed from public.plus_membership_event
           where source_event_id = 'start-655-c-later'), true,
          'later active event stores receipt proof before rejection');
select is((select source_subscription_id from public.plus_membership_state
           where user_id = '50000000-0000-0000-0000-000000000655'),
          'subscription-655-a',
          'immediate terminal leaves current A selected');
select is((select membership_status from public.plus_membership_access
           where user_id = '50000000-0000-0000-0000-000000000655'),
          'active', 'immediate terminal does not remove current A access');
select is((select retired_at is not null from public.plus_membership_subscription
           where source_subscription_id = 'subscription-655-c'), true,
          'immediate terminal retires C');
select is((select event_type from public.plus_membership_event e
           join public.plus_membership_subscription s
             on s.retired_event_id = e.event_id
           where s.source_subscription_id = 'subscription-655-c'),
          'membership_revoked',
          'immediate terminal remains C retirement authority');

-- A scheduled cutoff already reached at receipt also dominates a later active
-- event: C cannot become current or regrant access after the cutoff.
select is(public.record_plus_membership_event(
  'source-chain','customer-656','subscription-656-a',
  'start-656-a','50000000-0000-0000-0000-000000000656',
  'plus_early_access_monthly','membership_started',
  now() - interval '30 days', now() - interval '30 days',
  now() + interval '30 days'
), 'applied', 'elapsed-cutoff fixture starts current A');
select is(public.record_plus_membership_event(
  'source-chain','customer-656','subscription-656-c',
  'cancel-656-c-elapsed','50000000-0000-0000-0000-000000000656',
  'plus_early_access_monthly','membership_canceled',
  now() - interval '5 days', now() - interval '10 days',
  now() - interval '1 day', true
), 'stale', 'elapsed cutoff retires C before confirmation');
select is((select plan_active_when_observed from public.plus_membership_event
           where source_event_id = 'cancel-656-c-elapsed'), true,
          'elapsed cutoff stores receipt proof');
select lives_ok($$select public.record_plus_membership_event(
  'source-chain','customer-656','subscription-656-c',
  'start-656-c-later','50000000-0000-0000-0000-000000000656',
  'plus_early_access_monthly','membership_started',
  now() - interval '12 hours', now() - interval '12 hours',
  now() + interval '30 days'
)$$, 'later active event after elapsed cutoff is safely rejected');
select is((select plan_active_when_observed from public.plus_membership_event
           where source_event_id = 'start-656-c-later'), true,
          'elapsed later active event stores receipt proof');
select is((select source_subscription_id from public.plus_membership_state
           where user_id = '50000000-0000-0000-0000-000000000656'),
          'subscription-656-a',
          'elapsed cutoff leaves current A selected');
select is((select membership_status from public.plus_membership_access
           where user_id = '50000000-0000-0000-0000-000000000656'),
          'active', 'elapsed cutoff does not regrant C over current A');
select is((select retired_at is not null from public.plus_membership_subscription
           where source_subscription_id = 'subscription-656-c'), true,
          'elapsed cutoff retires C before later active evidence');
select is((select terminal_at from public.plus_membership_subscription
           where source_subscription_id = 'subscription-656-c'),
          now() - interval '1 day',
          'elapsed cutoff remains the durable C terminal boundary');

update public.plus_membership_plan
set active = true
where plan_code in ('plus_early_access_monthly', 'plus_standard_monthly');

select * from finish();
rollback;
