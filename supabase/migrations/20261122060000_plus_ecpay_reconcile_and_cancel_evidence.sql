-- Provider stop is an audited billing fact, not an invented membership cutoff.
-- Valid pre-stop charges may be delivered later; generic terminal facts stay immutable.
alter table public.plus_membership_ecpay_order
  add column reconcile_after timestamptz not null default now(),
  add column provider_canceled_at timestamptz,
  add column cancel_reconcile_pending boolean not null default false;

create index plus_ecpay_reconcile_queue
  on public.plus_membership_ecpay_order (environment, reconcile_after, merchant_trade_no)
  where status in ('pending', 'active', 'cancel_requested')
    or (status = 'canceled' and cancel_reconcile_pending);

-- Claim one at a time so a function deadline cannot lease an unprocessed batch.
-- Move even an unsuccessful attempt behind waiting orders BEFORE provider I/O.
-- SKIP LOCKED also prevents concurrent schedulers from claiming the same row.
create function public.claim_plus_ecpay_reconcile_order(p_environment text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order public.plus_membership_ecpay_order%rowtype;
begin
  if p_environment not in ('stage', 'prod') or p_environment is null then
    raise exception 'invalid ecpay environment';
  end if;
  select * into v_order from public.plus_membership_ecpay_order
  where environment = p_environment and reconcile_after <= clock_timestamp()
    and (status in ('pending', 'active', 'cancel_requested')
      or (status = 'canceled' and cancel_reconcile_pending))
  order by reconcile_after, merchant_trade_no
  limit 1 for update skip locked;
  if not found then return null; end if;
  update public.plus_membership_ecpay_order
  set reconcile_after = clock_timestamp() + interval '1 hour'
  where merchant_trade_no = v_order.merchant_trade_no;
  -- updated_at remains the business-state timestamp, never a scheduler clock.
  return to_jsonb(v_order);
end;
$$;

-- Called only after the Edge verifies a merchant/order-bound Cancel signature.
-- The first observed acknowledgement is immutable across retries (including
-- 90100149); a legacy closed row without that evidence cannot be backfilled here.
create function public.confirm_plus_ecpay_customer_cancel(
  p_merchant_trade_no text, p_rtn_code text, p_facts_sha256 text,
  p_confirmed_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order public.plus_membership_ecpay_order%rowtype;
begin
  select * into v_order from public.plus_membership_ecpay_order
  where merchant_trade_no = p_merchant_trade_no for update;
  if not found then raise exception 'unknown ecpay order'; end if;
  if v_order.provider_canceled_at is not null then
    return jsonb_build_object('provider_canceled_at', v_order.provider_canceled_at);
  end if;
  if v_order.status not in ('active', 'cancel_requested')
    or p_rtn_code is null or p_rtn_code not in ('1', '90100149')
    or p_confirmed_at is null or not isfinite(p_confirmed_at)
    or p_confirmed_at < v_order.created_at
    or p_facts_sha256 is null or p_facts_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid customer cancel evidence';
  end if;
  perform public.record_plus_ecpay_receipt(
    p_merchant_trade_no || ':provider-cancel', p_merchant_trade_no, 'cancel',
    p_rtn_code, null, null, null, p_confirmed_at, null, false, p_facts_sha256
  );
  update public.plus_membership_ecpay_order
  set status = 'canceled', provider_canceled_at = p_confirmed_at,
      cancel_reconcile_pending = true, updated_at = clock_timestamp(),
      reconcile_after = least(reconcile_after, clock_timestamp())
  where merchant_trade_no = p_merchant_trade_no;
  return jsonb_build_object('provider_canceled_at', p_confirmed_at);
end;
$$;

create function public.complete_plus_ecpay_cancel_readback(p_merchant_trade_no text)
returns void language sql security definer set search_path = public as $$
  update public.plus_membership_ecpay_order set cancel_reconcile_pending = false
  where merchant_trade_no = p_merchant_trade_no
    and status = 'canceled' and provider_canceled_at is not null;
$$;

revoke all on function public.claim_plus_ecpay_reconcile_order(text) from public, anon, authenticated;
grant execute on function public.claim_plus_ecpay_reconcile_order(text) to service_role;
revoke all on function public.confirm_plus_ecpay_customer_cancel(text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.confirm_plus_ecpay_customer_cancel(text,text,text,timestamptz) to service_role;
revoke all on function public.complete_plus_ecpay_cancel_readback(text) from public, anon, authenticated;
grant execute on function public.complete_plus_ecpay_cancel_readback(text) to service_role;
