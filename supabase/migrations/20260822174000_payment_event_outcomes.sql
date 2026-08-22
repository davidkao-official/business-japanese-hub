-- Keep the callback reliability ledger machine-queryable. Receipts may be
-- unprocessed while work is retrying; once processed they must carry exactly
-- one known outcome and timestamp together.

alter table public.payment_events
  add constraint payment_events_processing_result_check
  check (
    processing_result is null or processing_result in (
      'succeeded',
      'failed',
      'verification_pending',
      'refund_succeeded',
      'refund_pending',
      'refund_failed',
      'refund_mismatch',
      'unknown_reference',
      'processing_error'
    )
  ) not valid;

alter table public.payment_events
  add constraint payment_events_processing_completion_check
  check ((processed_at is null) = (processing_result is null)) not valid;

-- NOT VALID keeps the initial metadata lock short on an existing ledger;
-- validation scans under the weaker SHARE UPDATE EXCLUSIVE lock.
alter table public.payment_events
  validate constraint payment_events_processing_result_check;
alter table public.payment_events
  validate constraint payment_events_processing_completion_check;

create or replace function public.complete_payment_event_outcome(
  p_provider text,
  p_event_fingerprint text,
  p_payment_id uuid,
  p_processing_result text,
  p_processed_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.payment_events%rowtype;
begin
  if p_processing_result not in (
    'succeeded', 'failed', 'verification_pending', 'refund_succeeded',
    'refund_pending', 'refund_failed', 'refund_mismatch',
    'unknown_reference', 'processing_error'
  ) or p_processed_at is null then
    raise exception 'invalid payment event outcome';
  end if;

  select * into v_event
    from public.payment_events
   where provider = p_provider
     and event_fingerprint = p_event_fingerprint
   for update;
  if not found then
    raise exception 'payment event %/% not found', p_provider, p_event_fingerprint;
  end if;
  if v_event.payment_id is not null
     and p_payment_id is not null
     and v_event.payment_id <> p_payment_id then
    raise exception 'payment event %/% is already correlated to another payment',
      p_provider, p_event_fingerprint;
  end if;

  -- A verified terminal outcome is durable. Concurrent/transient replays can
  -- finish later, but must not downgrade operator evidence.
  if v_event.processing_result in (
    'succeeded', 'failed', 'refund_succeeded', 'refund_failed',
    'refund_mismatch', 'unknown_reference'
  ) then
    return v_event.processing_result;
  end if;

  update public.payment_events
     set payment_id = coalesce(v_event.payment_id, p_payment_id),
         processed_at = p_processed_at,
         processing_result = p_processing_result
   where id = v_event.id;
  return p_processing_result;
end;
$$;

revoke all on function public.complete_payment_event_outcome(text,text,uuid,text,timestamptz) from public;
revoke all on function public.complete_payment_event_outcome(text,text,uuid,text,timestamptz) from anon;
revoke all on function public.complete_payment_event_outcome(text,text,uuid,text,timestamptz) from authenticated;
grant execute on function public.complete_payment_event_outcome(text,text,uuid,text,timestamptz) to service_role;
