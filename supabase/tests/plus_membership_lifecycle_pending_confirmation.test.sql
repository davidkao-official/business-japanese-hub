-- Isolated lifecycle scenario group; all assertions retained from the original suite.
begin;

select plan(65);

-- #165 confirmation/pending convergence and inherited terminal authority.
insert into auth.users (id, aud, role) values
  ('50000000-0000-0000-0000-000000000214', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000215', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000216', 'authenticated', 'authenticated');
--
-- Dynamic event-time mapping in this transaction is t4 < t5 < t10 < t15 <
-- t20: now()-21d, -20d, -15d, -10d, -5d; repeated pending t21 is now()-4d.

-- Pending first, then an older same-stream confirmation. The confirmation must
-- apply, but the observed pending event remains the monotonic watermark.
select is(public.record_plus_membership_event('source-a','customer-214','subscription-214','pending-214','50000000-0000-0000-0000-000000000214','plus_early_access_monthly','membership_pending',now() - interval '5 days',now() - interval '5 days',now() + interval '25 days'),'applied','#165 pending-first t20 creates pending state');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000214'),'pending','#165 pending-first t20 state is pending');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000214'),'pending','#165 pending-first t20 projects no-access state');
select is(public.record_plus_membership_event('source-a','customer-214','subscription-214','start-214','50000000-0000-0000-0000-000000000214','plus_early_access_monthly','membership_started',now() - interval '15 days',now() - interval '15 days',now() + interval '15 days'),'applied','#165 pending-first older t10 confirmation applies');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000214'),'active','#165 pending-first older confirmation produces active state');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000214'),'active','#165 pending-first older confirmation grants access');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000214'),now() + interval '15 days','#165 pending-first access uses the confirming start horizon');
select is((select admitted_plan_code from public.plus_membership_subscription where source_subscription_id='subscription-214'),'plus_early_access_monthly','#165 pending-first confirmation records the admitted plan');
select is((select admitted_at from public.plus_membership_subscription where source_subscription_id='subscription-214'),(select occurred_at from public.plus_membership_event where source_event_id='start-214'),'#165 pending-first confirmation records admitted evidence time');
select is((select last_event_occurred_at from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000214'),(select occurred_at from public.plus_membership_event where source_event_id='pending-214'),'#165 pending-first confirmation keeps the t20 watermark');
select is((select last_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000214'),(select event_id from public.plus_membership_event where source_system='source-a' and source_event_id='pending-214'),'#165 pending-first confirmation keeps the pending watermark identity');
select is(public.record_plus_membership_event('source-a','customer-214','subscription-214','fail-214','50000000-0000-0000-0000-000000000214','plus_early_access_monthly','membership_payment_failed',now() - interval '10 days',now() - interval '10 days',now() + interval '15 days'),'stale','#165 pending-first intervening t15 payment failure stays stale');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000214'),'active','#165 pending-first stale payment failure leaves state active');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000214'),'active','#165 pending-first stale payment failure leaves access active');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000214'),now() + interval '15 days','#165 pending-first stale payment failure leaves access horizon unchanged');
select is((select last_event_occurred_at from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000214'),(select occurred_at from public.plus_membership_event where source_event_id='pending-214'),'#165 pending-first stale payment failure leaves the t20 watermark');
select is((select last_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000214'),(select event_id from public.plus_membership_event where source_system='source-a' and source_event_id='pending-214'),'#165 pending-first stale payment failure leaves the watermark identity');

-- Reverse delivery: the same start is delivered first, then pending t20 is
-- status-stale but advances the watermark. The same t15 evidence must stay
-- stale after either delivery order.
select is(public.record_plus_membership_event('source-a','customer-215','subscription-215','start-215','50000000-0000-0000-0000-000000000215','plus_early_access_monthly','membership_started',now() - interval '15 days',now() - interval '15 days',now() + interval '15 days'),'applied','#165 reverse older t10 confirmation starts active state');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000215'),'active','#165 reverse start produces active state');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000215'),'active','#165 reverse start grants access');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000215'),now() + interval '15 days','#165 reverse start establishes the confirming horizon');
select is((select admitted_plan_code from public.plus_membership_subscription where source_subscription_id='subscription-215'),'plus_early_access_monthly','#165 reverse start records the admitted plan');
select is((select admitted_at from public.plus_membership_subscription where source_subscription_id='subscription-215'),(select occurred_at from public.plus_membership_event where source_event_id='start-215'),'#165 reverse start records admitted evidence time');
select is(public.record_plus_membership_event('source-a','customer-215','subscription-215','pending-215','50000000-0000-0000-0000-000000000215','plus_early_access_monthly','membership_pending',now() - interval '5 days',now() - interval '5 days',now() + interval '25 days'),'stale','#165 reverse later pending t20 is status-stale');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000215'),'active','#165 reverse pending preserves active state');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000215'),'active','#165 reverse pending preserves access');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000215'),now() + interval '15 days','#165 reverse pending preserves access horizon');
select is((select admitted_plan_code from public.plus_membership_subscription where source_subscription_id='subscription-215'),'plus_early_access_monthly','#165 reverse pending preserves the admitted plan');
select is((select admitted_at from public.plus_membership_subscription where source_subscription_id='subscription-215'),(select occurred_at from public.plus_membership_event where source_event_id='start-215'),'#165 reverse pending preserves admitted evidence time');
select is((select last_event_occurred_at from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000215'),(select occurred_at from public.plus_membership_event where source_event_id='pending-215'),'#165 reverse pending advances the t20 watermark');
select is((select last_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000215'),(select event_id from public.plus_membership_event where source_system='source-a' and source_event_id='pending-215'),'#165 reverse pending records the pending watermark identity');
select is(public.record_plus_membership_event('source-a','customer-215','subscription-215','fail-215','50000000-0000-0000-0000-000000000215','plus_early_access_monthly','membership_payment_failed',now() - interval '10 days',now() - interval '10 days',now() + interval '15 days'),'stale','#165 reverse intervening t15 payment failure stays stale');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000215'),'active','#165 reverse stale payment failure leaves state active');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000215'),'active','#165 reverse stale payment failure leaves access active');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000215'),now() + interval '15 days','#165 reverse stale payment failure leaves access horizon unchanged');
select is((select last_event_occurred_at from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000215'),(select occurred_at from public.plus_membership_event where source_event_id='pending-215'),'#165 reverse stale payment failure leaves the t20 watermark');
select is((select last_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000215'),(select event_id from public.plus_membership_event where source_system='source-a' and source_event_id='pending-215'),'#165 reverse stale payment failure leaves the watermark identity');

-- Delivery-order convergence across the two same-stream fixtures.
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000214'),(select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000215'),'#165 pending confirmation orders converge on state status');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000214'),(select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000215'),'#165 pending confirmation orders converge on access status');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000214'),(select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000215'),'#165 pending confirmation orders converge on access horizon');
select is((select admitted_plan_code from public.plus_membership_subscription where source_subscription_id='subscription-214'),(select admitted_plan_code from public.plus_membership_subscription where source_subscription_id='subscription-215'),'#165 pending confirmation orders converge on admitted plan');
select is((select admitted_at from public.plus_membership_subscription where source_subscription_id='subscription-214'),(select admitted_at from public.plus_membership_subscription where source_subscription_id='subscription-215'),'#165 pending confirmation orders converge on admitted evidence time');
select is((select last_event_occurred_at from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000214'),(select last_event_occurred_at from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000215'),'#165 pending confirmation orders converge on watermark time');
select is((select event_type from public.plus_membership_event where event_id=(select last_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000214')),(select event_type from public.plus_membership_event where event_id=(select last_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000215')),'#165 pending confirmation orders converge on watermark event type');

-- Succession barrier: predecessor A is terminal at t5. Pending B at t20 may
-- supersede A, but B's older t4 confirmation cannot bypass A's barrier; B's
-- t10 confirmation is strictly newer than the barrier and is accepted.
select is(public.record_plus_membership_event('source-a','customer-216','subscription-216-a','start-216-a','50000000-0000-0000-0000-000000000216','plus_early_access_monthly','membership_started',now() - interval '25 days',now() - interval '25 days',now() + interval '5 days'),'applied','#165 barrier predecessor A starts before t5');
select is(public.record_plus_membership_event('source-a','customer-216','subscription-216-a','revoke-216-a','50000000-0000-0000-0000-000000000216','plus_early_access_monthly','membership_revoked',now() - interval '20 days',now() - interval '25 days',now() + interval '5 days'),'applied','#165 barrier predecessor A terminates at t5');
select is(public.record_plus_membership_event('source-a','customer-216','subscription-216-b','pending-216-b','50000000-0000-0000-0000-000000000216','plus_early_access_monthly','membership_pending',now() - interval '5 days',now() - interval '5 days',now() + interval '25 days'),'applied','#165 barrier pending B at t20 supersedes terminal A');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000216'),'subscription-216-b','#165 barrier pending B is current');
select is((select succession_barrier_occurred_at from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000216'),(select occurred_at from public.plus_membership_event where source_event_id='revoke-216-a'),'#165 barrier stores predecessor terminal time');
select is((select succession_barrier_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000216'),(select event_id from public.plus_membership_event where source_system='source-a' and source_event_id='revoke-216-a'),'#165 barrier stores predecessor terminal identity');
select is(public.record_plus_membership_event('source-a','customer-216','subscription-216-b','pending-216-b-later','50000000-0000-0000-0000-000000000216','plus_early_access_monthly','membership_pending',now() - interval '4 days',now() - interval '4 days',now() + interval '26 days'),'applied','#165 barrier repeated pending B at t21 remains current');
select is((select succession_barrier_occurred_at from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000216'),(select occurred_at from public.plus_membership_event where source_event_id='revoke-216-a'),'#165 barrier repeated pending preserves predecessor terminal time');
select is((select succession_barrier_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000216'),(select event_id from public.plus_membership_event where source_system='source-a' and source_event_id='revoke-216-a'),'#165 barrier repeated pending preserves predecessor terminal identity');
select is((select last_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000216'),(select event_id from public.plus_membership_event where source_system='source-a' and source_event_id='pending-216-b-later'),'#165 barrier repeated pending advances the monotonic watermark to t21');
select is(public.record_plus_membership_event('source-a','customer-216','subscription-216-b','start-216-b-old','50000000-0000-0000-0000-000000000216','plus_early_access_monthly','membership_started',now() - interval '21 days',now() - interval '21 days',now() + interval '15 days'),'stale','#165 barrier rejects B confirmation at t4');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000216'),'subscription-216-b','#165 barrier rejected t4 confirmation keeps B current');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000216'),'pending','#165 barrier rejected t4 confirmation leaves B pending');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000216'),'pending','#165 barrier rejected t4 confirmation leaves no-access projection');
select is(public.record_plus_membership_event('source-a','customer-216','subscription-216-b','start-216-b','50000000-0000-0000-0000-000000000216','plus_early_access_monthly','membership_started',now() - interval '15 days',now() - interval '15 days',now() + interval '15 days'),'applied','#165 barrier accepts B confirmation at t10');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000216'),'active','#165 barrier t10 confirmation produces active state');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000216'),'active','#165 barrier t10 confirmation grants access');
select is((select admitted_plan_code from public.plus_membership_subscription where source_subscription_id='subscription-216-b'),'plus_early_access_monthly','#165 barrier accepted confirmation records the admitted plan');
select is((select admitted_at from public.plus_membership_subscription where source_subscription_id='subscription-216-b'),(select occurred_at from public.plus_membership_event where source_event_id='start-216-b'),'#165 barrier accepted confirmation records admitted evidence time');
select is((select last_event_occurred_at from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000216'),(select occurred_at from public.plus_membership_event where source_event_id='pending-216-b-later'),'#165 barrier accepted older confirmation keeps the t21 watermark');
select is((select last_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000216'),(select event_id from public.plus_membership_event where source_system='source-a' and source_event_id='pending-216-b-later'),'#165 barrier accepted older confirmation keeps the latest pending watermark identity');

select * from finish();
rollback;
