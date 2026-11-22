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
update public.plus_membership_ecpay_order set finance_policy_revision = 'policy-v1' where merchant_trade_no = 'BJHP0000000000002751';
insert into public.plus_ecpay_finance_policy(environment, revision, outcome, plan_code, consent_revision, access_effect, approval_sha256, approved_by, approved_at)
 values ('stage', 'policy-v1', 'refund', 'plus_early_access_monthly', 'finance-v1', 'terminate_stream', repeat('c',64), '65000000-0000-0000-0000-000000002751', now());
set local role service_role;
select throws_ok($$select public.confirm_plus_ecpay_financial_outcome(
 (select id from finance_cases where label = 'refund'), 'prod', 'trade-2751', 'refund', 299, 'refund-2751',
 now() - interval '1 hour', repeat('b',64), 'policy-v1', '65000000-0000-0000-0000-000000002751')$$,
 'P0001', 'financial evidence does not match plus charge', 'environment cannot be substituted');
select throws_ok($$select public.confirm_plus_ecpay_financial_outcome(
 (select id from finance_cases where label = 'refund'), 'stage', 'other-trade', 'refund', 299, 'refund-2751',
 now() - interval '1 hour', repeat('b',64), 'policy-v1', '65000000-0000-0000-0000-000000002751')$$,
 'P0001', 'financial evidence does not match plus charge', 'installment TradeNo must match');
select throws_ok($$select public.confirm_plus_ecpay_financial_outcome(
 (select id from finance_cases where label = 'refund'), 'stage', 'trade-2751', 'refund', 100, 'refund-2751',
 now() - interval '1 hour', repeat('b',64), 'policy-v1', '65000000-0000-0000-0000-000000002751')$$,
 'P0001', 'financial evidence does not match plus charge', 'partial financial outcome remains held for explicit policy');
select is(public.confirm_plus_ecpay_financial_outcome(
 (select id from finance_cases where label = 'refund'), 'stage', 'trade-2751', 'refund', 299, 'refund-2751',
 now() - interval '1 hour', repeat('b',64), 'policy-v1', '65000000-0000-0000-0000-000000002751'),
 'applied', 'confirmed full refund folds approved terminal event');
select is((public.resolve_plus_membership_access('65000000-0000-0000-0000-000000002752')->>'access_status'), 'non-member', 'verified terminal outcome cuts access');
select is((select status from public.plus_membership_ecpay_order where merchant_trade_no = 'BJHP0000000000002751'), 'active', 'refund is not fabricated provider cancellation');
select is(public.confirm_plus_ecpay_financial_outcome(
 (select id from finance_cases where label = 'refund'), 'stage', 'trade-2751', 'refund', 299, 'refund-2751',
 now() - interval '1 hour', repeat('b',64), 'policy-v1', '65000000-0000-0000-0000-000000002751'),
 'replayed', 'identical outcome replays');
select throws_ok($$select public.confirm_plus_ecpay_financial_outcome(
 (select id from finance_cases where label = 'refund'), 'stage', 'trade-2751', 'refund', 299, 'refund-2751',
 now() - interval '1 hour', repeat('d',64), 'policy-v1', '65000000-0000-0000-0000-000000002751')$$,
 'P0001', 'plus financial outcome conflict', 'changed evidence conflicts');
select is((select count(*) from public.admin_audit_log where action = 'plus.finance.confirmed'), 1::bigint, 'confirmation audit exactly once');
select is((select count(*) from public.plus_ecpay_finance_open_case), 0::bigint, 'confirmed case leaves the actionable queue');
insert into finance_cases values ('reversal', public.request_plus_ecpay_finance_case('finance-charge', 'reversal', '65000000-0000-0000-0000-000000002751'));
insert into finance_cases values ('dispute', public.request_plus_ecpay_finance_case('finance-charge', 'dispute', '65000000-0000-0000-0000-000000002751'));
insert into finance_cases values ('duplicate', public.request_plus_ecpay_finance_case('finance-charge', 'duplicate_charge', null));
select is(public.request_plus_ecpay_finance_case('finance-charge', 'duplicate_charge', null),
 (select id from finance_cases where label = 'duplicate'), 'automated duplicate queue is idempotent');
reset role;
insert into public.plus_ecpay_finance_policy(environment, revision, outcome, plan_code, consent_revision, access_effect, approval_sha256, approved_by, approved_at)
select 'stage', 'policy-v1', outcome, 'plus_early_access_monthly', 'finance-v1', effect,
 repeat('c',64), '65000000-0000-0000-0000-000000002751', now()
from (values ('reversal','preserve'), ('dispute','terminate_stream'), ('void','preserve')) p(outcome,effect);
set local role service_role;
select is(public.confirm_plus_ecpay_financial_outcome(
 (select id from finance_cases where label = 'reversal'), 'stage', 'trade-2751', 'reversal', 299, 'reversal-2751',
 now() - interval '30 minutes', repeat('e',64), 'policy-v1', '65000000-0000-0000-000000002751'),
 'preserved', 'approved preserve policy records finance without access mutation');
select ok(public.confirm_plus_ecpay_financial_outcome(
 (select id from finance_cases where label = 'dispute'), 'stage', 'trade-2751', 'dispute', 299, 'dispute-2751',
 now() - interval '20 minutes', repeat('f',64), 'policy-v1', '65000000-0000-0000-0000-000000002751')
 in ('applied','stale'), 'verified dispute uses normalized terminal writer');
select is((select count(*) from public.plus_membership_event where event_type = 'membership_reversed'), 0::bigint, 'preserve policy did not invent reversal cutoff');
select is((select count(*) from public.plus_membership_event where event_type = 'membership_disputed'), 1::bigint, 'dispute outcome has its own immutable event');
select throws_ok($$select public.confirm_plus_ecpay_financial_outcome(
 (select id from finance_cases where label = 'duplicate'), 'stage', 'trade-2751', 'void', 299, 'void-2751',
 now() - interval '10 minutes', repeat('1',64), 'policy-v1', '65000000-0000-0000-0000-000000002751')$$,
 '23505', null, 'same installment cannot be confirmed fully refunded twice under different cases');
select is((select count(*) from public.plus_ecpay_finance_open_case), 1::bigint, 'rejected outcome leaves its case actionable');
select throws_ok($$select * from public.create_plus_ecpay_order(
 '65000000-0000-0000-0000-000000002751', 'plus_early_access_monthly', 'stage', 'unapproved-consent')$$,
 'P0001', 'plus financial policy not admitted', 'checkout cannot bypass unresolved financial policies');
select * from finish();
rollback;
