-- Isolated exact-plan admission and durable terminal evidence scenarios.
begin;

select plan(22);

insert into auth.users (id, aud, role) values
  ('50000000-0000-0000-0000-000000000206', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000207', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000208', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000209', 'authenticated', 'authenticated');

-- Admission is durable for its exact plan, not a blanket bypass for any later
-- inactive plan code on the same provider stream.
select is(public.record_plus_membership_event('source-a','customer-206','subscription-206','start-206','50000000-0000-0000-0000-000000000206','plus_early_access_monthly','membership_started',now() - interval '2 days',now() - interval '2 days',now() + interval '28 days'),'applied','#164 plan-specific admission records Early Access activation');
select throws_ok($$select public.record_plus_membership_event('source-a','customer-206','subscription-206','renew-standard-206','50000000-0000-0000-0000-000000000206','plus_standard_monthly','membership_renewed',now() - interval '1 day',now() - interval '2 days',now() + interval '29 days')$$, 'P0001', 'plan plus_standard_monthly is not active for membership activation', '#164 inactive changed plan cannot use a different admitted plan marker');

-- Cancellation records terminal authority without activation. An unadmitted
-- inactive-plan stream stays pending; actual confirmation remains catalog-gated.
update public.plus_membership_plan set active = false where plan_code = 'plus_standard_monthly';
select is(public.record_plus_membership_event('source-a','customer-207','subscription-207','pending-207','50000000-0000-0000-0000-000000000207','plus_standard_monthly','membership_pending',now() - interval '2 days',now() - interval '2 days',now() + interval '28 days'),'applied','#164 unadmitted inactive-plan fixture accepts only pending evidence');
select is(public.record_plus_membership_event('source-a','customer-207','subscription-207','cancel-207','50000000-0000-0000-0000-000000000207','plus_standard_monthly','membership_canceled',now() - interval '1 day',now() - interval '2 days',now() + interval '28 days',true),'applied','#164 unadmitted inactive-plan cancellation records cutoff without activation');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000207'),'pending','#164 accepted inactive-plan cancellation leaves only pending state');

-- Terminal delivery order cannot widen C's retired-stream exception: C's
-- immediate revocation is effective before its later scheduled cutoff, so a
-- start after revocation cannot replace the still-current A stream.
select is(public.record_plus_membership_event('source-a','customer-208','subscription-208-a','start-208-a','50000000-0000-0000-0000-000000000208','plus_early_access_monthly','membership_started',now() - interval '40 days',now() - interval '40 days',now() + interval '20 days'),'applied','#164 earliest-terminal fixture starts current A');
select is(public.record_plus_membership_event('source-a','customer-208','subscription-208-c','cancel-208-c','50000000-0000-0000-0000-000000000208','plus_early_access_monthly','membership_canceled',now() - interval '30 days',now() - interval '30 days',now() + interval '20 days',true),'stale','#164 future scheduled C terminal is durable while A remains current');
select is(public.record_plus_membership_event('source-a','customer-208','subscription-208-c','revoke-208-c','50000000-0000-0000-0000-000000000208','plus_early_access_monthly','membership_revoked',now() - interval '20 days',now() - interval '30 days',now() + interval '20 days'),'stale','#164 earlier immediate C terminal remains stale against current A but retires C');
select is((select retired_event_id from public.plus_membership_subscription where source_subscription_id='subscription-208-c'),(select event_id from public.plus_membership_event where source_system='source-a' and source_event_id='revoke-208-c'),'#164 retirement stores C earliest effective terminal authority');
select is(public.record_plus_membership_event('source-a','customer-208','subscription-208-c','start-208-c','50000000-0000-0000-0000-000000000208','plus_early_access_monthly','membership_started',now() - interval '15 days',now() - interval '30 days',now() + interval '20 days'),'stale','#164 C start after its immediate terminal cannot replace A before scheduled cutoff');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000208'),'subscription-208-a','#164 earliest terminal reconciliation leaves current A unchanged');

-- An admitted stream may move to a different plan only while that incoming
-- plan is live. That successful application advances the exact-plan marker,
-- so later same-plan lifecycle evidence stays valid when new sales close.
update public.plus_membership_plan set active = true where plan_code = 'plus_standard_monthly';
select is((select active from public.plus_membership_plan where plan_code='plus_standard_monthly'),true,'#164 admitted-plan transition enables the explicit Standard fixture');
select is(public.record_plus_membership_event('source-a','customer-209','subscription-209','start-209-early','50000000-0000-0000-0000-000000000209','plus_early_access_monthly','membership_started',now() - interval '4 days',now() - interval '4 days',now() + interval '26 days'),'applied','#164 admitted-plan transition starts an admitted Early Access stream');
select is((select admitted_plan_code from public.plus_membership_subscription where source_subscription_id='subscription-209'),'plus_early_access_monthly','#164 admitted-plan transition records the initial exact plan');
select is(public.record_plus_membership_event('source-a','customer-209','subscription-209','renew-209-standard','50000000-0000-0000-0000-000000000209','plus_standard_monthly','membership_renewed',now() - interval '3 days',now() - interval '3 days',now() + interval '27 days'),'applied','#164 admitted-plan transition applies the live Standard renewal on an admitted stream');
select is((select plan_code from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000209'),'plus_standard_monthly','#164 admitted-plan transition projects the applied Standard plan');
select is((select admitted_plan_code from public.plus_membership_subscription where source_subscription_id='subscription-209'),'plus_standard_monthly','#164 admitted-plan transition advances the durable exact-plan marker');
update public.plus_membership_plan set active = false where plan_code = 'plus_standard_monthly';
select is((select active from public.plus_membership_plan where plan_code='plus_standard_monthly'),false,'#164 admitted-plan transition closes Standard to new sales after its active application');
select is(public.record_plus_membership_event('source-a','customer-209','subscription-209','renew-209-standard-closed','50000000-0000-0000-0000-000000000209','plus_standard_monthly','membership_renewed',now() - interval '2 days',now() - interval '2 days',now() + interval '28 days'),'applied','#164 admitted-plan transition accepts later same-plan renewal after Standard closes');
select is(public.record_plus_membership_event('source-a','customer-209','subscription-209','cancel-209-standard-closed','50000000-0000-0000-0000-000000000209','plus_standard_monthly','membership_canceled',now() - interval '1 day',now() - interval '2 days',now() + interval '28 days',true),'applied','#164 admitted-plan transition accepts later same-plan period-end cancellation after Standard closes');
select is((select admitted_plan_code from public.plus_membership_subscription where source_subscription_id='subscription-209'),'plus_standard_monthly','#164 admitted-plan transition keeps the advanced marker after same-plan lifecycle evidence');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000209'),'active','#164 admitted-plan transition preserves the pre-cutoff active projection');

select * from finish();
rollback;
