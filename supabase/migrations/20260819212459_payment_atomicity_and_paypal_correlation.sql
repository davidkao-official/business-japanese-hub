-- Paid-launch payment safety hardening (#21/#45).
--
-- 1. Preserve a provider checkout/order reference separately from the final
--    provider transaction/capture reference.
-- 2. Move verified-success and provider-confirmed-refund fulfillment into
--    service-role-only Postgres functions so each financial transition is one
--    transaction with row locks. Browser/anon/authenticated roles cannot call
--    either function.

alter table public.payments
  add column if not exists provider_checkout_ref text;

create unique index if not exists payments_provider_checkout_ref_uidx
  on public.payments (provider, provider_checkout_ref)
  where provider_checkout_ref is not null;

comment on column public.payments.provider_checkout_ref is
  'Provider checkout/session reference known before settlement (for example a PayPal Orders v2 order id). Kept separately from provider_payment_ref, which becomes the authoritative capture/transaction id.';

create or replace function public.finalize_payment_success(
  p_payment_id              uuid,
  p_provider_payment_ref    text,
  p_paid_at                 timestamptz,
  p_provider_status_code    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_paid_at timestamptz := coalesce(p_paid_at, now());
begin
  select *
    into v_payment
    from public.payments
   where id = p_payment_id
   for update;
  if not found then
    raise exception 'payment % not found', p_payment_id;
  end if;

  select *
    into v_order
    from public.orders
   where id = v_payment.order_id
   for update;
  if not found then
    raise exception 'order % not found for payment %', v_payment.order_id, p_payment_id;
  end if;

  -- Failed/refunded attempts are terminal. A late provider success is recorded
  -- by the durable event ledger and operator diagnostics, but never resurrects
  -- the attempt or grants access.
  if v_payment.status in ('failed', 'refunded') then
    update public.payments
       set last_verified_at = now(),
           provider_status_code = coalesce(p_provider_status_code, provider_status_code),
           provider_status_message = 'verified success ignored for terminal payment'
     where id = v_payment.id;
    return jsonb_build_object(
      'payment_status', v_payment.status,
      'order_status', v_order.status,
      'granted', false
    );
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'verified payment % belongs to cancelled order %', v_payment.id, v_order.id;
  end if;

  if v_order.status = 'pending' then
    update public.payments
       set status = 'succeeded',
           provider_payment_ref = coalesce(p_provider_payment_ref, provider_payment_ref),
           paid_at = coalesce(paid_at, v_paid_at),
           last_verified_at = now(),
           provider_status_code = coalesce(p_provider_status_code, provider_status_code),
           provider_status_message = 'payment confirmed'
     where id = v_payment.id;

    -- Provider transaction ids are intentionally not copied into entitlement
    -- provenance (§9.2). The provider-neutral source_order_id is sufficient.
    perform public.grant_entitlement(
      p_user_id           => v_order.user_id,
      p_book_id           => v_order.book_id,
      p_provider          => v_payment.provider,
      p_provider_ref      => null,
      p_source_order_id   => v_order.id,
      p_status            => 'active',
      p_revoked_at        => null,
      p_revocation_reason => null
    );

    update public.orders
       set status = 'paid',
           paid_at = coalesce(paid_at, v_paid_at)
     where id = v_order.id;

    return jsonb_build_object(
      'payment_status', 'succeeded',
      'order_status', 'paid',
      'granted', true
    );
  end if;

  -- The order was already fulfilled. A replay of its successful attempt is a
  -- no-op; a different newly-successful attempt is a duplicate charge and must
  -- never overwrite entitlement provenance.
  if v_payment.status = 'succeeded' then
    update public.payments
       set provider_payment_ref = coalesce(p_provider_payment_ref, provider_payment_ref),
           last_verified_at = now(),
           provider_status_code = coalesce(p_provider_status_code, provider_status_code),
           provider_status_message = 'payment confirmed'
     where id = v_payment.id;
    return jsonb_build_object(
      'payment_status', 'succeeded',
      'order_status', v_order.status,
      'granted', false
    );
  end if;

  if v_payment.status in ('created', 'pending', 'verification_pending') then
    update public.payments
       set status = 'duplicate_success',
           provider_payment_ref = coalesce(p_provider_payment_ref, provider_payment_ref),
           paid_at = coalesce(paid_at, v_paid_at),
           last_verified_at = now(),
           provider_status_code = coalesce(p_provider_status_code, provider_status_code),
           provider_status_message = 'duplicate successful charge; finance review required'
     where id = v_payment.id;
  end if;

  return jsonb_build_object(
    'payment_status', case
      when v_payment.status in ('created', 'pending', 'verification_pending') then 'duplicate_success'
      else v_payment.status
    end,
    'order_status', v_order.status,
    'granted', false
  );
end;
$$;

revoke all on function public.finalize_payment_success(uuid, text, timestamptz, text) from public;
revoke all on function public.finalize_payment_success(uuid, text, timestamptz, text) from anon;
revoke all on function public.finalize_payment_success(uuid, text, timestamptz, text) from authenticated;
grant execute on function public.finalize_payment_success(uuid, text, timestamptz, text) to service_role;

create or replace function public.finalize_refund_success(
  p_refund_id               uuid,
  p_payment_id              uuid,
  p_provider_refund_ref     text,
  p_provider_status_code    text,
  p_completed_at            timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund public.refunds%rowtype;
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_completed_at timestamptz := coalesce(p_completed_at, now());
  v_primary boolean;
begin
  if p_refund_id is null and p_payment_id is null then
    raise exception 'refund id or payment id is required';
  end if;

  -- Resolve the payment id without taking the refund lock yet. Every execution
  -- then takes locks in the same global order: Payment -> Refund -> Order.
  -- This prevents callback/reconciliation races from deadlocking against the
  -- operator refund path.
  if p_refund_id is not null then
    select *
      into v_refund
      from public.refunds
     where id = p_refund_id;
    if not found then
      raise exception 'refund % not found', p_refund_id;
    end if;
    if p_payment_id is not null and p_payment_id <> v_refund.payment_id then
      raise exception 'refund % does not belong to payment %', p_refund_id, p_payment_id;
    end if;
    p_payment_id := v_refund.payment_id;
  end if;

  select *
    into v_payment
    from public.payments
   where id = p_payment_id
   for update;
  if not found then
    raise exception 'payment % not found for refund', p_payment_id;
  end if;

  if p_refund_id is not null then
    select *
      into v_refund
      from public.refunds
     where id = p_refund_id
     for update;
    if not found or v_refund.payment_id <> v_payment.id then
      raise exception 'refund % does not belong to payment %', p_refund_id, v_payment.id;
    end if;
  else
    select *
      into v_refund
      from public.refunds
     where payment_id = v_payment.id
     order by requested_at asc
     limit 1
     for update;

    if not found then
      insert into public.refunds (
        payment_id,
        provider,
        provider_refund_ref,
        amount_minor,
        currency,
        status,
        reason_code,
        provider_status_code,
        requested_at
      ) values (
        v_payment.id,
        v_payment.provider,
        p_provider_refund_ref,
        v_payment.amount_minor,
        v_payment.currency,
        'requested',
        'provider_event',
        p_provider_status_code,
        v_completed_at
      )
      returning * into v_refund;
    end if;
  end if;

  -- MVP refunds are full refunds. Provider, amount, and currency are immutable
  -- financial facts and must match the locked payment inside this transaction;
  -- no caller can revoke ownership with a partial/cross-provider refund row.
  if v_refund.provider <> v_payment.provider
     or v_refund.amount_minor <> v_payment.amount_minor
     or v_refund.currency <> v_payment.currency then
    raise exception 'refund % does not match payment % full-refund contract', v_refund.id, v_payment.id;
  end if;

  select *
    into v_order
    from public.orders
   where id = v_payment.order_id
   for update;
  if not found then
    raise exception 'order % not found for refunded payment %', v_payment.order_id, v_payment.id;
  end if;

  if v_payment.status not in ('succeeded', 'duplicate_success', 'refunded') then
    raise exception 'payment % in status % cannot be refunded', v_payment.id, v_payment.status;
  end if;

  v_primary := v_payment.status = 'succeeded'
    or (
      v_payment.status = 'refunded'
      and (
        v_order.status = 'refunded'
        or not exists (
          select 1
            from public.payments other_payment
           where other_payment.order_id = v_payment.order_id
             and other_payment.id <> v_payment.id
             and other_payment.status = 'succeeded'
        )
      )
    );

  -- Old code could persist refunds.status='succeeded' before updating the
  -- derived Payment/Order/Entitlement state. Treat a replay as complete only
  -- when those states are already consistent; otherwise continue and heal all
  -- missing work in this transaction.
  if v_refund.status = 'succeeded'
     and v_payment.status = 'refunded'
     and (
       (
         v_primary
         and v_order.status = 'refunded'
         and not exists (
           select 1
             from public.book_entitlement entitlement
            where entitlement.source_order_id = v_order.id
              and entitlement.status = 'active'
         )
       )
       or (not v_primary and v_order.status = 'paid')
     ) then
    return jsonb_build_object(
      'refund_id', v_refund.id,
      'refund_status', 'succeeded',
      'payment_status', v_payment.status,
      'order_status', v_order.status,
      'entitlement_revoked', v_primary,
      'already_confirmed', true
    );
  end if;

  update public.refunds
     set status = 'succeeded',
         provider_refund_ref = coalesce(p_provider_refund_ref, provider_refund_ref),
         provider_status_code = coalesce(p_provider_status_code, provider_status_code),
         completed_at = v_completed_at
   where id = v_refund.id;

  update public.payments
     set status = 'refunded',
         provider_status_code = coalesce(p_provider_status_code, provider_status_code),
         provider_status_message = 'refund confirmed',
         last_verified_at = now()
   where id = v_payment.id;

  if v_primary then
    update public.orders
       set status = 'refunded',
           refunded_at = coalesce(refunded_at, v_completed_at)
     where id = v_order.id;

    update public.book_entitlement
       set status = 'revoked',
           revoked_at = coalesce(revoked_at, v_completed_at),
           revocation_reason = 'refund'
     where source_order_id = v_order.id
       and status = 'active';
  end if;

  return jsonb_build_object(
    'refund_id', v_refund.id,
    'refund_status', 'succeeded',
    'payment_status', 'refunded',
    'order_status', case when v_primary then 'refunded' else v_order.status end,
    'entitlement_revoked', v_primary,
    'already_confirmed', false
  );
end;
$$;

revoke all on function public.finalize_refund_success(uuid, uuid, text, text, timestamptz) from public;
revoke all on function public.finalize_refund_success(uuid, uuid, text, text, timestamptz) from anon;
revoke all on function public.finalize_refund_success(uuid, uuid, text, text, timestamptz) from authenticated;
grant execute on function public.finalize_refund_success(uuid, uuid, text, text, timestamptz) to service_role;
