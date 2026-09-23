-- Isolated lifecycle scenario group; all assertions retained from the original suite.
begin;

select plan(19);

insert into auth.users (id, aud, role) values
  ('50000000-0000-0000-0000-000000000210', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000211', 'authenticated', 'authenticated');

-- A stale later start on C is durable but not admitted while A is current. Once
-- a strictly earlier C start becomes current, the buffered Standard start folds
-- into authoritative active state/access and must advance the exact-plan marker.
update public.plus_membership_plan set active = true where plan_code = 'plus_standard_monthly';
select is(public.record_plus_membership_event('source-a','customer-210','subscription-210-a','start-210-a','50000000-0000-0000-0000-000000000210','plus_early_access_monthly','membership_started',now() - interval '10 days',now() - interval '10 days',now() + interval '20 days'),'applied','#164 buffered-start admission forward delivery starts A after C evidence');
select is(public.record_plus_membership_event('source-a','customer-210','subscription-210-c','start-210-c-standard-later','50000000-0000-0000-0000-000000000210','plus_standard_monthly','membership_started',now() - interval '20 days',now() - interval '20 days',now() + interval '10 days'),'stale','#164 buffered-start admission forward delivery records later C Standard start while A remains current');
select is(public.record_plus_membership_event('source-a','customer-210','subscription-210-a','revoke-210-a','50000000-0000-0000-0000-000000000210','plus_early_access_monthly','membership_revoked',now() - interval '30 days',now() - interval '10 days',now() + interval '20 days'),'stale','#164 buffered-start admission forward delivery retires A at its earlier terminal authority');
select is(public.record_plus_membership_event('source-a','customer-210','subscription-210-c','start-210-c-early','50000000-0000-0000-0000-000000000210','plus_early_access_monthly','membership_renewed',now() - interval '25 days',now() - interval '25 days',now() + interval '5 days'),'applied','#164 buffered-start admission forward delivery makes the earlier C start current and folds Standard');
select is((select plan_code from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000210'),'plus_standard_monthly','#164 buffered-start admission forward delivery projects folded Standard state');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000210'),'active','#164 buffered-start admission forward delivery projects folded active access');
select is((select admitted_plan_code from public.plus_membership_subscription where source_subscription_id='subscription-210-c'),'plus_standard_monthly','#164 buffered-start admission forward delivery marks the folded Standard start');
select is((select admitted_at from public.plus_membership_subscription where source_subscription_id='subscription-210-c'),(select occurred_at from public.plus_membership_event where source_system='source-a' and source_event_id='start-210-c-standard-later'),'#164 buffered-start admission forward delivery records folded Standard evidence time');

-- Reverse delivery reaches the same C Standard state, access, and exact-plan
-- marker without a buffered fold.
select is(public.record_plus_membership_event('source-a','customer-211','subscription-211-a','start-211-a','50000000-0000-0000-0000-000000000211','plus_early_access_monthly','membership_started',now() - interval '10 days',now() - interval '10 days',now() + interval '20 days'),'applied','#164 buffered-start admission reverse delivery starts A');
select is(public.record_plus_membership_event('source-a','customer-211','subscription-211-a','revoke-211-a','50000000-0000-0000-0000-000000000211','plus_early_access_monthly','membership_revoked',now() - interval '30 days',now() - interval '10 days',now() + interval '20 days'),'stale','#164 buffered-start admission reverse delivery retires A at the same terminal authority');
select is(public.record_plus_membership_event('source-a','customer-211','subscription-211-c','start-211-c-early','50000000-0000-0000-0000-000000000211','plus_early_access_monthly','membership_started',now() - interval '25 days',now() - interval '25 days',now() + interval '5 days'),'applied','#164 buffered-start admission reverse delivery applies the earlier C start');
select is(public.record_plus_membership_event('source-a','customer-211','subscription-211-c','start-211-c-standard-later','50000000-0000-0000-0000-000000000211','plus_standard_monthly','membership_renewed',now() - interval '20 days',now() - interval '20 days',now() + interval '10 days'),'applied','#164 buffered-start admission reverse delivery applies Standard directly');
select is((select plan_code from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000211'),'plus_standard_monthly','#164 buffered-start admission reverse delivery projects Standard state');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000211'),'active','#164 buffered-start admission reverse delivery projects active access');
select is((select admitted_plan_code from public.plus_membership_subscription where source_subscription_id='subscription-211-c'),'plus_standard_monthly','#164 buffered-start admission reverse delivery marks Standard directly');
select is((select admitted_at from public.plus_membership_subscription where source_subscription_id='subscription-211-c'),(select occurred_at from public.plus_membership_event where source_system='source-a' and source_event_id='start-211-c-standard-later'),'#164 buffered-start admission reverse delivery records direct Standard evidence time');
select is((select admitted_plan_code from public.plus_membership_subscription where source_subscription_id='subscription-210-c'),(select admitted_plan_code from public.plus_membership_subscription where source_subscription_id='subscription-211-c'),'#164 buffered-start admission delivery orders converge on the exact admitted plan');
select is((select admitted_at from public.plus_membership_subscription where source_subscription_id='subscription-210-c'),(select admitted_at from public.plus_membership_subscription where source_subscription_id='subscription-211-c'),'#164 buffered-start admission delivery orders converge on admitted evidence time');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000210'),(select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000211'),'#164 buffered-start admission delivery orders converge on access horizon');

select * from finish();
rollback;
