-- Isolated lifecycle scenario group; all assertions retained from the original suite.
begin;

-- Transaction-stable relative clocks preserve event/tie ordering and keep
-- scheduled cutoffs on their intended side of now() on every execution date.

select plan(74);

insert into auth.users (id, aud, role) values
  ('50000000-0000-0000-0000-000000000164', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000165', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000166', 'authenticated', 'authenticated'),
  ('50000000-0000-0000-0000-000000000167', 'authenticated', 'authenticated');

select has_table('public', 'plus_membership_plan', 'Plus plans are durable server-owned data');
select has_table('public', 'plus_membership_event', 'lifecycle events are durable audit data');
select has_table('public', 'plus_membership_state', 'reducer state is durable');
select has_table('public', 'plus_membership_subscription', 'source subscription binding is canonical durable data');
select ok(exists (
  select 1
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
  where c.conrelid = 'public.plus_membership_subscription'::regclass
    and c.confrelid = 'auth.users'::regclass
    and a.attname = 'user_id'
), 'source subscription binding user_id is an auth.users foreign key');
select has_table('public', 'book_entitlement', 'historical Book ownership remains present');
select ok((select relrowsecurity from pg_class where oid = 'public.plus_membership_event'::regclass) and (select relrowsecurity from pg_class where oid = 'public.plus_membership_state'::regclass), 'lifecycle evidence tables have RLS enabled');
select is((select amount_minor from public.plus_membership_plan where plan_code = 'plus_early_access_monthly'), 29900, 'Early Access is TWD 299');
select is((select amount_minor from public.plus_membership_plan where plan_code = 'plus_standard_monthly'), 39900, 'Standard is TWD 399');
select ok((select active from public.plus_membership_plan where plan_code = 'plus_early_access_monthly') and not (select active from public.plus_membership_plan where plan_code = 'plus_standard_monthly'), 'pricing is not date-switched');
select ok(not has_table_privilege('anon', 'public.plus_membership_event', 'select,insert,update,delete') and not has_table_privilege('authenticated', 'public.plus_membership_state', 'select,insert,update,delete') and not has_table_privilege('service_role', 'public.plus_membership_event', 'insert,update,delete') and not has_table_privilege('authenticated', 'public.plus_membership_subscription', 'insert,update,delete'), 'direct lifecycle evidence writes are closed');
select ok(has_function_privilege('service_role', 'public.record_plus_membership_event(text,text,text,text,uuid,text,text,timestamptz,timestamptz,timestamptz,boolean,jsonb)', 'execute') and not has_function_privilege('authenticated', 'public.record_plus_membership_event(text,text,text,text,uuid,text,text,timestamptz,timestamptz,timestamptz,boolean,jsonb)', 'execute'), 'only service_role can invoke the lifecycle writer');
select ok(has_table_privilege('service_role', 'public.plus_membership_access', 'select') and not has_table_privilege('service_role', 'public.plus_membership_access', 'insert,update,delete'), 'the #139 projection cannot be bypassed by service_role');
select is(public.record_plus_membership_event('source-a','customer-164','subscription-old','start-164','50000000-0000-0000-0000-000000000164','plus_early_access_monthly','membership_started',(now() - interval '21 days'),(now() - interval '21 days'),(now() + interval '9 days')),'applied','started creates active membership');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000164'),'active','started state is active');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000164'),'subscription-old','state is explicitly subscription-scoped');
select throws_ok($$select public.record_plus_membership_event('source-a','customer-164','subscription-old','claimed-by-165','50000000-0000-0000-0000-000000000165','plus_early_access_monthly','membership_renewed',(now() - interval '20 days 23 hours'),(now() - interval '21 days'),(now() + interval '9 days'))$$, 'P0001', 'membership source binding belongs to another user', 'a source stream cannot be rebound to another user');
select is((select count(*) from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000165'),0::bigint,'binding conflict cannot create cross-user access');
select is(public.record_plus_membership_event('source-a','customer-164','subscription-old','renew-164','50000000-0000-0000-0000-000000000164','plus_early_access_monthly','membership_renewed',(now() + interval '9 days'),(now() + interval '9 days'),(now() + interval '40 days')),'applied','renewal advances the same stream');
select is(public.record_plus_membership_event('source-a','customer-164','subscription-old','fail-164','50000000-0000-0000-0000-000000000164','plus_early_access_monthly','membership_payment_failed',(now() + interval '10 days'),(now() + interval '9 days'),(now() + interval '40 days')),'applied','payment failure is accepted');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000164'),'past_due','payment failure projects past_due');
select is(public.record_plus_membership_event('source-a','customer-164','subscription-old','cancel-request-164','50000000-0000-0000-0000-000000000164','plus_early_access_monthly','membership_canceled',(now() + interval '11 days'),(now() + interval '9 days'),(now() + interval '40 days'),true),'applied','period-end cancellation request is accepted');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000164'),'active','cancellation request remains active');
select ok((select cancel_at_period_end from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000164'),'cancellation request records the effective-end flag');
select is(public.record_plus_membership_event('source-a','customer-164','subscription-old','expired-164','50000000-0000-0000-0000-000000000164','plus_early_access_monthly','membership_expired',(now() + interval '40 days'),(now() + interval '40 days'),(now() + interval '70 days')),'applied','expiry event may additionally settle the current stream but is not required for the durable cutoff');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000164'),'expired','expiry removes active membership');

select is(public.record_plus_membership_event('source-a','customer-165','subscription-165','start-165','50000000-0000-0000-0000-000000000165','plus_early_access_monthly','membership_started',(now() - interval '21 days'),(now() - interval '21 days'),(now() + interval '9 days')),'applied','second user starts');
select is(public.record_plus_membership_event('source-a','customer-165','subscription-165','cancel-165','50000000-0000-0000-0000-000000000165','plus_early_access_monthly','membership_canceled',(now() - interval '20 days'),(now() - interval '21 days'),(now() + interval '9 days'),false),'applied','immediate cancellation is accepted');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000165'),'canceled','immediate cancellation is not a grace period');
select is(public.record_plus_membership_event('source-a','customer-165','subscription-165','refund-165','50000000-0000-0000-0000-000000000165','plus_early_access_monthly','membership_refunded',(now() - interval '19 days'),(now() - interval '21 days'),(now() + interval '9 days')),'stale','terminal refund on an immediately canceled stream remains stale');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000165'),'canceled','stale refund leaves the current projection unchanged');
select is(public.record_plus_membership_event('source-a','customer-165','subscription-165','reverse-165','50000000-0000-0000-0000-000000000165','plus_early_access_monthly','membership_reversed',(now() - interval '18 days'),(now() - interval '21 days'),(now() + interval '9 days')),'stale','terminal reversal on an immediately canceled stream remains stale');
select is(public.record_plus_membership_event('source-a','customer-165','subscription-165','dispute-165','50000000-0000-0000-0000-000000000165','plus_early_access_monthly','membership_disputed',(now() - interval '17 days'),(now() - interval '21 days'),(now() + interval '9 days')),'stale','terminal dispute on an immediately canceled stream remains stale');
select is(public.record_plus_membership_event('source-a','customer-165','subscription-165','restore-165','50000000-0000-0000-0000-000000000165','plus_early_access_monthly','membership_restored',(now() - interval '16 days 23 hours'),(now() - interval '21 days'),(now() + interval '9 days')),'stale','restoration cannot reopen a retired stream');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000165'),'canceled','retired stream remains canceled after restoration evidence');
select is(public.record_plus_membership_event('source-a','customer-165','subscription-165','reactivate-165','50000000-0000-0000-0000-000000000165','plus_early_access_monthly','membership_reactivated',(now() - interval '16 days'),(now() - interval '21 days'),(now() + interval '9 days')),'stale','reactivation cannot reopen a retired stream');
select is((select retired_at is not null from public.plus_membership_subscription where source_subscription_id='subscription-165'),true,'terminal evidence permanently retires its source stream');
select is(public.record_plus_membership_event('source-a','customer-165','subscription-165','late-renew-165','50000000-0000-0000-0000-000000000165','plus_early_access_monthly','membership_renewed',(now() - interval '14 days'),(now() - interval '21 days'),(now() + interval '9 days')),'stale','late renewal cannot resurrect a retired stream');
select ok((select count(*) from public.plus_membership_event where source_event_id in ('restore-165','reactivate-165','late-renew-165')) = 3,'retired-stream arrivals remain append-only audit evidence');
select is(public.record_plus_membership_event('source-a','customer-165','subscription-165-new','start-165-new','50000000-0000-0000-0000-000000000165','plus_early_access_monthly','membership_started',(now() - interval '13 days'),(now() - interval '13 days'),(now() + interval '17 days')),'applied','a distinct non-retired stream can become current');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000165'),'active','new stream receives active access');
select is(public.record_plus_membership_event('source-a','customer-165','subscription-165-new','revoke-165','50000000-0000-0000-0000-000000000165','plus_early_access_monthly','membership_revoked',(now() - interval '12 days'),(now() - interval '13 days'),(now() + interval '17 days')),'applied','revocation is accepted');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000165'),'revoked','revocation removes access');

select is(public.record_plus_membership_event('source-a','customer-164','subscription-new','start-new-164','50000000-0000-0000-0000-000000000164','plus_early_access_monthly','membership_started',(now() + interval '70 days'),(now() + interval '70 days'),(now() + interval '101 days')),'applied','a newer subscription can replace the old stream');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000164'),'subscription-new','replacement stream becomes current');
select is(public.record_plus_membership_event('source-a','customer-164','subscription-old','late-old-164','50000000-0000-0000-0000-000000000164','plus_early_access_monthly','membership_payment_failed',(now() + interval '132 days'),(now() + interval '70 days'),(now() + interval '101 days')),'stale','late old-stream event cannot overwrite replacement');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000164'),'active','replacement access survives old-stream event');
select ok((select count(*) from public.plus_membership_event where source_subscription_id='subscription-old') > 0,'old-stream evidence is retained');
select is(public.record_plus_membership_event('source-a','customer-164','subscription-older','older-start-164','50000000-0000-0000-0000-000000000164','plus_early_access_monthly','membership_started',(now() + interval '69 days'),(now() + interval '69 days'),(now() + interval '100 days')),'stale','an older replacement start cannot overwrite the selected stream');
select is((select source_subscription_id from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000164'),'subscription-new','an older replacement start leaves the selected stream unchanged');

select is(public.record_plus_membership_event('source-a','customer-166','subscription-166','replay-166','50000000-0000-0000-0000-000000000166','plus_early_access_monthly','membership_started',(now() - interval '14 days'),(now() - interval '21 days'),(now() + interval '9 days')),'applied','a distinct event is applied');
select is(public.record_plus_membership_event('source-a','customer-166','subscription-166','replay-166','50000000-0000-0000-0000-000000000166','plus_early_access_monthly','membership_started',(now() - interval '14 days'),(now() - interval '21 days'),(now() + interval '9 days'),false,'{"replay":true}'::jsonb),'replayed','replay has no second effect');
select is((select count(*) from public.plus_membership_event where source_event_id='replay-166'),1::bigint,'replay is deduplicated by full source identity');
select throws_ok($$select public.record_plus_membership_event('source-a','customer-165','subscription-165','start-164','50000000-0000-0000-0000-000000000165','plus_early_access_monthly','membership_renewed',(now() - interval '13 days'),(now() - interval '13 days'),(now() + interval '17 days'))$$, 'P0001', 'membership source event identity conflict for source-a/start-164', 'reused event id with changed identity fails closed');
select throws_ok($$select public.record_plus_membership_event('source-a','customer-166','subscription-166','replay-166','50000000-0000-0000-0000-000000000166','plus_early_access_monthly','membership_renewed',(now() - interval '14 days'),(now() - interval '21 days'),(now() + interval '9 days'))$$, 'P0001', 'membership source event facts conflict for source-a/replay-166', 'a duplicate event id with a different event type fails closed');
select throws_ok($$select public.record_plus_membership_event('source-a','customer-166','subscription-166','replay-166','50000000-0000-0000-0000-000000000166','plus_early_access_monthly','membership_started',(now() - interval '14 days'),(now() - interval '20 days'),(now() + interval '10 days'))$$, 'P0001', 'membership source event facts conflict for source-a/replay-166', 'a duplicate event id with a different period fails closed');
select is(public.record_plus_membership_event('source-a','customer-166','subscription-166','replay-166','50000000-0000-0000-0000-000000000166','plus_early_access_monthly','membership_started',(now() - interval '14 days'),(now() - interval '21 days'),(now() + interval '9 days'),false,'{"replay":2}'::jsonb),'replayed','a metadata-only difference still replays after fact conflicts');

select is(public.record_plus_membership_event('source-a','customer-166','subscription-166','z-first-166','50000000-0000-0000-0000-000000000166','plus_early_access_monthly','membership_renewed',(now() - interval '21 days'),(now() - interval '21 days'),(now() + interval '9 days')),'stale','older same-stream candidate cannot replace the newer accepted event');
select is(public.record_plus_membership_event('source-a','customer-166','subscription-166','a-equal-166','50000000-0000-0000-0000-000000000166','plus_early_access_monthly','membership_expired',(now() - interval '21 days'),(now() - interval '21 days'),(now() + interval '9 days')),'stale','equal-time candidate is ordered deterministically');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000166'),'expired','an ordering-stale immediate terminal still revokes access');

select is(public.record_plus_membership_event('source-a','customer-167','subscription-pending','pending-167','50000000-0000-0000-0000-000000000167','plus_early_access_monthly','membership_pending',(now() - interval '21 days'),(now() - interval '21 days'),(now() + interval '9 days')),'applied','uncertain membership is explicitly pending');
select is((select membership_status from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000167'),'pending','pending state is durable');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000167'),'pending','pending projects to the non-member access state');
select is(public.record_plus_membership_event('source-a','customer-167','subscription-pending','active-167','50000000-0000-0000-0000-000000000167','plus_early_access_monthly','membership_started',(now() - interval '20 days'),(now() - interval '21 days'),(now() + interval '9 days')),'applied','pending becomes active only on a newer same-stream start');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000167'),'active','newer same-stream confirmation grants access');
select is(public.record_plus_membership_event('source-a','customer-167','subscription-pending','expire-167','50000000-0000-0000-0000-000000000167','plus_early_access_monthly','membership_expired',(now() + interval '9 days'),(now() + interval '9 days'),(now() + interval '40 days')),'applied','pending stream can reach terminal expiry');
select is(public.record_plus_membership_event('source-a','customer-167','subscription-pending','late-pending-167','50000000-0000-0000-0000-000000000167','plus_early_access_monthly','membership_pending',(now() + interval '10 days'),(now() + interval '9 days'),(now() + interval '40 days')),'stale','pending cannot regress terminal state');
select is(public.record_plus_membership_event('source-a','customer-167','subscription-pending','late-renew-167','50000000-0000-0000-0000-000000000167','plus_early_access_monthly','membership_renewed',(now() + interval '11 days'),(now() + interval '9 days'),(now() + interval '40 days')),'stale','renewal cannot resurrect a retired pending stream');
select is((select membership_status from public.plus_membership_access where user_id='50000000-0000-0000-0000-000000000167'),'expired','terminal access remains unavailable');

select throws_ok($$select public.record_plus_membership_event('source-a','customer-166','subscription-standard','standard-start-166','50000000-0000-0000-0000-000000000166','plus_standard_monthly','membership_started',(now() + interval '10 days'),(now() + interval '10 days'),(now() + interval '41 days'))$$, 'P0001', 'plan plus_standard_monthly is not active for membership activation', 'inactive Standard cannot start a membership');
select throws_ok($$select public.record_plus_membership_event('source-a','customer-166','subscription-standard','standard-renew-166','50000000-0000-0000-0000-000000000166','plus_standard_monthly','membership_renewed',(now() + interval '11 days'),(now() + interval '11 days'),(now() + interval '42 days'))$$, 'P0001', 'plan plus_standard_monthly is not active for membership activation', 'inactive Standard cannot reactivate access through renewal');

delete from auth.users where id='50000000-0000-0000-0000-000000000164';
select ok((select count(*) from public.plus_membership_event where source_customer_id='customer-164') > 0,'audit evidence survives auth deletion');
select is((select bool_and(user_id is null) from public.plus_membership_subscription where source_customer_id='customer-164'),true,'deleted accounts leave retained source evidence unavailable');
select is((select count(*) from public.plus_membership_state where user_id='50000000-0000-0000-0000-000000000164'),0::bigint,'derived state may cascade with the account');

select * from finish();
rollback;
