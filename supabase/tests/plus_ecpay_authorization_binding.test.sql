begin;
select plan(8);
insert into auth.users (id, aud, role) values
  ('65000000-0000-0000-0000-000000000711', 'authenticated', 'authenticated');
create temporary table binding_order as
select * from public.create_plus_ecpay_order(
  '65000000-0000-0000-0000-000000000711', 'plus_early_access_monthly', 'stage', 'consent-v1'
);

select is(public.record_plus_ecpay_authorization(
  'first:trade1', (select merchant_trade_no from binding_order), 'authorization',
  '1', 299, '', 'trade1', '2026-10-22 00:00 UTC', 1, false, repeat('a',64)
)->>'status', 'new', 'signed ReturnURL records first charge without ExecLog');
select public.set_plus_ecpay_receipt_result('first:trade1', 'applied');

select is(public.record_plus_ecpay_authorization(
  'auth:gwsr1', (select merchant_trade_no from binding_order), 'authorization',
  '1', 299, 'gwsr1', 'trade1', '2026-10-22 00:00 UTC', 1, false, repeat('b',64)
)->>'source_event_id', 'first:trade1', 'later ExecLog resolves the same charge identity');
select is((select count(*)::integer from public.plus_membership_ecpay_receipt), 1,
  'later ExecLog creates no second receipt');
select is((select lifecycle_result from public.plus_membership_ecpay_receipt where source_event_id = 'first:trade1'),
  'applied', 'the applied first lifecycle result is preserved');

select is(public.record_plus_ecpay_authorization(
  'auth:gwsr2', (select merchant_trade_no from binding_order), 'authorization',
  '1', 299, 'gwsr2', 'trade2', '2026-11-22 00:00 UTC', 1, false, repeat('c',64)
)->>'total_success_times', '2', 'second charge is a renewal even if ExecLog omits first');

select is(public.record_plus_ecpay_authorization(
  'auth:gwsr1', (select merchant_trade_no from binding_order), 'authorization',
  '1', 300, 'gwsr1', 'trade1', '2026-10-22 00:00 UTC', 1, false, repeat('d',64)
)->>'status', 'conflict', 'aliased first charge with changed amount conflicts');
select is(public.record_plus_ecpay_authorization(
  'first:trade2', (select merchant_trade_no from binding_order), 'authorization',
  '1', 299, '', 'trade2', '2026-11-22 00:00 UTC', 1, false, repeat('e',64)
)->>'source_event_id', 'auth:gwsr2', 'reverse delivery order also reuses canonical receipt');
select is(public.record_plus_ecpay_authorization(
  'auth:gwsr2', (select merchant_trade_no from binding_order), 'authorization',
  '1', 299, 'gwsr2', 'trade2', '2026-11-22 00:00 UTC', 1, false, repeat('f',64)
)->>'status', 'conflict', 'normal gwsr receipts retain immutable hash conflict checks');
select * from finish();
rollback;
