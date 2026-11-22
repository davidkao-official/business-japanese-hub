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

set local role service_role;
insert into finance_cases values ('refund', public.request_plus_ecpay_finance_case('finance-charge', 'refund', '65000000-0000-0000-0000-000000002751'));
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
reset role;
select * from finish();
rollback;
