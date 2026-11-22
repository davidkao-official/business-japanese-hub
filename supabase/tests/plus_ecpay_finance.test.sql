begin;
select no_plan();
insert into auth.users(id, aud, role) values
 ('65000000-0000-0000-0000-000000002751', 'authenticated', 'authenticated'),
 ('65000000-0000-0000-0000-000000002752', 'authenticated', 'authenticated');
insert into public.finance_roles(user_id, role) values
 ('65000000-0000-0000-0000-000000002751', 'finance_admin');
insert into public.plus_membership_ecpay_order(merchant_trade_no, environment, user_id, plan_code, period_amount_twd, exec_times, consent_revision)
 values ('BJHP0000000000002751', 'stage', '65000000-0000-0000-0000-000000002752', 'plus_early_access_monthly', 299, 99, 'finance-v1');
select public.record_plus_ecpay_receipt('finance-charge', 'BJHP0000000000002751', 'authorization', '1', 299,
 'gwsr-2751', 'trade-2751', now() - interval '1 day', 1, false, repeat('a',64));
select public.record_plus_membership_event('ecpay_aio_period:stage', 'BJHP0000000000002751', 'BJHP0000000000002751',
 'finance-charge', '65000000-0000-0000-0000-000000002752', 'plus_early_access_monthly', 'membership_started',
 now() - interval '1 day', now() - interval '1 day', now() + interval '29 days', false, '{}');
select public.set_plus_ecpay_receipt_result('finance-charge', 'applied');
create temporary table finance_cases(label text primary key, id uuid);
grant all on finance_cases to service_role;

select ok(not has_table_privilege('authenticated', 'public.plus_ecpay_finance_case', 'select'), 'members cannot read financial cases');
select ok(not has_table_privilege('service_role', 'public.plus_ecpay_finance_case', 'insert'), 'case writes use audited RPC');
select ok(not has_table_privilege('service_role', 'public.plus_ecpay_financial_outcome', 'update'), 'outcomes immutable to runtime');
select ok(not has_table_privilege('service_role', 'public.plus_ecpay_finance_policy', 'insert'), 'runtime cannot admit financial policy');
select ok(not has_function_privilege('authenticated', 'public.confirm_plus_ecpay_financial_outcome(uuid,text,text,text,integer,text,timestamp with time zone,text,text,uuid)', 'execute'), 'members cannot confirm outcomes');
select is((public.resolve_plus_membership_access('65000000-0000-0000-0000-000000002752')->>'access_status'), 'active', 'charge grants real temporal access');
set local role service_role;
select throws_ok($$select public.request_plus_ecpay_finance_case('finance-charge', 'refund', null)$$,
 'P0001', 'finance_admin required', 'refund intake requires an admin');
select throws_ok($$select public.request_plus_ecpay_finance_case('missing', 'refund', '65000000-0000-0000-0000-000000002751')$$,
 'P0001', 'verified plus charge required', 'unknown charge rejected');
insert into finance_cases values ('refund', public.request_plus_ecpay_finance_case('finance-charge', 'refund', '65000000-0000-0000-0000-000000002751'));
select is(public.request_plus_ecpay_finance_case('finance-charge', 'refund', '65000000-0000-0000-0000-000000002751'),
 (select id from finance_cases where label = 'refund'), 'request replay returns canonical case');
select is((select count(*) from public.admin_audit_log where action = 'plus.finance.requested'), 1::bigint, 'request and audit are written once');
select is((public.resolve_plus_membership_access('65000000-0000-0000-0000-000000002752')->>'access_status'), 'active', 'request does not revoke access');
select throws_ok($$select public.confirm_plus_ecpay_financial_outcome(
 (select id from finance_cases where label = 'refund'), 'stage', 'trade-2751', 'refund', 299, 'refund-2751',
 now() - interval '1 hour', repeat('b',64), 'policy-v1', '65000000-0000-0000-0000-000000002751')$$,
 'P0001', 'plus financial policy not admitted', 'missing approved policy fails closed');
select is((select count(*) from public.plus_ecpay_financial_outcome), 0::bigint, 'failed confirmation leaves no outcome');
reset role;
select * from finish();
rollback;
