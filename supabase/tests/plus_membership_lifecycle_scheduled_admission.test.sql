-- #165: cancellation bounds existing access but cannot establish admission.
begin;

select plan(66);

insert into auth.users (id, aud, role) values
  ('50000000-0000-0000-0000-000000000220', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000221', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000222', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000223', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000224', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000225', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000226', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000227', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000228', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000229', 'authenticated', 'authenticated');

-- Direct, unadmitted pending -> scheduled cancellation: the cancellation records
-- cutoff authority but cannot upgrade an unpaid stream to active/admitted.
select lives_ok($$select public.record_plus_membership_event('source-scheduled-admission','customer-220','subscription-220','pending-220','50000000-0000-0000-0000-000000000220','plus_early_access_monthly','membership_pending',now() - interval '10 days',now() - interval '10 days',now() + interval '30 days')$$, '#165 direct pending then scheduled cancel accepts pending');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000220'),'pending','#165 direct pending then scheduled cancel starts pending');
select lives_ok($$select public.record_plus_membership_event('source-scheduled-admission','customer-220','subscription-220','cancel-220','50000000-0000-0000-0000-000000000220','plus_early_access_monthly','membership_canceled',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days',true)$$, '#165 direct pending then scheduled cancel records cutoff');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000220'),'pending','#165 direct pending then scheduled cancel remains pending');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000220'), true),'#165 direct pending then scheduled cancel never grants access');
select ok((select terminal_at is not null from public.plus_membership_subscription where source_system='source-scheduled-admission' and source_subscription_id='subscription-220'),'#165 direct pending then scheduled cancel records terminal cutoff');
select ok((select admitted_at is null from public.plus_membership_subscription where source_system='source-scheduled-admission' and source_subscription_id='subscription-220'),'#165 direct pending then scheduled cancel remains unadmitted');

-- Cancel-first has the same no-access/no-admission outcome, even if pending
-- evidence follows it.
select lives_ok($$select public.record_plus_membership_event('source-scheduled-admission','customer-221','subscription-221','cancel-221','50000000-0000-0000-0000-000000000221','plus_early_access_monthly','membership_canceled',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days',true)$$, '#165 cancel-first records an unadmitted cutoff');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000221'),'pending','#165 cancel-first projects pending rather than active');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000221'), true),'#165 cancel-first never grants access');
select ok((select terminal_at is not null from public.plus_membership_subscription where source_system='source-scheduled-admission' and source_subscription_id='subscription-221'),'#165 cancel-first records terminal cutoff');
select ok((select admitted_at is null from public.plus_membership_subscription where source_system='source-scheduled-admission' and source_subscription_id='subscription-221'),'#165 cancel-first remains unadmitted');
select lives_ok($$select public.record_plus_membership_event('source-scheduled-admission','customer-221','subscription-221','pending-221','50000000-0000-0000-0000-000000000221','plus_early_access_monthly','membership_pending',now() - interval '1 day',now() - interval '1 day',now() + interval '20 days')$$, '#165 cancel-first accepts later pending evidence');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000221'),'pending','#165 cancel-first remains pending after later pending');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000221'), true),'#165 cancel-first later pending never grants access');

-- A valid confirmation strictly before a future cutoff may admit either delivery
-- order, but access must be bounded by that recorded cutoff.
select lives_ok($$select public.record_plus_membership_event('source-scheduled-admission','customer-222','subscription-222','cancel-222','50000000-0000-0000-0000-000000000222','plus_early_access_monthly','membership_canceled',now() - interval '5 days',now() - interval '10 days',now() + interval '15 days',true)$$, '#165 pre-cutoff cancel-first records cutoff');
select lives_ok($$select public.record_plus_membership_event('source-scheduled-admission','customer-222','subscription-222','start-222','50000000-0000-0000-0000-000000000222','plus_early_access_monthly','membership_started',now() - interval '2 days',now() - interval '2 days',now() + interval '30 days')$$, '#165 pre-cutoff cancel-first accepts valid confirmation');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000222'),'active','#165 pre-cutoff cancel-first admits active access');
select ok((select current_period_end <= terminal_at from public.plus_membership_access join public.plus_membership_subscription using (user_id) where user_id='50000000-0000-0000-0000-000000000222'),'#165 pre-cutoff cancel-first clamps active horizon to cutoff');
select is((select admitted_plan_code from public.plus_membership_subscription where source_system='source-scheduled-admission' and source_subscription_id='subscription-222'),'plus_early_access_monthly','#165 pre-cutoff cancel-first records exact admitted plan');

select lives_ok($$select public.record_plus_membership_event('source-scheduled-admission','customer-223','subscription-223','start-223','50000000-0000-0000-0000-000000000223','plus_early_access_monthly','membership_started',now() - interval '10 days',now() - interval '10 days',now() + interval '30 days')$$, '#165 pre-cutoff start-first admits stream');
select lives_ok($$select public.record_plus_membership_event('source-scheduled-admission','customer-223','subscription-223','cancel-223','50000000-0000-0000-0000-000000000223','plus_early_access_monthly','membership_canceled',now() - interval '5 days',now() - interval '10 days',now() + interval '15 days',true)$$, '#165 pre-cutoff start-first records cutoff');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000223'),'active','#165 pre-cutoff start-first preserves active access before cutoff');
select ok((select current_period_end <= terminal_at from public.plus_membership_access join public.plus_membership_subscription using (user_id) where user_id='50000000-0000-0000-0000-000000000223'),'#165 pre-cutoff start-first clamps active horizon to cutoff');
select is((select admitted_plan_code from public.plus_membership_subscription where source_system='source-scheduled-admission' and source_subscription_id='subscription-223'),'plus_early_access_monthly','#165 pre-cutoff start-first preserves exact admission');

-- A confirmation at or after the durable cutoff is stale and cannot make access.
select lives_ok($$select public.record_plus_membership_event('source-scheduled-admission','customer-224','subscription-224','cancel-224','50000000-0000-0000-0000-000000000224','plus_early_access_monthly','membership_canceled',now() - interval '10 days',now() - interval '20 days',now() - interval '5 days',true)$$, '#165 equal-cutoff setup records elapsed cutoff');
select is(public.record_plus_membership_event('source-scheduled-admission','customer-224','subscription-224','start-224','50000000-0000-0000-0000-000000000224','plus_early_access_monthly','membership_started',now() - interval '5 days',now() - interval '5 days',now() + interval '20 days'),'stale','#165 confirmation at cutoff is stale');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000224'), true),'#165 confirmation at cutoff has no active access');
select ok((select admitted_at is null from public.plus_membership_subscription where source_system='source-scheduled-admission' and source_subscription_id='subscription-224'),'#165 confirmation at cutoff does not admit');

select lives_ok($$select public.record_plus_membership_event('source-scheduled-admission','customer-225','subscription-225','cancel-225','50000000-0000-0000-0000-000000000225','plus_early_access_monthly','membership_canceled',now() - interval '10 days',now() - interval '20 days',now() - interval '5 days',true)$$, '#165 after-cutoff setup records elapsed cutoff');
select is(public.record_plus_membership_event('source-scheduled-admission','customer-225','subscription-225','start-225','50000000-0000-0000-0000-000000000225','plus_early_access_monthly','membership_started',now() - interval '1 day',now() - interval '1 day',now() + interval '20 days'),'stale','#165 confirmation after cutoff is stale');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000225'), true),'#165 confirmation after cutoff has no active access');
select ok((select admitted_at is null from public.plus_membership_subscription where source_system='source-scheduled-admission' and source_subscription_id='subscription-225'),'#165 confirmation after cutoff does not admit');

-- Buffered scheduled cancellation on B cannot activate B after A is terminal;
-- a subsequent B start that occurs before B's future cutoff may then admit and
-- must retain that cutoff, rather than inheriting an unbounded active horizon.
select lives_ok($$select public.record_plus_membership_event('source-scheduled-admission','customer-226','subscription-226-a','start-226-a','50000000-0000-0000-0000-000000000226','plus_early_access_monthly','membership_started',now() - interval '20 days',now() - interval '20 days',now() + interval '30 days')$$, '#165 buffered B cutoff setup starts A');
select lives_ok($$select public.record_plus_membership_event('source-scheduled-admission','customer-226','subscription-226-b','cancel-226-b','50000000-0000-0000-0000-000000000226','plus_early_access_monthly','membership_canceled',now() - interval '2 days',now() - interval '15 days',now() + interval '10 days',true)$$, '#165 buffered B cutoff is durable while A remains current');
select ok((select terminal_at is not null from public.plus_membership_subscription where source_system='source-scheduled-admission' and source_subscription_id='subscription-226-b'),'#165 buffered B cutoff is recorded');
select lives_ok($$select public.record_plus_membership_event('source-scheduled-admission','customer-226','subscription-226-a','revoke-226-a','50000000-0000-0000-0000-000000000226','plus_early_access_monthly','membership_revoked',now() - interval '10 days',now() - interval '20 days',now() + interval '30 days')$$, '#165 buffered B cutoff setup terminates A');
select lives_ok($$select public.record_plus_membership_event('source-scheduled-admission','customer-226','subscription-226-b','pending-226-b','50000000-0000-0000-0000-000000000226','plus_early_access_monthly','membership_pending',now() - interval '8 days',now() - interval '8 days',now() + interval '20 days')$$, '#165 buffered B pending becomes current after A terminal');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000226'), true),'#165 buffered B pending never activates access');
select ok((select admitted_at is null from public.plus_membership_subscription where source_system='source-scheduled-admission' and source_subscription_id='subscription-226-b'),'#165 buffered B pending remains unadmitted');
select lives_ok($$select public.record_plus_membership_event('source-scheduled-admission','customer-226','subscription-226-b','start-226-b','50000000-0000-0000-0000-000000000226','plus_early_access_monthly','membership_started',now() - interval '5 days',now() - interval '5 days',now() + interval '25 days')$$, '#165 buffered B valid pre-cutoff confirmation is safe');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000226'),'active','#165 buffered B valid pre-cutoff confirmation admits access');
select ok((select current_period_end <= terminal_at from public.plus_membership_access join public.plus_membership_subscription using (user_id) where user_id='50000000-0000-0000-0000-000000000226' and source_subscription_id='subscription-226-b'),'#165 buffered B valid confirmation is clamped to its own cutoff');
select is((select admitted_plan_code from public.plus_membership_subscription where source_system='source-scheduled-admission' and source_subscription_id='subscription-226-b'),'plus_early_access_monthly','#165 buffered B valid confirmation records exact admission');

-- A cancellation that names a different plan cannot admit that plan or replace the
-- prior plan. Existing valid access remains active only through the durable cutoff.
select lives_ok($$select public.record_plus_membership_event('source-scheduled-admission','customer-227','subscription-227','start-227','50000000-0000-0000-0000-000000000227','plus_early_access_monthly','membership_started',now() - interval '10 days',now() - interval '10 days',now() + interval '30 days')$$, '#165 admitted-plan mismatch setup admits Early Access');
select lives_ok($$select public.record_plus_membership_event('source-scheduled-admission','customer-227','subscription-227','cancel-227-standard','50000000-0000-0000-0000-000000000227','plus_standard_monthly','membership_canceled',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days',true)$$, '#165 admitted-plan mismatch cancellation is safe');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000227'),'active','#165 admitted-plan mismatch does not revoke valid prior access before cutoff');
select ok((select current_period_end <= terminal_at from public.plus_membership_access join public.plus_membership_subscription using (user_id) where user_id='50000000-0000-0000-0000-000000000227'),'#165 admitted-plan mismatch clamps prior access to durable cutoff');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000227'),'active','#165 admitted-plan mismatch retains current state rather than activating the new plan');
select is((select admitted_plan_code from public.plus_membership_subscription where source_system='source-scheduled-admission' and source_subscription_id='subscription-227'),'plus_early_access_monthly','#165 admitted-plan mismatch does not rewrite prior admission');

-- An inactive Standard stream may record an unadmitted scheduled cutoff/pending
-- state, but its later start is rejected and never manufactures access.
update public.plus_membership_plan set active = false where plan_code = 'plus_standard_monthly';
select lives_ok($$select public.record_plus_membership_event('source-scheduled-admission','customer-228','subscription-228','cancel-228-standard','50000000-0000-0000-0000-000000000228','plus_standard_monthly','membership_canceled',now() - interval '5 days',now() - interval '10 days',now() + interval '20 days',true)$$, '#165 inactive Standard cancellation records cutoff without admission');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000228'),'pending','#165 inactive Standard cancellation projects pending');
select ok((select terminal_at is not null from public.plus_membership_subscription where source_system='source-scheduled-admission' and source_subscription_id='subscription-228'),'#165 inactive Standard cancellation records cutoff');
select ok((select admitted_at is null from public.plus_membership_subscription where source_system='source-scheduled-admission' and source_subscription_id='subscription-228'),'#165 inactive Standard cancellation remains unadmitted');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000228'), true),'#165 inactive Standard cancellation never grants access');
select throws_ok($$select public.record_plus_membership_event('source-scheduled-admission','customer-228','subscription-228','start-228-standard','50000000-0000-0000-0000-000000000228','plus_standard_monthly','membership_started',now() - interval '1 day',now() - interval '1 day',now() + interval '30 days')$$, 'P0001', 'plan plus_standard_monthly is not active for membership activation', '#165 inactive Standard start is rejected');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000228'), true),'#165 inactive Standard rejected start cannot grant access');
select is((select count(*) from public.plus_membership_event where source_system='source-scheduled-admission' and source_subscription_id='subscription-228'),1::bigint,'#165 inactive Standard preserves cancellation while rejected activation rolls back');

-- Buffered changed-plan cancellation has the same valid-plan/cutoff outcome as direct delivery.
select lives_ok($$select public.record_plus_membership_event('source-scheduled-admission','customer-229','subscription-229-a','start-a-229','50000000-0000-0000-0000-000000000229','plus_early_access_monthly','membership_started',now() - interval '20 days',now() - interval '20 days',now() + interval '30 days',false)$$, '#165 buffered changed-plan start-a is safe');
select lives_ok($$select public.record_plus_membership_event('source-scheduled-admission','customer-229','subscription-229-b','cancel-b-229','50000000-0000-0000-0000-000000000229','plus_standard_monthly','membership_canceled',now() - interval '2 days',now() - interval '20 days',now() + interval '10 days',true)$$, '#165 buffered changed-plan cancel-b is safe');
select lives_ok($$select public.record_plus_membership_event('source-scheduled-admission','customer-229','subscription-229-a','revoke-a-229','50000000-0000-0000-0000-000000000229','plus_early_access_monthly','membership_revoked',now() - interval '10 days',now() - interval '20 days',now() + interval '30 days',false)$$, '#165 buffered changed-plan revoke-a is safe');
select lives_ok($$select public.record_plus_membership_event('source-scheduled-admission','customer-229','subscription-229-b','start-b-229','50000000-0000-0000-0000-000000000229','plus_early_access_monthly','membership_started',now() - interval '5 days',now() - interval '20 days',now() + interval '25 days',false)$$, '#165 buffered changed-plan start-b is safe');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000229'),'active','#165 buffered changed-plan cancellation preserves admitted access');
select is((select plan_code from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000229'),'plus_early_access_monthly','#165 buffered changed-plan cancellation retains valid state plan');
select is((select admitted_plan_code from public.plus_membership_subscription where source_system='source-scheduled-admission' and source_subscription_id='subscription-229-b'),'plus_early_access_monthly','#165 buffered changed-plan cancellation does not admit Standard');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000229'),now() + interval '10 days','#165 buffered changed-plan cancellation clamps access to cutoff');

select * from finish();
rollback;
