begin;

select plan(40);

insert into auth.users (id, aud, role) values
  ('65000000-0000-0000-0000-000000000701', 'authenticated', 'authenticated'),
  ('65000000-0000-0000-0000-000000000702', 'authenticated', 'authenticated');

create temporary table ecpay_test_orders (
  label text primary key,
  merchant_trade_no text not null,
  period_amount_twd integer not null,
  exec_times integer not null
);
grant select, insert on ecpay_test_orders to service_role;

select ok(has_table_privilege('service_role', 'public.plus_membership_ecpay_order', 'select'), 'service_role can select plus_membership_ecpay_order');

select isnt(has_table_privilege('service_role', 'public.plus_membership_ecpay_order', 'insert'), true, 'service_role cannot insert plus_membership_ecpay_order directly');

select isnt(has_table_privilege('service_role', 'public.plus_membership_ecpay_order', 'update'), true, 'service_role cannot update plus_membership_ecpay_order directly');

select isnt(has_table_privilege('service_role', 'public.plus_membership_ecpay_order', 'delete'), true, 'service_role cannot delete plus_membership_ecpay_order directly');

select ok(has_table_privilege('service_role', 'public.plus_membership_ecpay_receipt', 'select'), 'service_role can select plus_membership_ecpay_receipt');

select isnt(has_table_privilege('service_role', 'public.plus_membership_ecpay_receipt', 'insert'), true, 'service_role cannot insert plus_membership_ecpay_receipt directly');

select isnt(has_table_privilege('service_role', 'public.plus_membership_ecpay_receipt', 'update'), true, 'service_role cannot update plus_membership_ecpay_receipt directly');

select isnt(has_table_privilege('service_role', 'public.plus_membership_ecpay_receipt', 'delete'), true, 'service_role cannot delete plus_membership_ecpay_receipt directly');

select isnt(has_function_privilege('anon', 'public.create_plus_ecpay_order(uuid,text,text,text)', 'execute'), true, 'anon cannot execute create_plus_ecpay_order');

select isnt(has_function_privilege('anon', 'public.record_plus_ecpay_receipt(text,text,text,text,integer,text,text,timestamp with time zone,integer,boolean,text)', 'execute'), true, 'anon cannot execute record_plus_ecpay_receipt');

select isnt(has_function_privilege('anon', 'public.set_plus_ecpay_receipt_result(text,text)', 'execute'), true, 'anon cannot execute set_plus_ecpay_receipt_result');

select isnt(has_function_privilege('anon', 'public.set_plus_ecpay_order_status(text,text)', 'execute'), true, 'anon cannot execute set_plus_ecpay_order_status');

select isnt(has_function_privilege('authenticated', 'public.create_plus_ecpay_order(uuid,text,text,text)', 'execute'), true, 'authenticated cannot execute create_plus_ecpay_order');

select isnt(has_function_privilege('authenticated', 'public.record_plus_ecpay_receipt(text,text,text,text,integer,text,text,timestamp with time zone,integer,boolean,text)', 'execute'), true, 'authenticated cannot execute record_plus_ecpay_receipt');

select isnt(has_function_privilege('authenticated', 'public.set_plus_ecpay_receipt_result(text,text)', 'execute'), true, 'authenticated cannot execute set_plus_ecpay_receipt_result');

select isnt(has_function_privilege('authenticated', 'public.set_plus_ecpay_order_status(text,text)', 'execute'), true, 'authenticated cannot execute set_plus_ecpay_order_status');

select ok(has_function_privilege('service_role', 'public.create_plus_ecpay_order(uuid,text,text,text)', 'execute'), 'service_role can execute create_plus_ecpay_order');

select ok(has_function_privilege('service_role', 'public.record_plus_ecpay_receipt(text,text,text,text,integer,text,text,timestamp with time zone,integer,boolean,text)', 'execute'), 'service_role can execute record_plus_ecpay_receipt');

select ok(has_function_privilege('service_role', 'public.set_plus_ecpay_receipt_result(text,text)', 'execute'), 'service_role can execute set_plus_ecpay_receipt_result');

select ok(has_function_privilege('service_role', 'public.set_plus_ecpay_order_status(text,text)', 'execute'), 'service_role can execute set_plus_ecpay_order_status');

set local role service_role;

insert into ecpay_test_orders
select 'primary', o.* from public.create_plus_ecpay_order(
  '65000000-0000-0000-0000-000000000701', 'plus_early_access_monthly', 'stage', 'consent-v1'
) o;

insert into ecpay_test_orders
select 'simulated', o.* from public.create_plus_ecpay_order(
  '65000000-0000-0000-0000-000000000702', 'plus_early_access_monthly', 'stage', 'consent-v1'
) o;

select matches((select merchant_trade_no from ecpay_test_orders where label = 'primary'),
  '^BJHP[0-9A-Z]{16}$', 'order trade number is BJHP plus 16 uppercase letters or digits');

select is((select period_amount_twd from ecpay_test_orders where label = 'primary'),
  299, 'order uses the active plan amount in TWD');

select is((select exec_times from ecpay_test_orders where label = 'primary'),
  99, 'order has 99 executions');

select throws_ok($$
  select * from public.create_plus_ecpay_order(
    '65000000-0000-0000-0000-000000000701', 'plus_standard_monthly', 'stage', 'consent-v1'
  )
$$, 'P0001', 'plus plan not active', 'inactive plan cannot create an order');

select lives_ok($$
  insert into ecpay_test_orders
  select 'abandoned', o.* from public.create_plus_ecpay_order(
    '65000000-0000-0000-0000-000000000701', 'plus_early_access_monthly', 'stage', 'consent-v1'
  ) o
$$, 'multiple pending checkouts are allowed');

select is(public.record_plus_ecpay_receipt(
  (select merchant_trade_no || ':auth:1' from ecpay_test_orders where label = 'primary'),
  (select merchant_trade_no from ecpay_test_orders where label = 'primary'),
  'authorization', '1', 299, '1', 'provider-trade-1',
  '2026-10-27T03:20:00+09:00'::timestamptz, 1, false, repeat('a', 64)
), 'new', 'first receipt is new');

select is(public.record_plus_ecpay_receipt(
  (select merchant_trade_no || ':auth:1' from ecpay_test_orders where label = 'primary'),
  (select merchant_trade_no from ecpay_test_orders where label = 'primary'),
  'authorization', '1', 299, '1', 'provider-trade-1',
  '2026-10-27T03:20:00+09:00'::timestamptz, 1, false, repeat('a', 64)
), 'replayed', 'identical receipt is replayed');

select is(public.record_plus_ecpay_receipt(
  (select merchant_trade_no || ':auth:1' from ecpay_test_orders where label = 'primary'),
  (select merchant_trade_no from ecpay_test_orders where label = 'primary'),
  'authorization', '1', 299, '1', 'provider-trade-1',
  '2026-10-27T03:20:00+09:00'::timestamptz, 1, false, repeat('b', 64)
), 'conflict', 'changed receipt facts conflict');

select is((select status from public.plus_membership_ecpay_order
  where merchant_trade_no = (select merchant_trade_no from ecpay_test_orders where label = 'primary')),
  'active', 'first successful authorization activates the order');

select throws_ok($$
  select * from public.create_plus_ecpay_order(
    '65000000-0000-0000-0000-000000000701', 'plus_early_access_monthly', 'stage', 'consent-v1'
  )
$$, 'P0001', 'plus ecpay order already active', 'an active order blocks a second checkout');

select is(public.record_plus_ecpay_receipt(
  (select merchant_trade_no || ':auth:1' from ecpay_test_orders where label = 'simulated'),
  (select merchant_trade_no from ecpay_test_orders where label = 'simulated'),
  'authorization', '1', 299, '1', 'provider-trade-1',
  '2026-10-27T03:20:00+09:00'::timestamptz, 1, true, repeat('c', 64)
), 'new', 'simulated authorization is recorded');

select is((select status from public.plus_membership_ecpay_order
  where merchant_trade_no = (select merchant_trade_no from ecpay_test_orders where label = 'simulated')),
  'pending', 'simulated authorization does not activate the order');

select lives_ok($$
  select public.set_plus_ecpay_receipt_result(
    (select merchant_trade_no || ':auth:1' from ecpay_test_orders where label = 'primary'), 'applied'
  )
$$, 'receipt result can be set once');

select is((select lifecycle_result from public.plus_membership_ecpay_receipt
  where source_event_id = (select merchant_trade_no || ':auth:1' from ecpay_test_orders where label = 'primary')),
  'applied', 'receipt stores the lifecycle result');

select lives_ok($$
  select public.set_plus_ecpay_receipt_result(
    (select merchant_trade_no || ':auth:1' from ecpay_test_orders where label = 'primary'), 'applied'
  )
$$, 'setting the same receipt result is a no-op');

select throws_ok($$
  select public.set_plus_ecpay_receipt_result(
    (select merchant_trade_no || ':auth:1' from ecpay_test_orders where label = 'primary'), 'stale'
  )
$$, 'P0001', 'receipt result already set', 'receipt result cannot be changed');

select lives_ok($$
  select public.set_plus_ecpay_order_status(
    (select merchant_trade_no from ecpay_test_orders where label = 'primary'), 'cancel_requested'
  )
$$, 'active order can request cancellation');

select is((select status from public.plus_membership_ecpay_order
  where merchant_trade_no = (select merchant_trade_no from ecpay_test_orders where label = 'primary')),
  'cancel_requested', 'valid transition updates the order status');

select throws_ok($$
  select public.set_plus_ecpay_order_status(
    (select merchant_trade_no from ecpay_test_orders where label = 'primary'), 'pending'
  )
$$, 'P0001', 'invalid ecpay order transition', 'order cannot return to pending');

select lives_ok($$
  select public.set_plus_ecpay_order_status(
    (select merchant_trade_no from ecpay_test_orders where label = 'primary'), 'cancel_requested'
  )
$$, 'setting the same order status is a no-op');

reset role;

select * from finish();
rollback;

