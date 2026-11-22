begin;
select no_plan();
insert into auth.users(id, aud, role) values
 ('65000000-0000-0000-0000-000000002760', 'authenticated', 'authenticated'),
 ('65000000-0000-0000-0000-000000002761', 'authenticated', 'authenticated');

select ok(not has_function_privilege('anon', 'public.claim_plus_ecpay_reconcile_order(text)', 'execute'), 'anonymous cannot claim work');
select ok(not has_function_privilege('authenticated', 'public.release_plus_ecpay_reconcile_order(text,uuid)', 'execute'), 'members cannot release work');
select ok(not has_table_privilege('service_role', 'public.plus_membership_ecpay_order', 'update'), 'queue mutations stay behind RPCs');

-- Synthetic disposable-DB policy fixture; not production admission.
insert into public.plus_ecpay_finance_policy(environment, revision, outcome, plan_code, consent_revision,
 access_effect, approval_sha256, approved_by, approved_at)
select 'stage', 'fixture-policy', outcome, 'plus_early_access_monthly', 'limits-v1',
 'preserve', repeat('f',64), '65000000-0000-0000-0000-000000002760', now()
from unnest(array['refund','void','reversal','dispute']) outcome;

set local role service_role;
select lives_ok($$select * from public.create_plus_ecpay_order(
 '65000000-0000-0000-0000-000000002760', 'plus_early_access_monthly', 'stage', 'limits-v1')$$, 'first checkout admitted');
select throws_ok($$select * from public.create_plus_ecpay_order(
 '65000000-0000-0000-0000-000000002760', 'plus_early_access_monthly', 'stage', 'limits-v1')$$,
 'P0001', 'plus checkout rate limited', 'cooldown enforced in the database');
reset role;
update public.plus_membership_ecpay_order set created_at = now() - interval '2 minutes'
 where user_id = '65000000-0000-0000-0000-000000002760';
set local role service_role;
select lives_ok($$select * from public.create_plus_ecpay_order(
 '65000000-0000-0000-0000-000000002760', 'plus_early_access_monthly', 'stage', 'limits-v1')$$, 'later pending checkout allowed below cap');
reset role;
update public.plus_membership_ecpay_order set created_at = now() - interval '3 minutes'
 where user_id = '65000000-0000-0000-0000-000000002760';
set local role service_role;
select lives_ok($$select * from public.create_plus_ecpay_order(
 '65000000-0000-0000-0000-000000002760', 'plus_early_access_monthly', 'stage', 'limits-v1')$$, 'third pending checkout allowed');
reset role;
update public.plus_membership_ecpay_order set created_at = now() - interval '2 hours'
 where user_id = '65000000-0000-0000-0000-000000002760';
set local role service_role;
select throws_ok($$select * from public.create_plus_ecpay_order(
 '65000000-0000-0000-0000-000000002760', 'plus_early_access_monthly', 'stage', 'limits-v1')$$,
 'P0001', 'plus pending order limit reached', 'pending cap survives cooldown/hour rollover');
select lives_ok($$select * from public.create_plus_ecpay_order(
 '65000000-0000-0000-0000-000000002761', 'plus_early_access_monthly', 'stage', 'limits-v1')$$, 'unrelated user is not throttled');
reset role;
update public.plus_membership_ecpay_order set status = 'ended', created_at = now() - interval '5 minutes';
insert into public.plus_membership_ecpay_order(merchant_trade_no, environment, user_id, plan_code, period_amount_twd, exec_times, consent_revision, status, created_at)
select 'BJHP' || lpad(n::text, 16, '0'), 'stage', '65000000-0000-0000-0000-000000002760',
 'plus_early_access_monthly', 299, 99, 'limits-v1', 'ended', now() - interval '5 minutes'
 from generate_series(2761,2762) n;
set local role service_role;
select throws_ok($$select * from public.create_plus_ecpay_order(
 '65000000-0000-0000-0000-000000002760', 'plus_early_access_monthly', 'stage', 'limits-v1')$$,
 'P0001', 'plus checkout rate limited', 'ended orders still count toward hourly quota');
reset role;

insert into public.plus_membership_ecpay_order(merchant_trade_no, environment, user_id, plan_code, period_amount_twd, exec_times, consent_revision, status, created_at)
select 'BJHP' || lpad(n::text, 16, '0'), 'stage', '65000000-0000-0000-0000-000000002760',
 'plus_early_access_monthly', 299, 99, 'queue-v1', 'pending', now() - n * interval '1 minute'
 from generate_series(2771,2773) n;
create temporary table claimed as select * from public.plus_membership_ecpay_order where false;
grant all on claimed to service_role;
set local role service_role;
insert into claimed select * from public.claim_plus_ecpay_reconcile_order('stage');
select is((select merchant_trade_no from claimed), 'BJHP0000000000002773', 'oldest never-claimed order goes first');
select is((select merchant_trade_no from public.claim_plus_ecpay_reconcile_order('stage')), 'BJHP0000000000002772', 'second worker skips the leased row');
select is(public.release_plus_ecpay_reconcile_order('BJHP0000000000002773', gen_random_uuid()), false, 'wrong lease cannot release work');
select is(public.release_plus_ecpay_reconcile_order((select merchant_trade_no from claimed), (select reconcile_lease_token from claimed)), true, 'exact lease release succeeds');
select is((select merchant_trade_no from public.claim_plus_ecpay_reconcile_order('stage')), 'BJHP0000000000002771', 'released older order does not starve newer work');
select is((select count(*) from public.claim_plus_ecpay_reconcile_order('stage')), 0::bigint, 'recent claims cannot spin within one run');
select is((select count(*) from public.claim_plus_ecpay_reconcile_order('prod')), 0::bigint, 'environment isolation');
reset role;
update public.plus_membership_ecpay_order
 set last_reconcile_claimed_at = now() - interval '3 minutes', reconcile_lease_until = now() - interval '1 second'
 where merchant_trade_no = 'BJHP0000000000002772';
set local role service_role;
select is((select merchant_trade_no from public.claim_plus_ecpay_reconcile_order('stage')), 'BJHP0000000000002772', 'expired crash lease is recoverable');
select * from finish();
rollback;
