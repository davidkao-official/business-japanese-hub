begin;

select plan(49);

select has_table('public', 'plus_membership_plan', 'Plus plans are durable server-owned data');
select has_table('public', 'plus_membership_event', 'lifecycle events are durable audit data');
select has_table('public', 'plus_membership_state', 'reducer state is durable');
select has_table('public', 'book_entitlement', 'historical Book ownership remains present');
select ok((select relrowsecurity from pg_class where oid = 'public.plus_membership_event'::regclass) and (select relrowsecurity from pg_class where oid = 'public.plus_membership_state'::regclass), 'lifecycle evidence tables have RLS enabled');
select is((select amount_minor from public.plus_membership_plan where plan_code = 'plus_early_access_monthly'), 29900, 'Early Access is TWD 299');
select is((select amount_minor from public.plus_membership_plan where plan_code = 'plus_standard_monthly'), 39900, 'Standard is TWD 399');
select ok((select active from public.plus_membership_plan where plan_code = 'plus_early_access_monthly') and not (select active from public.plus_membership_plan where plan_code = 'plus_standard_monthly'), 'pricing is not date-switched');
select ok(not has_table_privilege('anon', 'public.plus_membership_event', 'select,insert,update,delete') and not has_table_privilege('authenticated', 'public.plus_membership_state', 'select,insert,update,delete') and not has_table_privilege('service_role', 'public.plus_membership_event', 'insert,update,delete'), 'direct lifecycle evidence writes are closed');
select ok(has_function_privilege('service_role', 'public.record_plus_membership_event(text,text,text,text,uuid,text,text,timestamptz,timestamptz,timestamptz,boolean,jsonb)', 'execute') and not has_function_privilege('authenticated', 'public.record_plus_membership_event(text,text,text,text,uuid,text,text,timestamptz,timestamptz,timestamptz,boolean,jsonb)', 'execute'), 'only service_role can invoke the lifecycle writer');
select ok(has_table_privilege('service_role', 'public.plus_membership_access', 'select') and not has_table_privilege('service_role', 'public.plus_membership_access', 'insert,update,delete'), 'the #139 projection cannot be bypassed by service_role');

insert into auth.users (id, aud, role) values
  ('50000000-0000-0000-0000-000000000164', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000165', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000166', 'authenticated', 'authenticated');

select is(public.record_plus_membership_event('source-a','customer-164','subscription-old','start-164','50000000-0000-0000-0000-000000000164','plus_early_access_monthly','membership_started','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z'),'applied','started creates active membership');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000164'),'active','started state is active');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000164'),'subscription-old','state is explicitly subscription-scoped');
select is(public.record_plus_membership_event('source-a','customer-164','subscription-old','renew-164','50000000-0000-0000-0000-000000000164','plus_early_access_monthly','membership_renewed','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z','2026-11-01T00:00:00Z'),'applied','renewal advances the same stream');
select is(public.record_plus_membership_event('source-a','customer-164','subscription-old','fail-164','50000000-0000-0000-0000-000000000164','plus_early_access_monthly','membership_payment_failed','2026-10-02T00:00:00Z','2026-10-01T00:00:00Z','2026-11-01T00:00:00Z'),'applied','payment failure is accepted');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000164'),'past_due','payment failure projects past_due');
select is(public.record_plus_membership_event('source-a','customer-164','subscription-old','cancel-request-164','50000000-0000-0000-0000-000000000164','plus_early_access_monthly','membership_canceled','2026-10-03T00:00:00Z','2026-10-01T00:00:00Z','2026-11-01T00:00:00Z',true),'applied','period-end cancellation request is accepted');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000164'),'active','cancellation request remains active');
select ok((select cancel_at_period_end from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000164'),'cancellation request records the effective-end flag');
select is(public.record_plus_membership_event('source-a','customer-164','subscription-old','expired-164','50000000-0000-0000-0000-000000000164','plus_early_access_monthly','membership_expired','2026-11-01T00:00:00Z','2026-11-01T00:00:00Z','2026-12-01T00:00:00Z'),'applied','effective end is a separate expiry event');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000164'),'expired','expiry removes active membership');

select is(public.record_plus_membership_event('source-a','customer-165','subscription-165','start-165','50000000-0000-0000-0000-000000000165','plus_early_access_monthly','membership_started','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z'),'applied','second user starts');
select is(public.record_plus_membership_event('source-a','customer-165','subscription-165','cancel-165','50000000-0000-0000-0000-000000000165','plus_early_access_monthly','membership_canceled','2026-09-02T00:00:00Z','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z',false),'applied','immediate cancellation is accepted');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000165'),'canceled','immediate cancellation is not a grace period');
select is(public.record_plus_membership_event('source-a','customer-165','subscription-165','refund-165','50000000-0000-0000-0000-000000000165','plus_early_access_monthly','membership_refunded','2026-09-03T00:00:00Z','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z'),'applied','refund correction is accepted');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000165'),'revoked','refund projects revoked');
select is(public.record_plus_membership_event('source-a','customer-165','subscription-165','reverse-165','50000000-0000-0000-0000-000000000165','plus_early_access_monthly','membership_reversed','2026-09-04T00:00:00Z','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z'),'applied','reversal correction is audited');
select is(public.record_plus_membership_event('source-a','customer-165','subscription-165','dispute-165','50000000-0000-0000-0000-000000000165','plus_early_access_monthly','membership_disputed','2026-09-05T00:00:00Z','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z'),'applied','dispute correction is audited');
select is(public.record_plus_membership_event('source-a','customer-165','subscription-165','restore-165','50000000-0000-0000-0000-000000000165','plus_early_access_monthly','membership_restored','2026-09-05T01:00:00Z','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z'),'applied','restoration is an explicit correction event');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000165'),'active','restoration returns active access');
select is(public.record_plus_membership_event('source-a','customer-165','subscription-165','reactivate-165','50000000-0000-0000-0000-000000000165','plus_early_access_monthly','membership_reactivated','2026-09-06T00:00:00Z','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z'),'applied','reactivation restores the stream');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000165'),'active','reactivation restores active access');
select is(public.record_plus_membership_event('source-a','customer-165','subscription-165','revoke-165','50000000-0000-0000-0000-000000000165','plus_early_access_monthly','membership_revoked','2026-09-07T00:00:00Z','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z'),'applied','revocation is accepted');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000165'),'revoked','revocation removes access');

select is(public.record_plus_membership_event('source-a','customer-164','subscription-new','start-new-164','50000000-0000-0000-0000-000000000164','plus_early_access_monthly','membership_started','2026-12-01T00:00:00Z','2026-12-01T00:00:00Z','2027-01-01T00:00:00Z'),'applied','a newer subscription can replace the old stream');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000164'),'subscription-new','replacement stream becomes current');
select is(public.record_plus_membership_event('source-a','customer-164','subscription-old','late-old-164','50000000-0000-0000-0000-000000000164','plus_early_access_monthly','membership_payment_failed','2027-02-01T00:00:00Z','2026-12-01T00:00:00Z','2027-01-01T00:00:00Z'),'stale','late old-stream event cannot overwrite replacement');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000164'),'active','replacement access survives old-stream event');
select ok((select count(*) from public.plus_membership_event where source_subscription_id='subscription-old') > 0,'old-stream evidence is retained');
select is(public.record_plus_membership_event('source-a','customer-164','subscription-older','older-start-164','50000000-0000-0000-0000-000000000164','plus_early_access_monthly','membership_started','2026-11-30T00:00:00Z','2026-11-30T00:00:00Z','2026-12-31T00:00:00Z'),'stale','an older replacement start cannot overwrite the selected stream');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000164'),'subscription-new','an older replacement start leaves the selected stream unchanged');

select is(public.record_plus_membership_event('source-a','customer-165','subscription-165','replay-165','50000000-0000-0000-0000-000000000165','plus_early_access_monthly','membership_started','2026-09-08T00:00:00Z','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z'),'applied','a distinct event is applied');
select is(public.record_plus_membership_event('source-a','customer-165','subscription-165','replay-165','50000000-0000-0000-0000-000000000165','plus_early_access_monthly','membership_started','2026-09-08T00:00:00Z','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z',false,'{"replay":true}'::jsonb),'replayed','replay has no second effect');
select is((select count(*) from public.plus_membership_event where source_event_id='replay-165'),1::bigint,'replay is deduplicated by full source identity');
select throws_ok($$select public.record_plus_membership_event('source-a','customer-165','subscription-165','start-164','50000000-0000-0000-0000-000000000165','plus_early_access_monthly','membership_started','2026-09-09T00:00:00Z','2026-09-09T00:00:00Z','2026-10-09T00:00:00Z')$$, 'P0001', 'membership source event identity conflict for source-a/start-164', 'reused event id with changed identity fails closed');

select is(public.record_plus_membership_event('source-a','customer-166','subscription-166','z-first-166','50000000-0000-0000-0000-000000000166','plus_early_access_monthly','membership_started','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z'),'applied','first equal-time candidate wins under the user lock');
select is(public.record_plus_membership_event('source-a','customer-166','subscription-166','a-equal-166','50000000-0000-0000-0000-000000000166','plus_early_access_monthly','membership_expired','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z'),'stale','equal-time candidate is ordered deterministically');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000166'),'active','equal-time stale event cannot replace state');

select throws_ok($$select public.record_plus_membership_event('source-a','customer-166','subscription-standard','standard-start-166','50000000-0000-0000-0000-000000000166','plus_standard_monthly','membership_started','2026-10-02T00:00:00Z','2026-10-02T00:00:00Z','2026-11-02T00:00:00Z')$$, 'P0001', 'plan plus_standard_monthly is not active for membership activation', 'inactive Standard cannot start a membership');
select throws_ok($$select public.record_plus_membership_event('source-a','customer-166','subscription-standard','standard-renew-166','50000000-0000-0000-0000-000000000166','plus_standard_monthly','membership_renewed','2026-10-03T00:00:00Z','2026-10-03T00:00:00Z','2026-11-03T00:00:00Z')$$, 'P0001', 'plan plus_standard_monthly is not active for membership activation', 'inactive Standard cannot reactivate access through renewal');

delete from auth.users where id='50000000-0000-0000-0000-000000000164';
select ok((select count(*) from public.plus_membership_event where source_customer_id='customer-164') > 0,'audit evidence survives auth deletion');
select is((select count(*) from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000164'),0::bigint,'derived state may cascade with the account');

select * from finish();
rollback;
