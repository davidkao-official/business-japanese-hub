-- Exact operational totals for the finance read model. The row collections in
-- the API are intentionally bounded display samples; alert counts must scan the
-- complete server-side ledgers so older unresolved work cannot disappear when
-- newer rows push it outside a sample window.

create or replace function public.finance_status_counts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'matched', (
      select count(*) from public.payments where reconciliation_status = 'matched'
    ),
    'mismatched', (
      select count(*) from public.payments where reconciliation_status = 'mismatch'
    ),
    'pendingVerification', (
      select count(*) from public.payments where status = 'verification_pending'
    ),
    'succeeded', (
      select count(*) from public.payments where status = 'succeeded'
    ),
    'failed', (
      select count(*) from public.payments where status = 'failed'
    ),
    'unprocessedEvents', (
      select count(*) from public.payment_events where processing_result is null
    ),
    'processingErrors', (
      select count(*) from public.payment_events where processing_result = 'processing_error'
    ),
    'duplicatePayments', (
      select count(*) from public.payments where status = 'duplicate_success'
    ),
    'refundRequested', (
      select count(*) from public.refunds where status = 'requested'
    ),
    'refundProcessing', (
      select count(*) from public.refunds where status = 'processing'
    ),
    'refundFailed', (
      select count(*) from public.refunds where status = 'failed'
    ),
    'emailPending', (
      select count(*) from public.order_email_outbox where status in ('pending', 'retry')
    ),
    'emailDead', (
      select count(*) from public.order_email_outbox where status = 'dead'
    )
  );
$$;

revoke all on function public.finance_status_counts() from public;
revoke all on function public.finance_status_counts() from anon;
revoke all on function public.finance_status_counts() from authenticated;
grant execute on function public.finance_status_counts() to service_role;
