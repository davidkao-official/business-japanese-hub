begin;

select plan(12);

insert into public.payment_events (
  provider, provider_merchant_ref, event_fingerprint, event_type,
  signature_valid, sanitized_payload_json
) values (
  'paypal', 'MERCHANT-1', 'FINGERPRINT-1', 'callback.received', true, '{}'::jsonb
);
select is(
  (select count(*) from public.payment_events where processing_result is null and processed_at is null),
  1::bigint,
  'a durable receipt may remain explicitly unprocessed'
);
select throws_ok(
  $$ update public.payment_events
        set processed_at = now(), processing_result = 'invented_result'
      where event_fingerprint = 'FINGERPRINT-1' $$,
  '23514',
  null,
  'an unknown processing result is rejected by the database'
);
select throws_ok(
  $$ update public.payment_events
        set processed_at = now()
      where event_fingerprint = 'FINGERPRINT-1' $$,
  '23514',
  null,
  'a receipt cannot be marked processed without an outcome'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.complete_payment_event_outcome(text,text,uuid,text,timestamptz)',
    'execute'
  ),
  'authenticated users cannot edit callback outcomes'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.complete_payment_event_outcome(text,text,uuid,text,timestamptz)',
    'execute'
  ),
  'service_role can finalize callback outcomes'
);
select is(
  public.complete_payment_event_outcome(
    'paypal', 'FINGERPRINT-1', null, 'verification_pending', now()
  ),
  'verification_pending'::text,
  'a transient callback outcome is recorded'
);
select is(
  public.complete_payment_event_outcome(
    'paypal', 'FINGERPRINT-1', null, 'succeeded', now()
  ),
  'succeeded'::text,
  'a later successful replay upgrades transient evidence'
);
select is(
  public.complete_payment_event_outcome(
    'paypal', 'FINGERPRINT-1', null, 'processing_error', now() + interval '1 minute'
  ),
  'succeeded'::text,
  'a slower failing replay cannot downgrade terminal success'
);
select results_eq(
  $$ select payment_id, processing_result, processed_at is not null
       from public.payment_events where event_fingerprint = 'FINGERPRINT-1' $$,
  $$ values (null::uuid, 'succeeded'::text, true) $$,
  'the durable ledger keeps the strongest correlated result'
);

insert into public.payment_events (
  provider, provider_merchant_ref, event_fingerprint, event_type,
  signature_valid, sanitized_payload_json
) values (
  'paypal', 'MERCHANT-1', 'FINGERPRINT-REFUND', 'callback.received', true, '{}'::jsonb
);
select is(
  public.complete_payment_event_outcome(
    'paypal', 'FINGERPRINT-REFUND', null, 'refund_pending', now()
  ),
  'refund_pending'::text,
  'an asynchronous refund pending outcome remains queryable'
);
select is(
  public.complete_payment_event_outcome(
    'paypal', 'FINGERPRINT-REFUND', null, 'refund_failed', now()
  ),
  'refund_failed'::text,
  'a later authoritative refund failure upgrades pending evidence'
);
select is(
  public.complete_payment_event_outcome(
    'paypal', 'FINGERPRINT-REFUND', null, 'processing_error', now() + interval '1 minute'
  ),
  'refund_failed'::text,
  'a late processing error cannot downgrade terminal refund failure evidence'
);

select * from finish();
rollback;
