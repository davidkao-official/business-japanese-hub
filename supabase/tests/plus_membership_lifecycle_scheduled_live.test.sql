-- #165 focused scheduled-live retirement regressions.
-- Relative intervals keep the event order stable without wall-clock literals.
-- The transaction rolls back fixture users and the test-only state/terminal_at
-- mutations after pgTAP completes.
begin;

select plan(36);

insert into auth.users (id, aud, role) values
  ('50000000-0000-0000-0000-000000000730', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000731', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000732', 'authenticated', 'authenticated');

-- 730: A starts at t1 and reaches an immediate terminal at t5. C's
-- noncurrent scheduled cancellation at t15 has a future cutoff (t100), then
-- C becomes a provisional pending stream at t20. B's t10 start must succeed
-- against A's inherited terminal barrier; C's own future cutoff must not block
-- that succession.
select is(public.record_plus_membership_event('source-scheduled-live','customer-730','subscription-730-a','start-730-a1','50000000-0000-0000-0000-000000000730','plus_early_access_monthly','membership_started',now() - interval '40 days',now() - interval '40 days',now() + interval '60 days'),'applied','#165 scheduled-live 730 A start t1 applies');
select is(public.record_plus_membership_event('source-scheduled-live','customer-730','subscription-730-a','revoke-730-a5','50000000-0000-0000-0000-000000000730','plus_early_access_monthly','membership_revoked',now() - interval '36 days',now() - interval '40 days',now() + interval '60 days'),'applied','#165 scheduled-live 730 A immediate terminal t5 applies');
select is((select retired_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-730-a'),true,'#165 scheduled-live 730 A is durably terminal');
select is(public.record_plus_membership_event('source-scheduled-live','customer-730','subscription-730-c','cancel-730-c15','50000000-0000-0000-0000-000000000730','plus_early_access_monthly','membership_canceled',now() - interval '26 days',now() - interval '30 days',now() + interval '60 days',true),'stale','#165 scheduled-live 730 noncurrent C future cancellation is stale for reducer state');
select is((select terminal_at from public.plus_membership_subscription where source_subscription_id='subscription-730-c'),now() + interval '60 days','#165 scheduled-live 730 C retains its future cutoff t100');
select is((select retired_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-730-c'),true,'#165 scheduled-live 730 noncurrent C is physically retired');
select is(public.record_plus_membership_event('source-scheduled-live','customer-730','subscription-730-c','pending-730-c20','50000000-0000-0000-0000-000000000730','plus_early_access_monthly','membership_pending',now() - interval '21 days',now() - interval '30 days',now() + interval '80 days'),'applied','#165 scheduled-live 730 C pending t20 becomes provisional');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000730'),'subscription-730-c','#165 scheduled-live 730 C pending stream is current');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000730'),'pending','#165 scheduled-live 730 C pending stream remains unadmitted');
select ok(coalesce((select membership_status <> 'active' from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000730'),true),'#165 scheduled-live 730 C pending stream never grants access');
select is((select admitted_at is null from public.plus_membership_subscription where source_subscription_id='subscription-730-c'),true,'#165 scheduled-live 730 C pending stream remains unadmitted');
select is(public.record_plus_membership_event('source-scheduled-live','customer-730','subscription-730-b','start-730-b10','50000000-0000-0000-0000-000000000730','plus_early_access_monthly','membership_started',now() - interval '31 days',now() - interval '31 days',now() + interval '70 days'),'applied','#165 scheduled-live 730 B start t10 replaces pending C through inherited A terminal t5');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000730'),'subscription-730-b','#165 scheduled-live 730 B is current');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000730'),'active','#165 scheduled-live 730 B receives access');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000730'),now() + interval '70 days','#165 scheduled-live 730 B horizon is its own period end, not C cutoff t100');

-- 731: after A is replaced by admitted B, remove only the reducer state as a
-- test-side fixture mutation. A's later start must be stale and must not
-- recreate state or disturb B's already-projected access.
select is(public.record_plus_membership_event('source-scheduled-live','customer-731','subscription-731-a','start-731-a10','50000000-0000-0000-0000-000000000731','plus_early_access_monthly','membership_started',now() - interval '20 days',now() - interval '20 days',now() + interval '60 days'),'applied','#165 scheduled-live 731 A start t10 applies');
select is(public.record_plus_membership_event('source-scheduled-live','customer-731','subscription-731-b','start-731-b20','50000000-0000-0000-0000-000000000731','plus_early_access_monthly','membership_started',now() - interval '10 days',now() - interval '10 days',now() + interval '70 days'),'applied','#165 scheduled-live 731 B start t20 replaces A');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000731'),'subscription-731-b','#165 scheduled-live 731 B is current before state deletion');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000731'),'active','#165 scheduled-live 731 B access is active before state deletion');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000731'),now() + interval '70 days','#165 scheduled-live 731 B horizon is recorded before state deletion');
delete from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000731';
select is((select count(*) from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000731'),0::bigint,'#165 scheduled-live 731 test fixture has no reducer state');
select is(public.record_plus_membership_event('source-scheduled-live','customer-731','subscription-731-a','start-731-a30','50000000-0000-0000-0000-000000000731','plus_early_access_monthly','membership_reactivated',now() - interval '1 day',now() - interval '1 day',now() + interval '90 days'),'stale','#165 scheduled-live 731 retired A start t30 is stale when state is absent');
select is((select count(*) from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000731'),0::bigint,'#165 scheduled-live 731 stale A start does not recreate absent state');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000731'),'active','#165 scheduled-live 731 stale A start preserves B access');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000731'),now() + interval '70 days','#165 scheduled-live 731 stale A start preserves B horizon');

-- 732: C receives a future cancellation before its delayed confirmation while
-- A is current. C is admitted before that future cutoff and remains physically
-- retired. Move only terminal_at into the past as a test fixture, then deliver
-- a different stream's pre-cutoff start. It must be stale while the reducer
-- still expires/clamps C access despite retired_at already being set.
select is(public.record_plus_membership_event('source-scheduled-live','customer-732','subscription-732-a','start-732-a1','50000000-0000-0000-0000-000000000732','plus_early_access_monthly','membership_started',now() - interval '40 days',now() - interval '40 days',now() + interval '60 days'),'applied','#165 scheduled-live 732 A start t1 applies');
select is(public.record_plus_membership_event('source-scheduled-live','customer-732','subscription-732-c','cancel-732-c15','50000000-0000-0000-0000-000000000732','plus_early_access_monthly','membership_canceled',now() - interval '25 days',now() - interval '30 days',now() + interval '60 days',true),'stale','#165 scheduled-live 732 cancel-first C future cutoff is retained while noncurrent');
select is((select terminal_at from public.plus_membership_subscription where source_subscription_id='subscription-732-c'),now() + interval '60 days','#165 scheduled-live 732 C future cutoff is recorded');
select is((select retired_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-732-c'),true,'#165 scheduled-live 732 C is physically retired before delayed start');
select is(public.record_plus_membership_event('source-scheduled-live','customer-732','subscription-732-c','start-732-c10','50000000-0000-0000-0000-000000000732','plus_early_access_monthly','membership_started',now() - interval '30 days',now() - interval '30 days',now() + interval '60 days'),'applied','#165 scheduled-live 732 delayed C start t10 is admitted before cutoff');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000732'),'subscription-732-c','#165 scheduled-live 732 delayed C is current');
select is((select retired_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-732-c'),true,'#165 scheduled-live 732 delayed C retains physical retirement marker');
update public.plus_membership_subscription set terminal_at = now() - interval '1 day' where source_subscription_id='subscription-732-c';
select is((select terminal_at from public.plus_membership_subscription where source_subscription_id='subscription-732-c'),now() - interval '1 day','#165 scheduled-live 732 fixture moves C cutoff to yesterday');
select is(public.record_plus_membership_event('source-scheduled-live','customer-732','subscription-732-b','start-732-b-precutoff','50000000-0000-0000-0000-000000000732','plus_early_access_monthly','membership_started',now() - interval '2 days',now() - interval '2 days',now() + interval '30 days'),'stale','#165 scheduled-live 732 pre-cutoff B start is stale after elapsed C cutoff');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000732'),'expired','#165 scheduled-live 732 elapsed cutoff expires access despite physical retirement');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000732'),now() - interval '1 day','#165 scheduled-live 732 elapsed cutoff clamps access at terminal_at');

select * from finish();
rollback;
