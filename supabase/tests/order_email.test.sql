begin;

select plan(77);

select has_column('public', 'catalog', 'item_name', 'catalog has an authoritative sellable item name');
select col_not_null('public', 'catalog', 'item_name', 'catalog item name is required');
select has_column('public', 'orders', 'customer_email_snapshot', 'orders freeze the delivery email');
select has_column('public', 'orders', 'customer_locale_snapshot', 'orders freeze the buyer-facing locale');
select ok(to_regclass('public.orders_one_open_checkout_uidx') is not null, 'one open checkout intent is enforced per user and Book');
select has_table('public', 'order_email_outbox', 'server-only order-email outbox exists');
select ok(not has_table_privilege('anon', 'public.order_email_outbox', 'select'), 'anon cannot read email jobs');
select ok(not has_table_privilege('authenticated', 'public.order_email_outbox', 'select'), 'authenticated cannot read email jobs');
select ok(has_table_privilege('service_role', 'public.order_email_outbox', 'select'), 'service_role can read email jobs');

select has_function(
  'public', 'create_checkout_intent',
  array['uuid','text','text','text','text','text','text','text','text','boolean','text','text','timestamp with time zone','text','text','text'],
  'atomic checkout-intent RPC exists'
);
select ok(
  not has_function_privilege('anon', 'public.create_checkout_intent(uuid,text,text,text,text,text,text,text,text,boolean,text,text,timestamptz,text,text,text)', 'execute'),
  'anon cannot create checkout intents directly'
);
select ok(
  not has_function_privilege('authenticated', 'public.create_checkout_intent(uuid,text,text,text,text,text,text,text,text,boolean,text,text,timestamptz,text,text,text)', 'execute'),
  'authenticated cannot create checkout intents directly'
);
select ok(
  has_function_privilege('service_role', 'public.create_checkout_intent(uuid,text,text,text,text,text,text,text,text,boolean,text,text,timestamptz,text,text,text)', 'execute'),
  'service_role can create checkout intents'
);

select has_function('public', 'claim_order_email_jobs', array['integer','timestamp with time zone'], 'atomic email-job claim RPC exists');
select ok(not has_function_privilege('anon', 'public.claim_order_email_jobs(integer,timestamptz)', 'execute'), 'anon cannot claim email jobs');
select ok(not has_function_privilege('authenticated', 'public.claim_order_email_jobs(integer,timestamptz)', 'execute'), 'authenticated cannot claim email jobs');
select ok(has_function_privilege('service_role', 'public.claim_order_email_jobs(integer,timestamptz)', 'execute'), 'service_role can claim email jobs');
select has_function('public', 'prepare_order_email_send', array['uuid'], 'pre-send paid-state recheck RPC exists');
select ok(not has_function_privilege('anon', 'public.prepare_order_email_send(uuid)', 'execute'), 'anon cannot reserve an email send');
select ok(not has_function_privilege('authenticated', 'public.prepare_order_email_send(uuid)', 'execute'), 'authenticated cannot reserve an email send');
select ok(has_function_privilege('service_role', 'public.prepare_order_email_send(uuid)', 'execute'), 'service_role can reserve an email send');
select has_function('public', 'is_order_email_scheduler_ready', array['text','text'], 'email scheduler activation RPC exists');
select ok(not has_function_privilege('anon', 'public.is_order_email_scheduler_ready(text,text)', 'execute'), 'anon cannot inspect email scheduler activation');
select ok(not has_function_privilege('authenticated', 'public.is_order_email_scheduler_ready(text,text)', 'execute'), 'authenticated cannot inspect email scheduler activation');
select ok(has_function_privilege('service_role', 'public.is_order_email_scheduler_ready(text,text)', 'execute'), 'service_role can inspect email scheduler activation');
select has_function('public', 'scheduled_order_email_call', array[]::text[], 'email cron wrapper exists');
select is((select schedule from cron.job where jobname = 'order-email-outbox'), '* * * * *'::text, 'email outbox is polled each minute');
select is((select command from cron.job where jobname = 'order-email-outbox'), 'select public.scheduled_order_email_call();'::text, 'email cron invokes its dedicated mode');

update public.scheduled_job_config
   set value = 'https://test.supabase.co/functions/v1/order-email'
 where key = 'order_email_function_url';
do $$ begin
  perform vault.create_secret('test-scheduled-secret', 'scheduled_job_secret');
end $$;
select ok(
  public.is_order_email_scheduler_ready(
    'https://test.supabase.co/functions/v1/order-email',
    '788ce709321f4667893eb59c1613e3f3e1a24e6f872ec47bda1355f5ce1a0642'
  ),
  'scheduler readiness requires the exact URL, Vault secret hash, and active cron'
);
select ok(
  not public.is_order_email_scheduler_ready(
    'https://test.supabase.co/functions/v1/order-email',
    repeat('0', 64)
  ),
  'scheduler readiness rejects a mismatched secret hash'
);
do $$ begin
  perform cron.unschedule('order-email-outbox');
end $$;
select ok(
  not public.is_order_email_scheduler_ready(
    'https://test.supabase.co/functions/v1/order-email',
    '788ce709321f4667893eb59c1613e3f3e1a24e6f872ec47bda1355f5ce1a0642'
  ),
  'scheduler readiness rejects a missing or disabled cron job'
);

insert into auth.users (id, aud, role, email)
values ('50000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'reader@example.com');

insert into public.catalog (
  book_id, slug, item_name, currency, amount_minor, published_revision, released_at
) values
  ('book-usd', 'book-usd', 'Business Meetings', 'USD', 1200, 'book-usd@r1', '2020-01-01T00:00:00Z'),
  ('book-usd-2', 'book-usd-2', 'Business Meetings II', 'USD', 1500, 'book-usd-2@r1', '2020-01-01T00:00:00Z'),
  ('book-twd', 'book-twd', '商務日語', 'TWD', 79000, 'book-twd@r1', '2020-01-01T00:00:00Z'),
  ('book-future', 'book-future', 'Future Book', 'USD', 1200, 'book-future@r1', '2099-01-01T00:00:00Z');

create temporary table checkout_result as
select public.create_checkout_intent(
  '50000000-0000-0000-0000-000000000001',
  'book-usd', 'reader@example.com', 'en', 'TW', 'unresolved', 'en',
  'notice-v1', 'consent-v1', true, 'Canonical notice', 'Canonical consent',
  '2026-08-20T10:00:00Z', 'paypal', 'ORDER-US-1', 'paypal'
) as result;

select ok((select (result->>'created')::boolean and result->'order'->>'id' is not null from checkout_result), 'atomic RPC returns the created order');
select results_eq(
  $$ select item_name_snapshot, customer_email_snapshot, customer_locale_snapshot, amount_minor, currency
       from public.orders where book_id = 'book-usd' $$,
  $$ values ('Business Meetings'::text, 'reader@example.com'::text, 'en'::text, 1200::bigint, 'USD'::text) $$,
  'order snapshots authoritative catalog and delivery facts'
);
select results_eq(
  $$ select jurisdiction, locale, notice_version, consent_version, consent_granted,
            notice_text_snapshot, consent_text_snapshot
       from public.order_compliance where order_id = (
         select id from public.orders where book_id = 'book-usd'
       ) $$,
  $$ values ('TW'::text, 'en'::text, 'notice-v1'::text, 'consent-v1'::text, true,
             'Canonical notice'::text, 'Canonical consent'::text) $$,
  'RPC writes canonical compliance evidence in the same transaction'
);
select results_eq(
  $$ select provider, provider_merchant_ref, amount_minor, currency, method, status
       from public.payments where provider_merchant_ref = 'ORDER-US-1' $$,
  $$ values ('paypal'::text, 'ORDER-US-1'::text, 1200::bigint, 'USD'::text, 'paypal'::text, 'created'::text) $$,
  'USD catalog price maps only to a PayPal payment attempt'
);
select throws_ok(
  $$ update public.orders set customer_email_snapshot = 'attacker@example.com' where book_id = 'book-usd' $$,
  'P0001',
  'orders: commercial and compliance snapshots are immutable after creation',
  'customer delivery email cannot be rewritten'
);
select throws_ok(
  $$ update public.orders set customer_locale_snapshot = 'ja' where book_id = 'book-usd' $$,
  'P0001',
  'orders: commercial and compliance snapshots are immutable after creation',
  'customer communication locale cannot be rewritten'
);
select throws_ok(
  $$ select public.create_checkout_intent(
    '50000000-0000-0000-0000-000000000001', 'book-usd', 'reader@example.com', 'en',
    'TW', 'unresolved', 'en', 'notice-v1', 'consent-v1', true, 'Notice', 'Consent',
    now(), 'ecpay', 'BAD-US-1', 'credit'
  ) $$,
  'P0001', 'currency USD requires provider paypal',
  'currency/provider mismatch is rejected inside the transaction'
);
select is((select count(*) from public.payments where provider_merchant_ref = 'BAD-US-1'), 0::bigint, 'rejected mapping writes no payment');
select is(
  (public.create_checkout_intent(
    '50000000-0000-0000-0000-000000000001', 'book-usd', 'reader@example.com', 'en',
    'TW', 'unresolved', 'en', 'notice-v1', 'consent-v1', true, 'Notice', 'Consent',
    now(), 'paypal', 'ORDER-US-1', 'paypal'
  )->>'created')::boolean,
  false,
  'a concurrent checkout reuses the one open intent without a second provider handoff'
);
select is(
  (select count(*) from public.orders where book_id = 'book-usd'),
  1::bigint,
  'a repeated checkout creates no second Order'
);
select is(
  (select count(*) from public.payments where order_id = (select id from public.orders where book_id = 'book-usd')),
  1::bigint,
  'a repeated checkout creates no second Payment'
);
select throws_like(
  $$ select public.create_checkout_intent(
    '50000000-0000-0000-0000-000000000001', 'book-usd-2', 'reader@example.com', 'en',
    'TW', 'unresolved', 'en', 'notice-v1', 'consent-v1', true, 'Notice', 'Consent',
    now(), 'paypal', 'ORDER-US-1', 'paypal'
  ) $$,
  '%duplicate key value violates unique constraint%',
  'a late Payment constraint failure aborts the atomic checkout RPC'
);
select is(
  (select count(*) from public.orders where book_id = 'book-usd-2'),
  0::bigint,
  'a Payment insert failure rolls back its Order and compliance rows'
);
select throws_ok(
  $$ select public.create_checkout_intent(
    '50000000-0000-0000-0000-000000000001', 'book-usd-2', 'reader@example.com', null,
    'TW', 'unresolved', 'en', 'notice-v1', 'consent-v1', true, 'Notice', 'Consent',
    now(), 'paypal', 'ORDER-US-NULL-LOCALE', 'paypal'
  ) $$,
  'P0001', 'supported customer locale is required',
  'new checkout cannot bypass the presentation-locale contract with SQL NULL'
);
select throws_ok(
  $$ select public.create_checkout_intent(
    '50000000-0000-0000-0000-000000000001', 'book-future', 'reader@example.com', 'en',
    'TW', 'unresolved', 'en', 'notice-v1', 'consent-v1', true, 'Notice', 'Consent',
    now(), 'paypal', 'FUTURE-1', 'paypal'
  ) $$,
  'P0001', 'released catalog item book-future not found',
  'unreleased catalog rows cannot be sold'
);
select is((select count(*) from public.payments where provider_merchant_ref = 'FUTURE-1'), 0::bigint, 'unreleased attempt writes nothing');
select ok(
  (public.create_checkout_intent(
    '50000000-0000-0000-0000-000000000001', 'book-twd', 'reader@example.com', 'zh-TW',
    'JP', 'taxable', 'ja', 'notice-v1', 'consent-v1', true, 'Notice', 'Consent',
    now(), 'ecpay', 'ORDER-TW-1', 'credit'
  )->'payment'->>'id') is not null,
  'TWD catalog price maps to ECPay'
);
select results_eq(
  $$ select orders.customer_locale_snapshot, compliance.locale
       from public.orders orders
       join public.order_compliance compliance on compliance.order_id = orders.id
      where orders.book_id = 'book-twd' $$,
  $$ values ('zh-TW'::text, 'ja'::text) $$,
  'buyer-facing and fixed legal-copy locales remain distinct in the atomic RPC'
);

select is(
  (public.finalize_payment_success(
    (select id from public.payments where provider_merchant_ref = 'ORDER-US-1'),
    'CAPTURE-US-1', '2026-08-20T11:54:00Z', 'COMPLETED'
  )->>'granted')::boolean,
  true,
  'first verified payment success grants access'
);
select is((select count(*) from public.order_email_outbox where order_id = (select id from public.orders where book_id = 'book-usd')), 1::bigint, 'first fulfillment enqueues exactly one receipt');
select is(
  (select locale from public.order_email_outbox where order_id = (select id from public.orders where book_id = 'book-usd')),
  'en'::text,
  'outbox snapshots the buyer-facing locale'
);
select is(
  (public.finalize_payment_success(
    (select id from public.payments where provider_merchant_ref = 'ORDER-US-1'),
    'CAPTURE-US-1', '2026-08-20T11:54:00Z', 'COMPLETED'
  )->>'granted')::boolean,
  false,
  'success replay remains a no-op'
);
select is((select count(*) from public.order_email_outbox where order_id = (select id from public.orders where book_id = 'book-usd')), 1::bigint, 'success replay does not enqueue again');

insert into public.orders (
  id, user_id, book_id, item_name_snapshot, published_revision, amount_minor,
  currency, status, jurisdiction, japan_tax_status_snapshot, customer_email_snapshot
) values (
  '60000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  'legacy-book', 'Legacy Book', 'legacy-book@r1', 1200,
  'USD', 'pending', 'unresolved', 'unresolved', null
);
insert into public.payments (
  id, order_id, provider, provider_merchant_ref, amount_minor, currency, method, status
) values (
  '70000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  'paypal', 'ORDER-LEGACY-1', 1200, 'USD', 'paypal', 'pending'
);
select is(
  (public.finalize_payment_success(
    '70000000-0000-0000-0000-000000000001',
    'CAPTURE-LEGACY-1', '2026-08-20T11:54:30Z', 'COMPLETED'
  )->>'granted')::boolean,
  true,
  'verified legacy payment grants access even without email metadata'
);
select results_eq(
  $$ select orders.status, entitlements.status
       from public.orders orders
       join public.book_entitlement entitlements on entitlements.source_order_id = orders.id
      where orders.id = '60000000-0000-0000-0000-000000000001' $$,
  $$ values ('paid'::text, 'active'::text) $$,
  'legacy payment fulfillment remains authoritative and atomic'
);
select results_eq(
  $$ select status, last_error_code from public.order_email_outbox
      where order_id = '60000000-0000-0000-0000-000000000001' $$,
  $$ values ('dead'::text, 'missing_customer_email_snapshot'::text) $$,
  'missing legacy email metadata is routed to manual delivery without denying access'
);

insert into public.payments (order_id, provider, provider_merchant_ref, amount_minor, currency, method, status)
select id, 'paypal', 'ORDER-US-DUP', amount_minor, currency, 'paypal', 'pending'
from public.orders where book_id = 'book-usd';
select is(
  (public.finalize_payment_success(
    (select id from public.payments where provider_merchant_ref = 'ORDER-US-DUP'),
    'CAPTURE-US-DUP', '2026-08-20T11:55:00Z', 'COMPLETED'
  )->>'payment_status'),
  'duplicate_success'::text,
  'a second payment is classified as a duplicate success'
);
select is((select count(*) from public.order_email_outbox where order_id = (select id from public.orders where book_id = 'book-usd')), 1::bigint, 'duplicate success does not enqueue another receipt');

select is(
  (public.finalize_payment_success(
    (select id from public.payments where provider_merchant_ref = 'ORDER-TW-1'),
    'TRADE-TW-1', '2026-08-20T11:56:00Z', '1'
  )->>'granted')::boolean,
  true,
  'a second order is fulfilled before the refund-race claim test'
);
select is(
  (select locale from public.order_email_outbox where order_id = (select id from public.orders where book_id = 'book-twd')),
  'zh-TW'::text,
  'outbox keeps the buyer-facing locale rather than the JP legal-copy locale'
);
create temporary table due_claim as
select public.claim_order_email_jobs(20, '2026-08-20T12:00:00Z') as result;
select is(jsonb_array_length((select result from due_claim)), 2, 'both due email jobs are claimed once');
select is(
  (select claimed->>'locale'
     from due_claim, jsonb_array_elements(result) claimed
    where claimed->>'orderId' = (select id::text from public.orders where book_id = 'book-twd')),
  'zh-TW'::text,
  'the claimed email keeps the buyer-facing locale rather than the JP legal-copy locale'
);
update public.payments set status = 'refunded'
 where provider_merchant_ref = 'ORDER-TW-1';
update public.orders set status = 'refunded', refunded_at = '2026-08-20T11:57:00Z'
 where book_id = 'book-twd';
select is(
  public.prepare_order_email_send(
    (select id from public.order_email_outbox where order_id = (select id from public.orders where book_id = 'book-twd'))
  ),
  false,
  'a refund completed after claim but before the send fence suppresses delivery'
);
select results_eq(
  $$ select status, last_error_code from public.order_email_outbox
      where order_id = (select id from public.orders where book_id = 'book-twd') $$,
  $$ values ('dead'::text, 'order_no_longer_paid'::text) $$,
  'the pre-fence refund suppression is durable'
);
select results_eq(
  $$ select status, attempt_count from public.order_email_outbox
      where order_id = (select id from public.orders where book_id = 'book-usd') $$,
  $$ values ('processing'::text, 1) $$,
  'claim marks the job processing and increments its attempt'
);
select is(jsonb_array_length(public.claim_order_email_jobs(20, '2026-08-20T12:01:00Z')), 0, 'active claim cannot be claimed twice');
update public.order_email_outbox set locked_at = '2026-08-20T11:40:00Z'
where order_id = (select id from public.orders where book_id = 'book-usd');
select is(jsonb_array_length(public.claim_order_email_jobs(20, '2026-08-20T12:01:00Z')), 1, 'stale claim is recovered');
select is((select attempt_count from public.order_email_outbox where order_id = (select id from public.orders where book_id = 'book-usd')), 2, 'stale recovery increments the attempt count exactly once');

select is(
  public.prepare_order_email_send(
    (select id from public.order_email_outbox where order_id = (select id from public.orders where book_id = 'book-usd'))
  ),
  true,
  'a paid Order establishes the immediate durable send fence'
);

update public.payments set status = 'refunded'
 where provider_merchant_ref = 'ORDER-US-1';
update public.orders set status = 'refunded', refunded_at = '2026-08-20T12:01:30Z'
 where book_id = 'book-usd';
select is(
  jsonb_array_length(public.claim_order_email_jobs(20, '2026-08-20T12:02:00Z')),
  0,
  'a concurrent cron does not sweep an active fenced send after refund'
);
select is(
  (select status from public.order_email_outbox where order_id = (select id from public.orders where book_id = 'book-usd')),
  'sending'::text,
  'the durable sending fence survives a refund that loses the ordering race'
);
update public.order_email_outbox set locked_at = '2026-08-20T11:40:00Z'
where order_id = (select id from public.orders where book_id = 'book-usd');
select is(
  jsonb_array_length(public.claim_order_email_jobs(20, '2026-08-20T12:02:00Z')),
  1,
  'a stale fenced send is safely recovered under the provider idempotency key'
);
select is(
  public.prepare_order_email_send(
    (select id from public.order_email_outbox where order_id = (select id from public.orders where book_id = 'book-usd'))
  ),
  false,
  'recovered fenced work rechecks the refund before another external send'
);
select results_eq(
  $$ select status, last_error_code from public.order_email_outbox
      where order_id = (select id from public.orders where book_id = 'book-usd') $$,
  $$ values ('dead'::text, 'order_no_longer_paid'::text) $$,
  'the pre-send refund race is durably suppressed'
);

insert into public.orders (
  id, user_id, book_id, item_name_snapshot, published_revision, amount_minor,
  currency, status, jurisdiction, japan_tax_status_snapshot,
  customer_email_snapshot, customer_locale_snapshot, paid_at
) values (
  '60000000-0000-0000-0000-000000000002',
  '50000000-0000-0000-0000-000000000001',
  'missing-payment-book', 'Missing Payment Book', 'missing-payment-book@r1', 1200,
  'USD', 'paid', 'TW', 'unresolved', 'reader@example.com', 'en', '2026-08-20T11:58:00Z'
);
insert into public.payments (
  order_id, provider, provider_merchant_ref, amount_minor, currency, method, status
) values (
  '60000000-0000-0000-0000-000000000002',
  'paypal', 'ORDER-MISSING-PAYMENT', 1200, 'USD', 'paypal', 'failed'
);
insert into public.order_email_outbox (
  order_id, recipient_email, locale, template_key, status, next_attempt_at
) values (
  '60000000-0000-0000-0000-000000000002',
  'reader@example.com', 'en', 'order-confirmation-v1', 'pending', '2026-08-20T11:59:00Z'
);
create temporary table missing_payment_claim as
select public.claim_order_email_jobs(20, '2026-08-20T12:03:00Z') as result;
select is(jsonb_array_length((select result from missing_payment_claim)), 1, 'a claimed job is never dropped by a missing succeeded payment join');
select ok(
  (select result->0->'provider' = 'null'::jsonb and result->0->'paymentMethod' = 'null'::jsonb from missing_payment_claim),
  'missing payment facts are returned as null for fail-closed worker handling'
);

select * from finish();
rollback;
