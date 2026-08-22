begin;

select plan(46);

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
  amount_minor, currency, status, jurisdiction, japan_tax_status_snapshot,
  customer_email_snapshot
) values
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'book-primary', 'Primary Book', 'book-primary@r1',
    1999, 'USD', 'pending', 'TW', 'unresolved', 'primary@example.com'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    'book-duplicate', 'Duplicate Book', 'book-duplicate@r1',
    1999, 'USD', 'pending', 'TW', 'unresolved', 'duplicate@example.com'
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000003',
    'book-repair', 'Repair Book', 'book-repair@r1',
    1999, 'USD', 'pending', 'TW', 'unresolved', 'repair@example.com'
  );

insert into public.order_compliance (
  order_id, jurisdiction, locale, notice_version, consent_version,
  consent_granted, notice_text_snapshot, consent_text_snapshot, consent_timestamp
) values
  ('20000000-0000-0000-0000-000000000001', 'TW', 'en', 'notice-v1', 'consent-v1', true, 'Notice', 'Consent', now()),
  ('20000000-0000-0000-0000-000000000002', 'TW', 'en', 'notice-v1', 'consent-v1', true, 'Notice', 'Consent', now()),
  ('20000000-0000-0000-0000-000000000003', 'TW', 'en', 'notice-v1', 'consent-v1', true, 'Notice', 'Consent', now());

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

select throws_ok(
  $$ update public.payments
        set amount_minor = 1
      where id = '30000000-0000-0000-0000-000000000001' $$,
  'P0001',
  'payments: identity and commercial facts are immutable after creation',
  'a service path cannot rewrite the authoritative Payment amount'
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
select throws_ok(
  $$ update public.payments
        set provider_payment_ref = 'CAPTURE-TAMPERED'
      where id = '30000000-0000-0000-0000-000000000001' $$,
  'P0001',
  'payments: provider references and paid_at cannot change once recorded',
  'a settled provider transaction reference cannot be replaced'
);
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
select throws_ok(
  $$ update public.refunds
        set amount_minor = 1
      where id = '40000000-0000-0000-0000-000000000001' $$,
  'P0001',
  'refunds: identity and commercial facts are immutable after creation',
  'a Refund cannot be changed from the full authoritative amount'
);
select throws_ok(
  $$ update public.refunds
        set provider_refund_ref = 'REFUND-TAMPERED'
      where id = '40000000-0000-0000-0000-000000000001' $$,
  'P0001',
  'refunds: provider reference cannot change once recorded',
  'a confirmed provider Refund reference cannot be replaced'
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
  );

select throws_ok(
  $$ select public.finalize_refund_success(
    '40000000-0000-0000-0000-000000000010', null, 'BAD-AMOUNT', 'COMPLETED', now()
  ) $$,
  'P0001',
  'refund 40000000-0000-0000-0000-000000000010 does not match payment 30000000-0000-0000-0000-000000000005 full-refund contract',
  'refund amount mismatch is rejected inside the transaction'
);
delete from public.refunds
 where id = '40000000-0000-0000-0000-000000000010';
insert into public.refunds (
  id, payment_id, provider, amount_minor, currency, status
) values (
  '40000000-0000-0000-0000-000000000010',
  '30000000-0000-0000-0000-000000000005',
  'paypal', 1999, 'TWD', 'requested'
);
select throws_ok(
  $$ select public.finalize_refund_success(
    '40000000-0000-0000-0000-000000000010', null, 'BAD-CURRENCY', 'COMPLETED', now()
  ) $$,
  'P0001',
  'refund 40000000-0000-0000-0000-000000000010 does not match payment 30000000-0000-0000-0000-000000000005 full-refund contract',
  'refund currency mismatch is rejected inside the transaction'
);
delete from public.refunds
 where id = '40000000-0000-0000-0000-000000000010';
insert into public.refunds (
  id, payment_id, provider, amount_minor, currency, status
) values (
  '40000000-0000-0000-0000-000000000010',
  '30000000-0000-0000-0000-000000000005',
  'ecpay', 1999, 'USD', 'requested'
);
select throws_ok(
  $$ select public.finalize_refund_success(
    '40000000-0000-0000-0000-000000000010', null, 'BAD-PROVIDER', 'COMPLETED', now()
  ) $$,
  'P0001',
  'refund 40000000-0000-0000-0000-000000000010 does not match payment 30000000-0000-0000-0000-000000000005 full-refund contract',
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

-- The rows above are deliberately-invalid injected facts. Remove that one
-- fixture before simulating the only valid full refund for this Payment.
delete from public.refunds
 where id = '40000000-0000-0000-0000-000000000010';

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
    'REFUND-REPAIR', 'COMPLETED', '2026-08-20T06:10:00Z'
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
select is(
  (select completed_at from public.refunds where id = '40000000-0000-0000-0000-000000000003'),
  '2026-08-20T06:00:00Z'::timestamptz,
  'repair preserves the first authoritative refund completion timestamp'
);

-- A refund leaves a revoked lifecycle row. A legitimate later purchase of the
-- same book must rebind that row to the new Order so a second refund can revoke
-- access again instead of targeting stale provenance.
insert into public.orders (
  id, user_id, book_id, item_name_snapshot, published_revision,
  amount_minor, currency, status, jurisdiction, japan_tax_status_snapshot,
  customer_email_snapshot, customer_locale_snapshot
) values (
  '20000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000001',
  'book-primary', 'Primary Book Repurchase', 'book-primary@r2',
  1999, 'USD', 'pending', 'TW', 'unresolved', 'repurchase@example.com', 'en'
);

insert into public.payments (
  id, order_id, provider, provider_merchant_ref, amount_minor, currency, status
) values (
  '30000000-0000-0000-0000-000000000006',
  '20000000-0000-0000-0000-000000000004',
  'paypal', 'MERCHANT-REPURCHASE', 1999, 'USD', 'pending'
);

select is(
  (public.finalize_payment_success(
    '30000000-0000-0000-0000-000000000006', 'CAPTURE-REPURCHASE',
    '2026-08-20T07:00:00Z', 'COMPLETED'
  ) ->> 'granted')::boolean,
  true,
  'repurchase reactivates the refunded book entitlement'
);
select results_eq(
  $$ select status, source_order_id
       from public.book_entitlement
      where user_id = '10000000-0000-0000-0000-000000000001'
        and book_id = 'book-primary' $$,
  $$ values ('active'::text, '20000000-0000-0000-0000-000000000004'::uuid) $$,
  'repurchase rebinds entitlement provenance to the new Order'
);

select is(
  (public.finalize_refund_success(
    '40000000-0000-0000-0000-000000000001', null,
    'REFUND-PRIMARY', 'COMPLETED', '2026-08-20T07:10:00Z'
  ) ->> 'already_confirmed')::boolean,
  true,
  'replaying an old refund after repurchase does not reject current entitlement provenance'
);

insert into public.refunds (
  id, payment_id, provider, provider_refund_ref, amount_minor, currency, status
) values (
  '40000000-0000-0000-0000-000000000004',
  '30000000-0000-0000-0000-000000000006',
  'paypal', 'REFUND-REPURCHASE', 1999, 'USD', 'processing'
);

select is(
  (public.finalize_refund_success(
    '40000000-0000-0000-0000-000000000004', null,
    null, 'REFUNDED', '2026-08-20T08:00:00Z'
  ) ->> 'entitlement_revoked')::boolean,
  true,
  'the repurchase refund reports an entitlement revocation'
);
select is(
  (select provider_refund_ref from public.refunds
    where id = '40000000-0000-0000-0000-000000000004'),
  'REFUND-REPURCHASE'::text,
  'capture-level REFUNDED evidence preserves the existing PayPal refund resource id'
);
select results_eq(
  $$ select status, source_order_id, revocation_reason
       from public.book_entitlement
      where user_id = '10000000-0000-0000-0000-000000000001'
        and book_id = 'book-primary' $$,
  $$ values (
       'revoked'::text,
       '20000000-0000-0000-0000-000000000004'::uuid,
       'refund'::text
     ) $$,
  'a second refund revokes the repurchased entitlement with current provenance'
);

select lives_ok(
  $$ select public.grant_entitlement(
    '10000000-0000-0000-0000-000000000001',
    'book-primary', 'manual', null, null, 'active', null, null
  ) $$,
  'an operator can issue a manual recovery grant after a refund'
);
select results_eq(
  $$ select provider, provider_ref, source_order_id, status
       from public.book_entitlement
      where user_id = '10000000-0000-0000-0000-000000000001'
        and book_id = 'book-primary' $$,
  $$ values ('manual'::text, null::text, null::uuid, 'active'::text) $$,
  'a manual regrant clears stale paid-provider and Order provenance'
);
select is(
  (public.finalize_refund_success(
    '40000000-0000-0000-0000-000000000004', null,
    'REFUND-REPURCHASE', 'COMPLETED', '2026-08-20T09:00:00Z'
  ) ->> 'already_confirmed')::boolean,
  true,
  'replaying the old refund cannot revoke the newer manual grant'
);
select results_eq(
  $$ select provider, source_order_id, status
       from public.book_entitlement
      where user_id = '10000000-0000-0000-0000-000000000001'
        and book_id = 'book-primary' $$,
  $$ values ('manual'::text, null::uuid, 'active'::text) $$,
  'the manual grant remains active after the old refund replay'
);

select * from finish();
rollback;
