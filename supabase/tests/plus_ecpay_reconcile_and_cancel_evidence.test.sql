begin;
select plan(29);

insert into auth.users (id, aud, role) values
  ('65000000-0000-0000-0000-000000000712', 'authenticated', 'authenticated');

insert into public.plus_membership_ecpay_order (
  merchant_trade_no, environment, user_id, plan_code, period_amount_twd,
  exec_times, consent_revision, status, created_at, updated_at, reconcile_after
)
select 'BJHP' || upper(lpad(to_hex(n), 16, '0')), 'stage',
  '65000000-0000-0000-0000-000000000712'::uuid, 'plus_early_access_monthly', 299,
  99, 'consent-v1', case when n = 1001 then 'active' else 'pending' end,
  now() - interval '35 days', now() - interval '2 days',
  now() - interval '1 day' + n * interval '1 second'
from generate_series(1, 1001) n;
insert into public.plus_membership_ecpay_order (
  merchant_trade_no, environment, user_id, plan_code, period_amount_twd,
  exec_times, consent_revision, status
) values ('BJHPFFFFFFFFFFFFFFFF', 'prod', '65000000-0000-0000-0000-000000000712',
  'plus_early_access_monthly', 299, 99, 'consent-v1', 'active');

select ok(not has_function_privilege('anon', 'public.claim_plus_ecpay_reconcile_order(text)', 'EXECUTE'), 'anon cannot claim work');
select ok(not has_function_privilege('authenticated', 'public.confirm_plus_ecpay_customer_cancel(text,text,text,timestamptz)', 'EXECUTE'), 'browser cannot confirm a provider stop');
select ok(has_function_privilege('service_role', 'public.claim_plus_ecpay_reconcile_order(text)', 'EXECUTE'), 'service role can claim');
select ok(has_function_privilege('service_role', 'public.confirm_plus_ecpay_customer_cancel(text,text,text,timestamptz)', 'EXECUTE'), 'service role can persist verified evidence');
select ok(not has_function_privilege('authenticated', 'public.complete_plus_ecpay_cancel_readback(text)', 'EXECUTE'), 'browser cannot remove pending recovery');

create temporary table claims as
select public.claim_plus_ecpay_reconcile_order('stage') as claimed from generate_series(1, 1000);
select is((select count(distinct claimed->>'merchant_trade_no') from claims), 1000::bigint, 'claims rotate through 1000 distinct failed checkouts');
select is((select count(*) from public.plus_membership_ecpay_order where status = 'pending'), 1000::bigint, 'claim never closes failed orders');
select is(public.claim_plus_ecpay_reconcile_order('stage')->>'merchant_trade_no', 'BJHP00000000000003E9', 'the newer paying order is next despite retained old checkouts');
select is(public.claim_plus_ecpay_reconcile_order('stage'), null::jsonb, 'attempted rows cannot monopolize a second batch');
select is((select updated_at from public.plus_membership_ecpay_order where merchant_trade_no = 'BJHP00000000000003E9'), now()-interval '2 days', 'claim does not overwrite the business timestamp');
select is(public.claim_plus_ecpay_reconcile_order('prod')->>'merchant_trade_no', 'BJHPFFFFFFFFFFFFFFFF', 'environment queues remain separate');

select public.record_plus_membership_event(
  'ecpay_aio_period:stage', 'BJHP00000000000003E9', 'BJHP00000000000003E9', 'initial',
  '65000000-0000-0000-0000-000000000712', 'plus_early_access_monthly',
  'membership_started', now()-interval '30 days', now()-interval '30 days', now()+interval '1 day'
);
select is(public.confirm_plus_ecpay_customer_cancel(
  'BJHP00000000000003E9', '1', repeat('a',64), now()-interval '5 minutes'
)->>'provider_canceled_at', to_jsonb(now()-interval '5 minutes')#>>'{}', 'verified stop has a stable observed boundary');
select is((select status from public.plus_membership_ecpay_order where merchant_trade_no='BJHP00000000000003E9'), 'canceled', 'billing stops independently of paid-time facts');
select is((select count(*) from public.plus_membership_ecpay_receipt where kind='cancel'), 1::bigint, 'stop acknowledgement is auditable');
select is((select count(*) from public.plus_membership_event where event_type='membership_canceled'), 0::bigint, 'no guessed terminal cutoff freezes an incomplete read-back');
select is((select access_period_end from public.plus_membership_stream_summary where source_subscription_id='BJHP00000000000003E9'), now()+interval '1 day', 'stopping alone invents no extra access');
select is(public.confirm_plus_ecpay_customer_cancel(
  'BJHP00000000000003E9', '90100149', repeat('b',64), now()
)->>'provider_canceled_at', to_jsonb(now()-interval '5 minutes')#>>'{}', 'retry retains the first boundary');
select is((select facts_sha256 from public.plus_membership_ecpay_receipt where kind='cancel'), repeat('a',64), 'retry preserves original acknowledgement evidence');

-- Actual lifecycle/access SQL, not a fake that assumes a renewed event grants access.
select is(public.record_plus_membership_event(
  'ecpay_aio_period:stage', 'BJHP00000000000003E9', 'BJHP00000000000003E9', 'delayed-renewal',
  '65000000-0000-0000-0000-000000000712', 'plus_early_access_monthly',
  'membership_renewed', now()-interval '10 minutes', now()-interval '10 minutes', now()+interval '31 days'
), 'applied', 'verified pre-stop renewal can arrive after provider cancellation');
select is((select access_period_end from public.plus_membership_stream_summary where source_subscription_id='BJHP00000000000003E9'), now()+interval '31 days', 'late paid month is not clipped by an invented cancellation cutoff');
select is(public.resolve_plus_membership_access('65000000-0000-0000-0000-000000000712')->>'access_status', 'active', 'real temporal resolver recognizes paid access');
select is(public.claim_plus_ecpay_reconcile_order('stage')->>'status', 'canceled', 'interrupted final read-back remains recoverable after billing stopped');
select public.complete_plus_ecpay_cancel_readback('BJHP00000000000003E9');
select is((select cancel_reconcile_pending from public.plus_membership_ecpay_order where merchant_trade_no='BJHP00000000000003E9'), false, 'successful final read-back leaves no perpetual canceled-order polling');
update public.plus_membership_ecpay_order set reconcile_after=now()-interval '1 second' where merchant_trade_no='BJHP00000000000003E9';
select is(public.claim_plus_ecpay_reconcile_order('stage'), null::jsonb, 'settled canceled order is not polled again');

select public.record_plus_membership_event(
  'ecpay_aio_period:stage', 'BJHP00000000000003E9', 'BJHP00000000000003E9', 'refund',
  '65000000-0000-0000-0000-000000000712', 'plus_early_access_monthly',
  'membership_refunded', now()-interval '1 minute', now()-interval '30 days', now()+interval '31 days'
);
select is(public.resolve_plus_membership_access('65000000-0000-0000-0000-000000000712')->>'access_status', 'non-member', 'financial terminal evidence still denies access');
select public.confirm_plus_ecpay_customer_cancel('BJHP00000000000003E9', '90100149', repeat('c',64), now());
select is(public.resolve_plus_membership_access('65000000-0000-0000-0000-000000000712')->>'access_status', 'non-member', 'provider-cancel replay cannot undo a financial cutoff');
select throws_ok($$select public.confirm_plus_ecpay_customer_cancel('BJHP0000000000000001', '1', repeat('d',64), now())$$, 'P0001', 'invalid customer cancel evidence', 'a duplicate pending checkout cannot become a customer-canceled stream');
select throws_ok($$select public.claim_plus_ecpay_reconcile_order('other')$$, 'P0001', 'invalid ecpay environment', 'invalid environments fail closed');
update public.plus_membership_ecpay_order set reconcile_after=now()-interval '1 second' where merchant_trade_no='BJHP0000000000000001';
select is(public.claim_plus_ecpay_reconcile_order('stage')->>'merchant_trade_no', 'BJHP0000000000000001', 'a failed attempt can retry after its lease expires');

select * from finish();
rollback;
