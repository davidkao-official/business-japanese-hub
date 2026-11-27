-- Bind signed ReturnURL TradeNo receipts and later ExecLog/gwsr receipts to
-- one immutable charge, under the same order lock as the existing writer.
create function public.record_plus_ecpay_authorization(
  p_source_event_id text, p_merchant_trade_no text, p_kind text,
  p_rtn_code text, p_amount_twd integer, p_gwsr text, p_trade_no text,
  p_process_at timestamptz, p_total_success_times integer,
  p_simulate_paid boolean, p_facts_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receipt public.plus_membership_ecpay_receipt%rowtype;
  v_event_id text := p_source_event_id;
  v_times integer := p_total_success_times;
  v_status text;
begin
  perform 1 from public.plus_membership_ecpay_order
  where merchant_trade_no = p_merchant_trade_no for update;
  if not found then raise exception 'unknown ecpay order'; end if;

  select r.* into v_receipt from public.plus_membership_ecpay_receipt r
  where r.merchant_trade_no = p_merchant_trade_no and r.kind = p_kind
    and (r.source_event_id = p_source_event_id
      or (nullif(p_gwsr, '') is not null and r.gwsr = p_gwsr)
      or (p_trade_no is not null and r.trade_no = p_trade_no));

  if found then
    v_event_id := v_receipt.source_event_id;
    v_times := v_receipt.total_success_times;
    -- ReturnURL has no gwsr. When either side is ReturnURL, compare all shared
    -- signed charge facts; otherwise retain the existing immutable hash check.
    v_status := case when
      v_receipt.rtn_code is not distinct from p_rtn_code
      and v_receipt.amount_twd is not distinct from p_amount_twd
      and v_receipt.process_at = p_process_at
      and v_receipt.simulate_paid = p_simulate_paid
      and (v_receipt.trade_no is null or p_trade_no is null or v_receipt.trade_no = p_trade_no)
      and (v_receipt.gwsr = '' or p_gwsr = '' or v_receipt.facts_sha256 = p_facts_sha256)
      then 'replayed' else 'conflict' end;
  else
    if p_rtn_code = '1' and not p_simulate_paid then
      select greatest(v_times, count(*)::integer + 1) into v_times
      from public.plus_membership_ecpay_receipt r
      where r.merchant_trade_no = p_merchant_trade_no and r.kind = 'authorization'
        and r.rtn_code = '1' and not r.simulate_paid
        and r.amount_twd = p_amount_twd and r.process_at < p_process_at;
    end if;
    v_status := public.record_plus_ecpay_receipt(
      v_event_id, p_merchant_trade_no, p_kind, p_rtn_code, p_amount_twd,
      p_gwsr, p_trade_no, p_process_at, v_times, p_simulate_paid, p_facts_sha256
    );
  end if;
  return jsonb_build_object('status', v_status, 'source_event_id', v_event_id,
    'total_success_times', v_times);
end;
$$;

revoke all on function public.record_plus_ecpay_authorization(
  text,text,text,text,integer,text,text,timestamptz,integer,boolean,text
) from public, anon, authenticated;
grant execute on function public.record_plus_ecpay_authorization(
  text,text,text,text,integer,text,text,timestamptz,integer,boolean,text
) to service_role;
