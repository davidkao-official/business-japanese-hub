begin;

select plan(31);

select has_column('public', 'payments', 'provider_checkout_ref',
  'payments separates checkout/session ids from settlement transaction ids');
select ok(
  not has_function_privilege('anon', 'public.finalize_payment_success(uuid,text,timestamptz,text)', 'execute'),
  'anon cannot finalize a payment'
);
select ok(
  not has_function_privilege('authenticated', 'public.finalize_refund_success(uuid,uuid,text,text,timestamptz)', 'execute'),
  'authenticated users cannot finalize a refund'
);
select ok(
  has_function_privilege('service_role', 'public.finalize_payment_success(uuid,text,timestamptz,text)', 'execute'),
  'service_role can finalize a payment'
);

insert into auth.users (id, aud, role)
values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated'),
  ('10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated');

insert into public.orders (
  id, user_id, book_id, item_name_snapshot, published_revision,
  amount_minor, currency, status, jurisdiction, japan_tax_status_snapshot
) values
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'book-primary', 'Primary Book', 'book-primary@r1',
    1999, 'USD', 'pending', 'TW', 'unresolved'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    'book-duplicate', 'Duplicate Book', 'book-duplicate@r1',
    1999, 'USD', 'pending', 'TW', 'unresolved'
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000003',
    'book-repair', 'Repair Book', 'book-repair@r1',
    1999, 'USD', 'pending', 'TW', 'unresolved'
  );

insert into public.payments (
  id, order_id, provider, provider_merchant_ref, amount_minor, currency, status
) values
  (
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'paypal', 'MERCHANT-PRIMARY', 1999, 'USD', 'pending'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'paypal', 'MERCHANT-SECOND', 1999, 'USD', 'pending'
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000002',
    'paypal', 'MERCHANT-PRIMARY-2', 1999, 'USD', 'pending'
  ),
  (
    '30000000-0000-0000-0000-000000000004',
    '20000000-0000-0000-0000-000000000002',
    'paypal', 'MERCHANT-DUPLICATE-2', 1999, 'USD', 'pending'
  ),
  (
    '30000000-0000-0000-0000-000000000005',
    '20000000-0000-0000-0000-000000000003',
    'paypal', 'MERCHANT-REPAIR', 1999, 'USD', 'pending'
  );

select is(
  public.finalize_payment_success(
    '30000000-0000-0000-0000-000000000001', 'CAPTURE-PRIMARY',
    '2026-08-20T01:00:00Z', 'COMPLETED'
  ),
  '{"payment_status":"succeeded","order_status":"paid","granted":true}'::jsonb,
  'first verified success commits payment, order, and grant'
);
select is((select status from public.payments where id = '30000000-0000-0000-0000-000000000001'),
  'succeeded'::text, 'primary payment is succeeded');
select is((select status from public.orders where id = '20000000-0000-0000-0000-000000000001'),
  'paid'::text, 'order is paid');
select results_eq(
  $$ select status, source_order_id, provider_ref
       from public.book_entitlement
      where user_id = '10000000-0000-0000-0000-000000000001'
        and book_id = 'book-primary' $$,
  $$ values ('active'::text, '20000000-0000-0000-0000-000000000001'::uuid, null::text) $$,
  'entitlement uses provider-neutral order provenance and no transaction id'
);

select is(
  public.finalize_payment_success(
    '30000000-0000-0000-0000-000000000001', 'CAPTURE-PRIMARY',
    '2026-08-20T01:00:00Z', 'COMPLETED'
  ),
  '{"payment_status":"succeeded","order_status":"paid","granted":false}'::jsonb,
  'verified-success replay is a no-op'
);
select is((select count(*) from public.book_entitlement where book_id = 'book-primary'),
  1::bigint, 'replay creates no second entitlement');
select is(
  public.finalize_payment_success(
    '30000000-0000-0000-0000-000000000002', 'CAPTURE-SECOND',
    '2026-08-20T01:01:00Z', 'COMPLETED'
  ),
  '{"payment_status":"duplicate_success","order_status":"paid","granted":false}'::jsonb,
  'a second real success is classified as duplicate_success'
);
select is((select status from public.payments where id = '30000000-0000-0000-0000-000000000002'),
  'duplicate_success'::text, 'second payment is marked for finance review');
select is((select source_order_id from public.book_entitlement where book_id = 'book-primary'),
  '20000000-0000-0000-0000-000000000001'::uuid, 'duplicate success preserves entitlement provenance');

insert into public.refunds (
  id, payment_id, provider, amount_minor, currency, status
) values (
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'paypal', 1999, 'USD', 'requested'
);

select is(
  public.finalize_refund_success(
    '40000000-0000-0000-0000-000000000001', null,
    'REFUND-PRIMARY', 'COMPLETED', '2026-08-20T02:00:00Z'
  ),
  jsonb_build_object(
    'refund_id', '40000000-0000-0000-0000-000000000001'::uuid,
    'refund_status', 'succeeded', 'payment_status', 'refunded',
    'order_status', 'refunded', 'entitlement_revoked', true,
    'already_confirmed', false
  ),
  'primary refund commits fact, derived state, and revocation'
);
select results_eq(
  $$ select status, provider_refund_ref from public.refunds
      where id = '40000000-0000-0000-0000-000000000001' $$,
  $$ values ('succeeded'::text, 'REFUND-PRIMARY'::text) $$,
  'refund fact stores authoritative provider reference'
);
select is((select status from public.payments where id = '30000000-0000-0000-0000-000000000001'),
  'refunded'::text, 'primary payment becomes refunded');
select results_eq(
  $$ select o.status, e.status, e.revocation_reason
       from public.orders o
       join public.book_entitlement e on e.source_order_id = o.id
      where o.id = '20000000-0000-0000-0000-000000000001' $$,
  $$ values ('refunded'::text, 'revoked'::text, 'refund'::text) $$,
  'primary refund revokes its order entitlement'
);
select is(
  (public.finalize_refund_success(
    '40000000-0000-0000-0000-000000000001', null,
    'REFUND-PRIMARY', 'COMPLETED', '2026-08-20T02:00:00Z'
  ) ->> 'already_confirmed')::boolean,
  true,
  'refund replay is recognized without repeating derived writes'
);

select is(
  (public.finalize_payment_success(
    '30000000-0000-0000-0000-000000000003', 'CAPTURE-PRIMARY-2',
    '2026-08-20T03:00:00Z', 'COMPLETED'
  ) ->> 'granted')::boolean,
  true,
  'second scenario establishes its primary entitlement'
);
select is(
  (public.finalize_payment_success(
    '30000000-0000-0000-0000-000000000004', 'CAPTURE-DUPLICATE-2',
    '2026-08-20T03:01:00Z', 'COMPLETED'
  ) ->> 'payment_status'),
  'duplicate_success'::text,
  'second scenario classifies the extra charge'
);
select is(
  (public.finalize_refund_success(
    null, '30000000-0000-0000-0000-000000000004',
    'REFUND-DUPLICATE', 'COMPLETED', '2026-08-20T04:00:00Z'
  ) ->> 'entitlement_revoked')::boolean,
  false,
  'provider-originated duplicate refund preserves ownership'
);
select results_eq(
  $$ select o.status, e.status
       from public.orders o
       join public.book_entitlement e on e.source_order_id = o.id
      where o.id = '20000000-0000-0000-0000-000000000002' $$,
  $$ values ('paid'::text, 'active'::text) $$,
  'duplicate refund leaves primary order and entitlement active'
);
select is((select status from public.payments where id = '30000000-0000-0000-0000-000000000004'),
  'refunded'::text, 'duplicate payment itself becomes refunded');
select is((select provider_refund_ref from public.refunds where payment_id = '30000000-0000-0000-0000-000000000004'),
  'REFUND-DUPLICATE'::text, 'provider-originated refund creates its durable refund fact');

select is(
  (public.finalize_payment_success(
    '30000000-0000-0000-0000-000000000005', 'CAPTURE-REPAIR',
    '2026-08-20T05:00:00Z', 'COMPLETED'
  ) ->> 'granted')::boolean,
  true,
  'legacy-repair scenario establishes its primary entitlement'
);

insert into public.refunds (
  id, payment_id, provider, amount_minor, currency, status
) values
  (
    '40000000-0000-0000-0000-000000000010',
    '30000000-0000-0000-0000-000000000005',
    'paypal', 1998, 'USD', 'requested'
  ),
  (
    '40000000-0000-0000-0000-000000000011',
    '30000000-0000-0000-0000-000000000005',
    'paypal', 1999, 'TWD', 'requested'
  ),
  (
    '40000000-0000-0000-0000-000000000012',
    '30000000-0000-0000-0000-000000000005',
    'ecpay', 1999, 'USD', 'requested'
  );

select throws_ok(
  $$ select public.finalize_refund_success(
    '40000000-0000-0000-0000-000000000010', null, 'BAD-AMOUNT', 'COMPLETED', now()
  ) $$,
  'P0001',
  'refund 40000000-0000-0000-0000-000000000010 does not match payment 30000000-0000-0000-0000-000000000005 full-refund contract',
  'refund amount mismatch is rejected inside the transaction'
);
select throws_ok(
  $$ select public.finalize_refund_success(
    '40000000-0000-0000-0000-000000000011', null, 'BAD-CURRENCY', 'COMPLETED', now()
  ) $$,
  'P0001',
  'refund 40000000-0000-0000-0000-000000000011 does not match payment 30000000-0000-0000-0000-000000000005 full-refund contract',
  'refund currency mismatch is rejected inside the transaction'
);
select throws_ok(
  $$ select public.finalize_refund_success(
    '40000000-0000-0000-0000-000000000012', null, 'BAD-PROVIDER', 'COMPLETED', now()
  ) $$,
  'P0001',
  'refund 40000000-0000-0000-0000-000000000012 does not match payment 30000000-0000-0000-0000-000000000005 full-refund contract',
  'refund provider mismatch is rejected inside the transaction'
);
select results_eq(
  $$ select p.status, o.status, e.status
       from public.payments p
       join public.orders o on o.id = p.order_id
       join public.book_entitlement e on e.source_order_id = o.id
      where p.id = '30000000-0000-0000-0000-000000000005' $$,
  $$ values ('succeeded'::text, 'paid'::text, 'active'::text) $$,
  'rejected refund mismatches preserve payment, order, and entitlement'
);

-- Simulate the former non-atomic path stopping immediately after it persisted
-- the refund fact. A replay must finish every missing derived transition.
insert into public.refunds (
  id, payment_id, provider, provider_refund_ref, amount_minor, currency,
  status, provider_status_code, completed_at
) values (
  '40000000-0000-0000-0000-000000000003',
  '30000000-0000-0000-0000-000000000005',
  'paypal', 'REFUND-REPAIR', 1999, 'USD',
  'succeeded', 'COMPLETED', '2026-08-20T06:00:00Z'
);
select is(
  (public.finalize_refund_success(
    '40000000-0000-0000-0000-000000000003', null,
    'REFUND-REPAIR', 'COMPLETED', '2026-08-20T06:00:00Z'
  ) ->> 'already_confirmed')::boolean,
  false,
  'a half-applied succeeded refund is repaired instead of short-circuited'
);
select results_eq(
  $$ select p.status, o.status, e.status
       from public.payments p
       join public.orders o on o.id = p.order_id
       join public.book_entitlement e on e.source_order_id = o.id
      where p.id = '30000000-0000-0000-0000-000000000005' $$,
  $$ values ('refunded'::text, 'refunded'::text, 'revoked'::text) $$,
  'refund replay heals payment, order, and entitlement together'
);

select * from finish();
rollback;
