-- Financial ledger identity and amount fields are facts, not mutable workflow
-- state. Service-role orchestration may advance statuses and fill provider
-- references once, but it must never rewrite which Order/provider/amount a
-- Payment or Refund represented after creation.

create or replace function public.payments_immutable_facts_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.id is distinct from new.id
     or old.order_id is distinct from new.order_id
     or old.provider is distinct from new.provider
     or old.provider_merchant_ref is distinct from new.provider_merchant_ref
     or old.amount_minor is distinct from new.amount_minor
     or old.currency is distinct from new.currency
     or old.method is distinct from new.method
     or old.created_at is distinct from new.created_at then
    raise exception 'payments: identity and commercial facts are immutable after creation';
  end if;

  if (old.provider_checkout_ref is not null
        and old.provider_checkout_ref is distinct from new.provider_checkout_ref)
     or (old.provider_payment_ref is not null
        and old.provider_payment_ref is distinct from new.provider_payment_ref)
     or (old.paid_at is not null and old.paid_at is distinct from new.paid_at) then
    raise exception 'payments: provider references and paid_at cannot change once recorded';
  end if;

  return new;
end;
$$;

drop trigger if exists payments_immutable_facts_check on public.payments;
create trigger payments_immutable_facts_check
  before update on public.payments
  for each row execute function public.payments_immutable_facts_check();

revoke all on function public.payments_immutable_facts_check() from public;
revoke all on function public.payments_immutable_facts_check() from anon;
revoke all on function public.payments_immutable_facts_check() from authenticated;
grant execute on function public.payments_immutable_facts_check() to service_role;

create or replace function public.refunds_immutable_facts_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.id is distinct from new.id
     or old.payment_id is distinct from new.payment_id
     or old.provider is distinct from new.provider
     or old.amount_minor is distinct from new.amount_minor
     or old.currency is distinct from new.currency
     or old.reason_code is distinct from new.reason_code
     or old.requested_by is distinct from new.requested_by
     or old.requested_at is distinct from new.requested_at then
    raise exception 'refunds: identity and commercial facts are immutable after creation';
  end if;

  if old.provider_refund_ref is not null
     and old.provider_refund_ref is distinct from new.provider_refund_ref then
    raise exception 'refunds: provider reference cannot change once recorded';
  end if;

  -- Terminal-state monotonicity is a final defense against stale Edge Function
  -- writers. Authoritative success may repair an earlier provider failure, but
  -- neither terminal state may move back into an open/retryable state and a
  -- succeeded refund can never be downgraded.
  if old.status = 'succeeded' and new.status <> 'succeeded' then
    raise exception 'refunds: succeeded status is terminal';
  end if;
  if old.status = 'failed' and new.status in ('requested', 'processing') then
    raise exception 'refunds: failed status cannot return to an open state';
  end if;

  -- A replay may need to finish derived Payment/Order/entitlement state after a
  -- legacy partial commit. Preserve the first authoritative completion time
  -- while allowing that repair transaction to proceed.
  if old.completed_at is not null then
    new.completed_at := old.completed_at;
  end if;

  return new;
end;
$$;

drop trigger if exists refunds_immutable_facts_check on public.refunds;
create trigger refunds_immutable_facts_check
  before update on public.refunds
  for each row execute function public.refunds_immutable_facts_check();

revoke all on function public.refunds_immutable_facts_check() from public;
revoke all on function public.refunds_immutable_facts_check() from anon;
revoke all on function public.refunds_immutable_facts_check() from authenticated;
grant execute on function public.refunds_immutable_facts_check() to service_role;
