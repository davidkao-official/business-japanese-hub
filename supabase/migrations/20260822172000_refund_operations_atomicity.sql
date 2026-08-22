-- Refund operations hardening: one full-refund fact per Payment, idempotent
-- request creation, and transactionally coupled finance audit evidence.

create unique index refunds_payment_uidx
  on public.refunds (payment_id);

create unique index refunds_provider_refund_ref_uidx
  on public.refunds (provider, provider_refund_ref)
  where provider_refund_ref is not null;

-- One Book purchase fulfills one entitlement lifecycle row. This also makes
-- the refund finalizer's exactly-one revocation postcondition structural.
create unique index book_entitlement_source_order_uidx
  on public.book_entitlement (source_order_id)
  where source_order_id is not null;

-- Preserve the existing locked finalizer as an internal implementation and put
-- a postcondition wrapper at its public service boundary. Any invariant failure
-- raises in the same transaction and rolls every refund/payment/order write back.
alter function public.finalize_refund_success(uuid,uuid,text,text,timestamptz)
  rename to finalize_refund_success_unchecked;

create or replace function public.finalize_refund_success(
  p_refund_id uuid,
  p_payment_id uuid,
  p_provider_refund_ref text,
  p_provider_status_code text,
  p_completed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_resolved_payment_id uuid;
  v_order_id uuid;
  v_revoked_count bigint;
begin
  v_result := public.finalize_refund_success_unchecked(
    p_refund_id,
    p_payment_id,
    p_provider_refund_ref,
    p_provider_status_code,
    p_completed_at
  );

  -- Only the transition that first confirms a refund owns the revocation
  -- postcondition. A later replay can legitimately arrive after the buyer has
  -- repurchased the same Book and the single lifecycle row has been rebound to
  -- the newer Order; the old refund must remain an idempotent no-op.
  if not coalesce((v_result->>'already_confirmed')::boolean, false)
     and coalesce((v_result->>'entitlement_revoked')::boolean, false) then
    v_resolved_payment_id := p_payment_id;
    if v_resolved_payment_id is null then
      select payment_id into v_resolved_payment_id
        from public.refunds
       where id = coalesce(p_refund_id, (v_result->>'refund_id')::uuid);
    end if;
    select order_id into v_order_id
      from public.payments
     where id = v_resolved_payment_id;
    select count(*) into v_revoked_count
      from public.book_entitlement
     where source_order_id = v_order_id
       and status = 'revoked';
    if v_revoked_count <> 1 then
      raise exception 'primary refund for payment % did not revoke exactly one entitlement',
        v_resolved_payment_id;
    end if;
  end if;

  return v_result;
end;
$$;

revoke all on function public.finalize_refund_success_unchecked(uuid,uuid,text,text,timestamptz) from public;
revoke all on function public.finalize_refund_success_unchecked(uuid,uuid,text,text,timestamptz) from anon;
revoke all on function public.finalize_refund_success_unchecked(uuid,uuid,text,text,timestamptz) from authenticated;
revoke all on function public.finalize_refund_success_unchecked(uuid,uuid,text,text,timestamptz) from service_role;

revoke all on function public.finalize_refund_success(uuid,uuid,text,text,timestamptz) from public;
revoke all on function public.finalize_refund_success(uuid,uuid,text,text,timestamptz) from anon;
revoke all on function public.finalize_refund_success(uuid,uuid,text,text,timestamptz) from authenticated;
grant execute on function public.finalize_refund_success(uuid,uuid,text,text,timestamptz) to service_role;

create or replace function public.request_full_refund(
  p_payment_id uuid,
  p_actor uuid,
  p_reason_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_refund public.refunds%rowtype;
begin
  select * into v_payment
    from public.payments
   where id = p_payment_id
   for update;
  if not found then
    return jsonb_build_object('outcome', 'payment_not_found');
  end if;

  select * into v_refund
    from public.refunds
   where payment_id = v_payment.id
   for update;
  if found then
    return jsonb_build_object(
      'outcome', 'existing',
      'refund', to_jsonb(v_refund),
      'payment', to_jsonb(v_payment)
    );
  end if;

  if v_payment.status not in ('succeeded', 'duplicate_success') then
    return jsonb_build_object(
      'outcome', 'not_refundable',
      'payment_status', v_payment.status
    );
  end if;

  insert into public.refunds (
    payment_id, provider, amount_minor, currency, status, reason_code,
    requested_by
  ) values (
    v_payment.id, v_payment.provider, v_payment.amount_minor,
    v_payment.currency, 'requested', p_reason_code, p_actor
  )
  returning * into v_refund;

  insert into public.admin_audit_log (
    actor, action, entity_type, entity_id, after_state
  ) values (
    p_actor,
    'refund.requested',
    'refund', v_refund.id::text,
    jsonb_build_object(
      'status', v_refund.status,
      'reason_code', v_refund.reason_code,
      'payment_id', v_payment.id,
      'refund_id', v_refund.id
    )
  );

  return jsonb_build_object(
    'outcome', 'created',
    'refund', to_jsonb(v_refund),
    'payment', to_jsonb(v_payment)
  );
end;
$$;

create or replace function public.finalize_refund_success_audited(
  p_refund_id uuid,
  p_payment_id uuid,
  p_provider_refund_ref text,
  p_provider_status_code text,
  p_completed_at timestamptz,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before_status text;
  v_result jsonb;
begin
  if p_refund_id is not null then
    select status into v_before_status
      from public.refunds
     where id = p_refund_id;
  elsif p_payment_id is not null then
    select status into v_before_status
      from public.refunds
     where payment_id = p_payment_id;
  end if;

  v_result := public.finalize_refund_success(
    p_refund_id,
    p_payment_id,
    p_provider_refund_ref,
    p_provider_status_code,
    p_completed_at
  );

  if not coalesce((v_result->>'already_confirmed')::boolean, false) then
    insert into public.admin_audit_log (
      actor, action, entity_type, entity_id, before_state, after_state
    ) values (
      p_actor,
      'refund.confirmed',
      'refund', v_result->>'refund_id',
      jsonb_build_object('status', v_before_status),
      jsonb_build_object(
        'status', v_result->>'refund_status',
        'payment_status', v_result->>'payment_status',
        'order_status', v_result->>'order_status',
        'entitlement_revoked', (v_result->>'entitlement_revoked')::boolean
      )
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.request_full_refund(uuid,uuid,text) from public;
revoke all on function public.request_full_refund(uuid,uuid,text) from anon;
revoke all on function public.request_full_refund(uuid,uuid,text) from authenticated;
grant execute on function public.request_full_refund(uuid,uuid,text) to service_role;

revoke all on function public.finalize_refund_success_audited(uuid,uuid,text,text,timestamptz,uuid) from public;
revoke all on function public.finalize_refund_success_audited(uuid,uuid,text,text,timestamptz,uuid) from anon;
revoke all on function public.finalize_refund_success_audited(uuid,uuid,text,text,timestamptz,uuid) from authenticated;
grant execute on function public.finalize_refund_success_audited(uuid,uuid,text,text,timestamptz,uuid) to service_role;
