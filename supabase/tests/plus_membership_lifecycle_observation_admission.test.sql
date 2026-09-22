-- Expected semantics:
--   * last_event_* retains the greatest observed key, while applied_event_*
--     records the reducer authority; a stale pending event cannot block a later
--     renewal or payment failure that is semantically applicable;
--   * pre-start renewal/failure leaves state and access pending until a real
--     membership_started event makes the stream current;
--   * a buffered Standard renewal received while Standard was active remains
--     accepted if Standard closes before a prior EA start folds it;
--   * receipt-time plan activity is immutable: true-at-receipt evidence remains
--     valid after closure, false-at-receipt evidence cannot be upgraded.

begin;

select plan(122);

insert into auth.users (id, aud, role) values
  ('50000000-0000-0000-0000-000000000600', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000601', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000602', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000603', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000604', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000605', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000606', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000607', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000608', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000609', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000610', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000611', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000612', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000614', 'authenticated', 'authenticated');

update public.plus_membership_plan
set active = true
where plan_code in ('plus_early_access_monthly', 'plus_standard_monthly');

-- P1-A: six delivery permutations of start t10/end t30, pending t20,
-- and renewal t15/end t60. `last_event_*` is observed evidence and remains
-- pending t20; `applied_event_*` is reducer authority and converges on renewal
-- t15. A pre-start renewal leaves the projection pending until start arrives.
-- Fixture 600: start -> pending -> renew
select is(public.record_plus_membership_event(
  'source-a','customer-600','subscription-600','start-600',
  '50000000-0000-0000-0000-000000000600','plus_early_access_monthly',
  'membership_started',now() - interval '20 days',now() - interval '20 days',now() + interval '10 days'
),'applied','#165 observed/applied permutation 600 start returns applied');
select is(public.record_plus_membership_event(
  'source-a','customer-600','subscription-600','pending-600',
  '50000000-0000-0000-0000-000000000600','plus_early_access_monthly',
  'membership_pending',now() - interval '10 days',now() - interval '10 days',now() + interval '20 days'
),'stale','#165 observed/applied permutation 600 pending returns stale');
select is(public.record_plus_membership_event(
  'source-a','customer-600','subscription-600','renew-600',
  '50000000-0000-0000-0000-000000000600','plus_early_access_monthly',
  'membership_renewed',now() - interval '15 days',now() - interval '15 days',now() + interval '40 days'
),'applied','#165 observed/applied permutation 600 renew returns applied');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000600'),'active','#165 observed/applied permutation 600 converges on active state');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000600'),'active','#165 observed/applied permutation 600 grants active access only after start');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000600'),(select period_end from public.plus_membership_event where source_event_id='renew-600'),'#165 observed/applied permutation 600 converges on renewal horizon');
select is((select last_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000600'),(select event_id from public.plus_membership_event where source_event_id='pending-600'),'#165 observed/applied permutation 600 retains pending as observed watermark');
select is((select applied_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000600'),(select event_id from public.plus_membership_event where source_event_id='renew-600'),'#165 observed/applied permutation 600 records renewal as applied authority');
select is((select applied_event_occurred_at from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000600'),(select occurred_at from public.plus_membership_event where source_event_id='renew-600'),'#165 observed/applied permutation 600 records renewal applied time');
-- Fixture 601: start -> renew -> pending
select is(public.record_plus_membership_event(
  'source-a','customer-601','subscription-601','start-601',
  '50000000-0000-0000-0000-000000000601','plus_early_access_monthly',
  'membership_started',now() - interval '20 days',now() - interval '20 days',now() + interval '10 days'
),'applied','#165 observed/applied permutation 601 start returns applied');
select is(public.record_plus_membership_event(
  'source-a','customer-601','subscription-601','renew-601',
  '50000000-0000-0000-0000-000000000601','plus_early_access_monthly',
  'membership_renewed',now() - interval '15 days',now() - interval '15 days',now() + interval '40 days'
),'applied','#165 observed/applied permutation 601 renew returns applied');
select is(public.record_plus_membership_event(
  'source-a','customer-601','subscription-601','pending-601',
  '50000000-0000-0000-0000-000000000601','plus_early_access_monthly',
  'membership_pending',now() - interval '10 days',now() - interval '10 days',now() + interval '20 days'
),'stale','#165 observed/applied permutation 601 pending returns stale');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000601'),'active','#165 observed/applied permutation 601 converges on active state');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000601'),'active','#165 observed/applied permutation 601 grants active access only after start');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000601'),(select period_end from public.plus_membership_event where source_event_id='renew-601'),'#165 observed/applied permutation 601 converges on renewal horizon');
select is((select last_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000601'),(select event_id from public.plus_membership_event where source_event_id='pending-601'),'#165 observed/applied permutation 601 retains pending as observed watermark');
select is((select applied_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000601'),(select event_id from public.plus_membership_event where source_event_id='renew-601'),'#165 observed/applied permutation 601 records renewal as applied authority');
select is((select applied_event_occurred_at from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000601'),(select occurred_at from public.plus_membership_event where source_event_id='renew-601'),'#165 observed/applied permutation 601 records renewal applied time');
-- Fixture 602: pending -> start -> renew
select is(public.record_plus_membership_event(
  'source-a','customer-602','subscription-602','pending-602',
  '50000000-0000-0000-0000-000000000602','plus_early_access_monthly',
  'membership_pending',now() - interval '10 days',now() - interval '10 days',now() + interval '20 days'
),'applied','#165 observed/applied permutation 602 pending returns applied');
select is(public.record_plus_membership_event(
  'source-a','customer-602','subscription-602','start-602',
  '50000000-0000-0000-0000-000000000602','plus_early_access_monthly',
  'membership_started',now() - interval '20 days',now() - interval '20 days',now() + interval '10 days'
),'applied','#165 observed/applied permutation 602 start returns applied');
select is(public.record_plus_membership_event(
  'source-a','customer-602','subscription-602','renew-602',
  '50000000-0000-0000-0000-000000000602','plus_early_access_monthly',
  'membership_renewed',now() - interval '15 days',now() - interval '15 days',now() + interval '40 days'
),'applied','#165 observed/applied permutation 602 renew returns applied');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000602'),'active','#165 observed/applied permutation 602 converges on active state');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000602'),'active','#165 observed/applied permutation 602 grants active access only after start');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000602'),(select period_end from public.plus_membership_event where source_event_id='renew-602'),'#165 observed/applied permutation 602 converges on renewal horizon');
select is((select last_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000602'),(select event_id from public.plus_membership_event where source_event_id='pending-602'),'#165 observed/applied permutation 602 retains pending as observed watermark');
select is((select applied_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000602'),(select event_id from public.plus_membership_event where source_event_id='renew-602'),'#165 observed/applied permutation 602 records renewal as applied authority');
select is((select applied_event_occurred_at from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000602'),(select occurred_at from public.plus_membership_event where source_event_id='renew-602'),'#165 observed/applied permutation 602 records renewal applied time');
-- Fixture 603: pending -> renew -> start
select is(public.record_plus_membership_event(
  'source-a','customer-603','subscription-603','pending-603',
  '50000000-0000-0000-0000-000000000603','plus_early_access_monthly',
  'membership_pending',now() - interval '10 days',now() - interval '10 days',now() + interval '20 days'
),'applied','#165 observed/applied permutation 603 pending returns applied');
select is(public.record_plus_membership_event(
  'source-a','customer-603','subscription-603','renew-603',
  '50000000-0000-0000-0000-000000000603','plus_early_access_monthly',
  'membership_renewed',now() - interval '15 days',now() - interval '15 days',now() + interval '40 days'
),'stale','#165 observed/applied permutation 603 renewal buffers below pending');
select is(public.record_plus_membership_event(
  'source-a','customer-603','subscription-603','start-603',
  '50000000-0000-0000-0000-000000000603','plus_early_access_monthly',
  'membership_started',now() - interval '20 days',now() - interval '20 days',now() + interval '10 days'
),'applied','#165 observed/applied permutation 603 start returns applied');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000603'),'active','#165 observed/applied permutation 603 converges on active state');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000603'),'active','#165 observed/applied permutation 603 grants active access only after start');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000603'),(select period_end from public.plus_membership_event where source_event_id='renew-603'),'#165 observed/applied permutation 603 converges on renewal horizon');
select is((select last_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000603'),(select event_id from public.plus_membership_event where source_event_id='pending-603'),'#165 observed/applied permutation 603 retains pending as observed watermark');
select is((select applied_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000603'),(select event_id from public.plus_membership_event where source_event_id='renew-603'),'#165 observed/applied permutation 603 records renewal as applied authority');
select is((select applied_event_occurred_at from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000603'),(select occurred_at from public.plus_membership_event where source_event_id='renew-603'),'#165 observed/applied permutation 603 records renewal applied time');
-- Fixture 604: renew -> start -> pending
select is(public.record_plus_membership_event(
  'source-a','customer-604','subscription-604','renew-604',
  '50000000-0000-0000-0000-000000000604','plus_early_access_monthly',
  'membership_renewed',now() - interval '15 days',now() - interval '15 days',now() + interval '40 days'
),'applied','#165 observed/applied permutation 604 renew returns applied');
select is(public.record_plus_membership_event(
  'source-a','customer-604','subscription-604','start-604',
  '50000000-0000-0000-0000-000000000604','plus_early_access_monthly',
  'membership_started',now() - interval '20 days',now() - interval '20 days',now() + interval '10 days'
),'applied','#165 observed/applied permutation 604 start returns applied');
select is(public.record_plus_membership_event(
  'source-a','customer-604','subscription-604','pending-604',
  '50000000-0000-0000-0000-000000000604','plus_early_access_monthly',
  'membership_pending',now() - interval '10 days',now() - interval '10 days',now() + interval '20 days'
),'stale','#165 observed/applied permutation 604 pending returns stale');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000604'),'active','#165 observed/applied permutation 604 converges on active state');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000604'),'active','#165 observed/applied permutation 604 grants active access only after start');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000604'),(select period_end from public.plus_membership_event where source_event_id='renew-604'),'#165 observed/applied permutation 604 converges on renewal horizon');
select is((select last_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000604'),(select event_id from public.plus_membership_event where source_event_id='pending-604'),'#165 observed/applied permutation 604 retains pending as observed watermark');
select is((select applied_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000604'),(select event_id from public.plus_membership_event where source_event_id='renew-604'),'#165 observed/applied permutation 604 records renewal as applied authority');
select is((select applied_event_occurred_at from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000604'),(select occurred_at from public.plus_membership_event where source_event_id='renew-604'),'#165 observed/applied permutation 604 records renewal applied time');
-- Fixture 605: renew -> pending -> start
select is(public.record_plus_membership_event(
  'source-a','customer-605','subscription-605','renew-605',
  '50000000-0000-0000-0000-000000000605','plus_early_access_monthly',
  'membership_renewed',now() - interval '15 days',now() - interval '15 days',now() + interval '40 days'
),'applied','#165 observed/applied permutation 605 renew returns applied');
select is(public.record_plus_membership_event(
  'source-a','customer-605','subscription-605','pending-605',
  '50000000-0000-0000-0000-000000000605','plus_early_access_monthly',
  'membership_pending',now() - interval '10 days',now() - interval '10 days',now() + interval '20 days'
),'applied','#165 observed/applied permutation 605 pending returns applied');
select is(public.record_plus_membership_event(
  'source-a','customer-605','subscription-605','start-605',
  '50000000-0000-0000-0000-000000000605','plus_early_access_monthly',
  'membership_started',now() - interval '20 days',now() - interval '20 days',now() + interval '10 days'
),'applied','#165 observed/applied permutation 605 start returns applied');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000605'),'active','#165 observed/applied permutation 605 converges on active state');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000605'),'active','#165 observed/applied permutation 605 grants active access only after start');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000605'),(select period_end from public.plus_membership_event where source_event_id='renew-605'),'#165 observed/applied permutation 605 converges on renewal horizon');
select is((select last_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000605'),(select event_id from public.plus_membership_event where source_event_id='pending-605'),'#165 observed/applied permutation 605 retains pending as observed watermark');
select is((select applied_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000605'),(select event_id from public.plus_membership_event where source_event_id='renew-605'),'#165 observed/applied permutation 605 records renewal as applied authority');
select is((select applied_event_occurred_at from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000605'),(select occurred_at from public.plus_membership_event where source_event_id='renew-605'),'#165 observed/applied permutation 605 records renewal applied time');
-- A payment failure after an applied start must reduce to past_due even when
-- the observed pending key is later than the failure key.
select is(public.record_plus_membership_event('source-a','customer-606','subscription-606','start-606','50000000-0000-0000-0000-000000000606','plus_early_access_monthly','membership_started',now() - interval '20 days',now() - interval '20 days',now() + interval '10 days'),'applied','#165 payment failure after start starts active access');
select is(public.record_plus_membership_event('source-a','customer-606','subscription-606','pending-606','50000000-0000-0000-0000-000000000606','plus_early_access_monthly','membership_pending',now() - interval '10 days',now() - interval '10 days',now() + interval '20 days'),'stale','#165 payment failure after start records pending as observed-only');
select is(public.record_plus_membership_event('source-a','customer-606','subscription-606','fail-606','50000000-0000-0000-0000-000000000606','plus_early_access_monthly','membership_payment_failed',now() - interval '15 days',now() - interval '15 days',now() + interval '40 days'),'applied','#165 payment failure below observed pending still applies');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000606'),'past_due','#165 payment failure below observed pending reduces state to past_due');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000606'),'past_due','#165 payment failure below observed pending reduces access to past_due');
select is((select last_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000606'),(select event_id from public.plus_membership_event where source_event_id='pending-606'),'#165 payment failure keeps pending as observed watermark');
select is((select applied_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000606'),(select event_id from public.plus_membership_event where source_event_id='fail-606'),'#165 payment failure becomes applied authority');
select is((select plan_active_when_observed from public.plus_membership_event where source_event_id='fail-606'),true,'#165 payment failure receipt records active plan observation');
-- Renewal before confirmation is durable but cannot mint access. The start
-- then folds the accepted renewal and extends the horizon.
select is(public.record_plus_membership_event('source-a','customer-607','subscription-607','renew-607','50000000-0000-0000-0000-000000000607','plus_early_access_monthly','membership_renewed',now() - interval '15 days',now() - interval '15 days',now() + interval '40 days'),'applied','#165 pre-start renewal is retained');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000607'),'pending','#165 pre-start renewal leaves pending state');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000607'),'pending','#165 pre-start renewal grants no access');
select is(public.record_plus_membership_event('source-a','customer-607','subscription-607','start-607','50000000-0000-0000-0000-000000000607','plus_early_access_monthly','membership_started',now() - interval '20 days',now() - interval '20 days',now() + interval '10 days'),'applied','#165 pre-start renewal is folded by actual start');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000607'),'active','#165 pre-start renewal receives access only after start');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000607'),(select period_end from public.plus_membership_event where source_event_id='renew-607'),'#165 pre-start renewal fold uses renewal horizon');
select is((select applied_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000607'),(select event_id from public.plus_membership_event where source_event_id='renew-607'),'#165 pre-start renewal fold records applied authority');
-- Payment failure before confirmation also remains no-access pending, then
-- becomes the applied past_due outcome when start makes the stream current.
select is(public.record_plus_membership_event('source-a','customer-608','subscription-608','fail-608','50000000-0000-0000-0000-000000000608','plus_early_access_monthly','membership_payment_failed',now() - interval '15 days',now() - interval '15 days',now() + interval '40 days'),'applied','#165 pre-start payment failure is retained');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000608'),'pending','#165 pre-start payment failure leaves pending state');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000608'),'pending','#165 pre-start payment failure grants no access');
select is(public.record_plus_membership_event('source-a','customer-608','subscription-608','start-608','50000000-0000-0000-0000-000000000608','plus_early_access_monthly','membership_started',now() - interval '20 days',now() - interval '20 days',now() + interval '10 days'),'applied','#165 pre-start payment failure is folded by actual start');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000608'),'past_due','#165 pre-start payment failure becomes past_due after start');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000608'),'past_due','#165 pre-start payment failure does not grant active access');
select is((select applied_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000608'),(select event_id from public.plus_membership_event where source_event_id='fail-608'),'#165 pre-start payment failure fold records applied authority');

-- P1-B, buffered admission across a catalog close. A is current. C's
-- Standard renewal is received while Standard is active, so it is durable
-- buffered evidence. Standard then closes before C's earlier EA start is
-- delivered. The start must fold the already accepted Standard renewal rather
-- than re-run a now-inactive plan gate.
select is(public.record_plus_membership_event(
  'source-a','customer-609','subscription-609-a','start-609-a',
  '50000000-0000-0000-0000-000000000609','plus_early_access_monthly',
  'membership_started',now() - interval '30 days',now() - interval '30 days',now() + interval '30 days'
),'applied','#165 buffered admission close-boundary A starts current');
select is(public.record_plus_membership_event(
  'source-a','customer-609','subscription-609-c','renew-609-c-standard',
  '50000000-0000-0000-0000-000000000609','plus_standard_monthly',
  'membership_renewed',now() - interval '15 days',now() - interval '15 days',now() + interval '45 days'
),'stale','#165 buffered admission close-boundary Standard renewal is buffered while Standard is active');
select is((select count(*) from public.plus_membership_event where source_subscription_id='subscription-609-c' and source_event_id='renew-609-c-standard'),1::bigint,'#165 buffered admission close-boundary retains the accepted Standard evidence');
select is((select plan_active_when_observed from public.plus_membership_event where source_event_id='renew-609-c-standard'),true,'#165 buffered admission close-boundary records TRUE Standard receipt proof');
update public.plus_membership_plan set active = false where plan_code = 'plus_standard_monthly';
select is((select active from public.plus_membership_plan where plan_code='plus_standard_monthly'),false,'#165 buffered admission close-boundary closes Standard before C start');
select lives_ok($$select public.record_plus_membership_event(
  'source-a','customer-609','subscription-609-c','start-609-c-early',
  '50000000-0000-0000-0000-000000000609','plus_early_access_monthly',
  'membership_started',now() - interval '20 days',now() - interval '20 days',now() + interval '40 days'
)$$,'#165 buffered admission close-boundary C EA start does not re-gate accepted Standard evidence');
select is((select plan_code from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000609'),'plus_standard_monthly','#165 buffered admission close-boundary folds the accepted Standard plan');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000609'),'active','#165 buffered admission close-boundary keeps active state');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000609'),'active','#165 buffered admission close-boundary keeps active access');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000609'),(select period_end from public.plus_membership_event where source_event_id='renew-609-c-standard'),'#165 buffered admission close-boundary preserves the accepted Standard horizon');
select is((select admitted_plan_code from public.plus_membership_subscription where source_subscription_id='subscription-609-c'),'plus_standard_monthly','#165 buffered admission close-boundary preserves the accepted Standard admission marker');
select is((select admitted_at from public.plus_membership_subscription where source_subscription_id='subscription-609-c'),(select occurred_at from public.plus_membership_event where source_event_id='renew-609-c-standard'),'#165 buffered admission close-boundary preserves Standard admission time');
select is(public.record_plus_membership_event(
  'source-a','customer-609','subscription-609-c','renew-609-c-closed',
  '50000000-0000-0000-0000-000000000609','plus_standard_monthly',
  'membership_renewed',now() - interval '5 days',now() - interval '5 days',now() + interval '55 days'
),'applied','#165 buffered admission close-boundary accepts same-plan renewal after Standard closes');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000609'),(select period_end from public.plus_membership_event where source_event_id='renew-609-c-closed'),'#165 buffered admission close-boundary extends admitted same-plan access after closure');
select is((select admitted_plan_code from public.plus_membership_subscription where source_subscription_id='subscription-609-c'),'plus_standard_monthly','#165 buffered admission close-boundary keeps exact admitted plan after closure');
select is((select plan_active_when_observed from public.plus_membership_event where source_event_id='renew-609-c-closed'),false,'#165 buffered admission close-boundary records FALSE receipt proof after closure');
select is(public.record_plus_membership_event('source-a','customer-609','subscription-609-c','renew-609-c-standard','50000000-0000-0000-0000-000000000609','plus_standard_monthly','membership_renewed',now() - interval '15 days',now() - interval '15 days',now() + interval '45 days','false'::boolean,'{"replayed":true}'::jsonb),'replayed','#165 buffered admission replay returns the immutable original receipt');
select is((select plan_active_when_observed from public.plus_membership_event where source_event_id='renew-609-c-standard'),true,'#165 buffered admission replay cannot mutate TRUE receipt proof');

-- An inactive first receipt has no durable admission marker and must fail
-- closed. This is distinct from the already accepted buffered Standard event.
select throws_ok($$select public.record_plus_membership_event(
  'source-a','customer-610','subscription-610-c','renew-610-standard-inactive',
  '50000000-0000-0000-0000-000000000610','plus_standard_monthly',
  'membership_renewed',now() - interval '15 days',now() - interval '15 days',now() + interval '45 days'
)$$,'P0001','plan plus_standard_monthly is not active for membership activation','#165 buffered admission inactive-first renewal fails closed');
select is((select count(*) from public.plus_membership_event where source_subscription_id='subscription-610-c'),0::bigint,'#165 buffered admission inactive-first rejection leaves no event');
select is((select count(*) from public.plus_membership_subscription where source_subscription_id='subscription-610-c'),0::bigint,'#165 buffered admission inactive-first rejection leaves no binding');
-- Non-admission evidence may be recorded while a plan is inactive; its receipt
-- proof is immutable FALSE and cannot later be upgraded by reopening the plan.
select is(public.record_plus_membership_event('source-a','customer-614','subscription-614','fail-614','50000000-0000-0000-0000-000000000614','plus_standard_monthly','membership_payment_failed',now() - interval '15 days',now() - interval '15 days',now() + interval '40 days'),'applied','#165 inactive receipt payment failure is retained as pending evidence');
select is((select plan_active_when_observed from public.plus_membership_event where source_event_id='fail-614'),false,'#165 inactive receipt records FALSE plan proof');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000614'),'pending','#165 inactive receipt payment failure grants no access');
update public.plus_membership_plan set active = true where plan_code = 'plus_standard_monthly';

-- Terminal barrier and repeated pending evidence. A terminal predecessor at
-- t5 is carried by pending B at t20/t21. B t4 cannot bypass that barrier;
-- B t10 is accepted. This also guards terminal authority while exercising a
-- fresh relative-time successor stream.
select is(public.record_plus_membership_event(
  'source-a','customer-611','subscription-611-a','start-611-a',
  '50000000-0000-0000-0000-000000000611','plus_early_access_monthly',
  'membership_started',now() - interval '25 days',now() - interval '25 days',now() + interval '5 days'
),'applied','#165 buffered admission barrier predecessor starts');
select is(public.record_plus_membership_event(
  'source-a','customer-611','subscription-611-a','revoke-611-a',
  '50000000-0000-0000-0000-000000000611','plus_early_access_monthly',
  'membership_revoked',now() - interval '20 days',now() - interval '25 days',now() + interval '5 days'
),'applied','#165 buffered admission barrier predecessor terminal at t5 applies');
select is(public.record_plus_membership_event(
  'source-a','customer-611','subscription-611-b','pending-611-b',
  '50000000-0000-0000-0000-000000000611','plus_early_access_monthly',
  'membership_pending',now() - interval '5 days',now() - interval '5 days',now() + interval '25 days'
),'applied','#165 buffered admission barrier pending B t20 becomes current');
select is((select succession_barrier_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000611'),(select event_id from public.plus_membership_event where source_event_id='revoke-611-a'),'#165 buffered admission barrier records predecessor terminal identity');
select is(public.record_plus_membership_event(
  'source-a','customer-611','subscription-611-b','pending-611-b-later',
  '50000000-0000-0000-0000-000000000611','plus_early_access_monthly',
  'membership_pending',now() - interval '4 days',now() - interval '4 days',now() + interval '26 days'
),'applied','#165 buffered admission barrier repeated pending B t21 applies');
select is((select succession_barrier_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000611'),(select event_id from public.plus_membership_event where source_event_id='revoke-611-a'),'#165 buffered admission barrier repeated pending preserves predecessor identity');
select is((select last_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000611'),(select event_id from public.plus_membership_event where source_event_id='pending-611-b-later'),'#165 buffered admission barrier repeated pending advances the t21 watermark');
select is(public.record_plus_membership_event(
  'source-a','customer-611','subscription-611-b','start-611-b-old',
  '50000000-0000-0000-0000-000000000611','plus_early_access_monthly',
  'membership_started',now() - interval '21 days',now() - interval '21 days',now() + interval '15 days'
),'stale','#165 buffered admission barrier B start t4 is rejected');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000611'),'pending','#165 buffered admission barrier rejected t4 leaves B pending');
select is(public.record_plus_membership_event(
  'source-a','customer-611','subscription-611-b','start-611-b',
  '50000000-0000-0000-0000-000000000611','plus_early_access_monthly',
  'membership_started',now() - interval '15 days',now() - interval '15 days',now() + interval '15 days'
),'applied','#165 buffered admission barrier B start t10 clears the barrier');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000611'),'active','#165 buffered admission barrier accepted t10 is active');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000611'),'active','#165 buffered admission barrier accepted t10 grants access');
select is((select admitted_plan_code from public.plus_membership_subscription where source_subscription_id='subscription-611-b'),'plus_early_access_monthly','#165 buffered admission barrier accepted t10 records admission');
select is((select last_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000611'),(select event_id from public.plus_membership_event where source_event_id='pending-611-b-later'),'#165 buffered admission barrier accepted older start keeps t21 watermark');

-- Equal-key terminal/watermark edge. A same-timestamp pending zzz becomes
-- current; a lower-key confirmation still applies but keeps zzz as observed
-- watermark, and a same-timestamp payment failure still applies to the
-- reduced state even though zzz remains the greatest observed key.
select is(public.record_plus_membership_event(
  'source-a','customer-612','subscription-612-a','evt-612-zz',
  '50000000-0000-0000-0000-000000000612','plus_early_access_monthly',
  'membership_pending',now() - interval '10 days',now() - interval '10 days',now() + interval '20 days'
),'applied','#165 buffered admission equal-key pending zzz applies');
select is(public.record_plus_membership_event(
  'source-a','customer-612','subscription-612-a','evt-612-aa',
  '50000000-0000-0000-0000-000000000612','plus_early_access_monthly',
  'membership_started',now() - interval '10 days',now() - interval '10 days',now() + interval '20 days'
),'applied','#165 buffered admission equal-key lower-id start applies');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000612'),'active','#165 buffered admission equal-key confirmation grants access');
select is((select last_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000612'),(select event_id from public.plus_membership_event where source_event_id='evt-612-zz'),'#165 buffered admission equal-key confirmation keeps pending watermark');
select is(public.record_plus_membership_event(
  'source-a','customer-612','subscription-612-a','evt-612-mm',
  '50000000-0000-0000-0000-000000000612','plus_early_access_monthly',
  'membership_payment_failed',now() - interval '10 days',now() - interval '10 days',now() + interval '20 days'
),'applied','#165 buffered admission equal-key payment failure applies below observed watermark');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000612'),'past_due','#165 buffered admission equal-key failure reduces access to past_due');
select is((select last_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000612'),(select event_id from public.plus_membership_event where source_event_id='evt-612-zz'),'#165 buffered admission equal-key applied failure preserves observed watermark');
select is((select applied_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000612'),(select event_id from public.plus_membership_event where source_event_id='evt-612-mm'),'#165 buffered admission equal-key failure becomes applied authority');

select * from finish();
rollback;
