-- Focused pgTAP scenarios for reducer and audit fold.
begin;

select plan(17);

insert into auth.users (id, aud, role) values
 ('50000000-0000-0000-0000-000000000300','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000301','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000302','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000303','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000304','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000305','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000306','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000307','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000308','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000309','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000310','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000311','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000312','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000313','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000314','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000315','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000316','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000317','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000318','authenticated','authenticated'),
 ('50000000-0000-0000-0000-000000000319','authenticated','authenticated');

update public.plus_membership_plan set active = true
where plan_code in ('plus_early_access_monthly','plus_standard_monthly');

select ok((select relrowsecurity from pg_class where oid='public.plus_membership_stream_summary'::regclass),'summary table enforces RLS');
select isnt(has_table_privilege('anon','public.plus_membership_stream_summary','select'),true,'anon cannot read stream summaries');
select isnt(has_table_privilege('authenticated','public.plus_membership_stream_summary','select'),true,'authenticated cannot read stream summaries');
select isnt(has_function_privilege('service_role','public.recompute_plus_membership_stream(text,text,text)','execute'),true,'service_role cannot call the internal stream fold directly');
select isnt(has_function_privilege('service_role','public.project_plus_membership_user(uuid)','execute'),true,'service_role cannot call the internal projection helper directly');

-- Renewal and payment failure fold identically when delivered in either order.
select is(public.record_plus_membership_event('source-a','c300','s300','start300','50000000-0000-0000-0000-000000000300','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-10-01'),'applied','300 start changes selected projection');
select is((select reducer_version from public.plus_membership_event where source_event_id='start300'),1,'300 accepted start carries reducer proof version');
select is(public.record_plus_membership_event('source-a','c300','s300','renew300','50000000-0000-0000-0000-000000000300','plus_early_access_monthly','membership_renewed','2026-09-05','2026-09-05','2026-10-05'),'applied','300 renewal applies');
select is(public.record_plus_membership_event('source-a','c300','s300','fail300','50000000-0000-0000-0000-000000000300','plus_early_access_monthly','membership_payment_failed','2026-09-10','2026-09-10','2026-10-10'),'applied','300 failure applies');
select is(public.record_plus_membership_event('source-a','c301','s301','fail301','50000000-0000-0000-0000-000000000301','plus_early_access_monthly','membership_payment_failed','2026-09-10','2026-09-10','2026-10-10'),'stale','301 failure before start is audit only');
select is(public.record_plus_membership_event('source-a','c301','s301','renew301','50000000-0000-0000-0000-000000000301','plus_early_access_monthly','membership_renewed','2026-09-05','2026-09-05','2026-10-05'),'stale','301 renewal before start is audit only');
select is(public.record_plus_membership_event('source-a','c301','s301','start301','50000000-0000-0000-0000-000000000301','plus_early_access_monthly','membership_started','2026-09-01','2026-09-01','2026-10-01'),'applied','301 start reconciles buffered history');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000300'),'past_due','300 final access is past_due');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000301'),'past_due','301 final access is past_due');
select is((select source_event_id from public.plus_membership_event where event_id=(select applied_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000300')),'fail300','300 final applied event is its failure');
select is((select source_event_id from public.plus_membership_event where event_id=(select applied_event_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000301')),'fail301','301 final applied event is its failure');
select is((select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000300'),(select current_period_end from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000301'),'renewal permutation final horizon matches');

select * from finish();
rollback;
