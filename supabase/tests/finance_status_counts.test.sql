begin;

select plan(7);

select has_function(
  'public', 'finance_status_counts', array[]::text[],
  'the exact finance-count RPC exists'
);
select ok(
  not has_function_privilege('anon', 'public.finance_status_counts()', 'execute'),
  'anon cannot query financial totals'
);
select ok(
  not has_function_privilege('authenticated', 'public.finance_status_counts()', 'execute'),
  'authenticated users cannot query financial totals'
);
select ok(
  has_function_privilege('service_role', 'public.finance_status_counts()', 'execute'),
  'the server-side finance function can query financial totals'
);

insert into public.payment_events (
  provider, provider_merchant_ref, event_fingerprint, event_type,
  signature_valid, sanitized_payload_json, processed_at, processing_result
) values
  (
    'paypal', 'COUNT-MERCHANT-1', 'COUNT-EVENT-1', 'callback.received',
    true, '{}'::jsonb, null, null
  ),
  (
    'paypal', 'COUNT-MERCHANT-2', 'COUNT-EVENT-2', 'callback.received',
    true, '{}'::jsonb, now(), 'processing_error'
  );

select is(
  (public.finance_status_counts()->>'unprocessedEvents')::bigint,
  1::bigint,
  'unprocessed-event totals scan the complete ledger'
);
select is(
  (public.finance_status_counts()->>'processingErrors')::bigint,
  1::bigint,
  'processing-error totals scan the complete ledger'
);
select is(
  (select count(*) from jsonb_object_keys(public.finance_status_counts())),
  13::bigint,
  'the RPC returns every reconciliation and operations count'
);

select * from finish();
rollback;
