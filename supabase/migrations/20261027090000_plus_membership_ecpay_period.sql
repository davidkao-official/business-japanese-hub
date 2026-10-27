create table public.plus_membership_ecpay_order (
  merchant_trade_no text primary key check (merchant_trade_no ~ '^BJHP[0-9A-Z]{16}$'),
  environment text not null check (environment in ('stage', 'prod')),
  user_id uuid not null references auth.users(id),
  plan_code text not null references public.plus_membership_plan(plan_code),
  period_amount_twd integer not null check (period_amount_twd > 0),
  exec_times integer not null check (exec_times between 1 and 99),
  consent_revision text not null check (length(consent_revision) between 1 and 64),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'cancel_requested', 'canceled', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index plus_membership_ecpay_order_active_user_environment
  on public.plus_membership_ecpay_order (user_id, environment)
  where status in ('active', 'cancel_requested');

create table public.plus_membership_ecpay_receipt (
  source_event_id text primary key,
  merchant_trade_no text not null references public.plus_membership_ecpay_order(merchant_trade_no),
  kind text not null check (kind in ('authorization', 'cancel', 'provider_stop')),
  rtn_code text not null,
  amount_twd integer,
  gwsr text,
  trade_no text,
  process_at timestamptz not null,
  total_success_times integer,
  simulate_paid boolean not null default false,
  facts_sha256 text not null check (facts_sha256 ~ '^[0-9a-f]{64}$'),
  lifecycle_result text check (lifecycle_result in ('applied', 'replayed', 'stale', 'conflict', 'not_mapped')),
  received_at timestamptz not null default now()
);

alter table public.plus_membership_ecpay_order enable row level security;
alter table public.plus_membership_ecpay_receipt enable row level security;

revoke all on table public.plus_membership_ecpay_order from public, anon, authenticated, service_role;
revoke all on table public.plus_membership_ecpay_receipt from public, anon, authenticated, service_role;
grant select on table public.plus_membership_ecpay_order to service_role;
grant select on table public.plus_membership_ecpay_receipt to service_role;

create or replace function public.create_plus_ecpay_order(
  p_user_id uuid,
  p_plan_code text,
  p_environment text,
  p_consent_revision text
)
returns table (merchant_trade_no text, period_amount_twd integer, exec_times integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plus_membership_plan%rowtype;
  v_merchant_trade_no text;
begin
  select p.* into v_plan
  from public.plus_membership_plan p
  where p.plan_code = p_plan_code
  for share;

  if not found or not v_plan.active then
    raise exception 'plus plan not active';
  end if;

  if exists (
    select 1 from public.plus_membership_ecpay_order o
    where o.user_id = p_user_id and o.environment = p_environment
      and o.status in ('active', 'cancel_requested')
  ) then
    raise exception 'plus ecpay order already active';
  end if;

  loop
    v_merchant_trade_no := 'BJHP' || upper(substr(md5(gen_random_uuid()::text), 1, 16));
    exit when not exists (
      select 1 from public.plus_membership_ecpay_order o
      where o.merchant_trade_no = v_merchant_trade_no
    );
  end loop;

  merchant_trade_no := v_merchant_trade_no;
  period_amount_twd := v_plan.amount_minor / 100;
  exec_times := 99;

  insert into public.plus_membership_ecpay_order (
    merchant_trade_no, environment, user_id, plan_code,
    period_amount_twd, exec_times, consent_revision
  ) values (
    merchant_trade_no, p_environment, p_user_id, p_plan_code,
    period_amount_twd, exec_times, p_consent_revision
  );

  return next;
end;
$$;

create or replace function public.record_plus_ecpay_receipt(
  p_source_event_id text,
  p_merchant_trade_no text,
  p_kind text,
  p_rtn_code text,
  p_amount_twd integer,
  p_gwsr text,
  p_trade_no text,
  p_process_at timestamptz,
  p_total_success_times integer,
  p_simulate_paid boolean,
  p_facts_sha256 text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_facts_sha256 text;
begin
  select o.status into v_status
  from public.plus_membership_ecpay_order o
  where o.merchant_trade_no = p_merchant_trade_no
  for update;

  if not found then
    raise exception 'unknown ecpay order';
  end if;

  select r.facts_sha256 into v_facts_sha256
  from public.plus_membership_ecpay_receipt r
  where r.source_event_id = p_source_event_id;

  if found then
    return case when v_facts_sha256 = p_facts_sha256 then 'replayed' else 'conflict' end;
  end if;

  insert into public.plus_membership_ecpay_receipt (
    source_event_id, merchant_trade_no, kind, rtn_code, amount_twd,
    gwsr, trade_no, process_at, total_success_times, simulate_paid, facts_sha256
  ) values (
    p_source_event_id, p_merchant_trade_no, p_kind, p_rtn_code, p_amount_twd,
    p_gwsr, p_trade_no, p_process_at, p_total_success_times, p_simulate_paid, p_facts_sha256
  ) on conflict (source_event_id) do nothing;

  if not found then
    select r.facts_sha256 into v_facts_sha256
    from public.plus_membership_ecpay_receipt r
    where r.source_event_id = p_source_event_id;

    return case when v_facts_sha256 = p_facts_sha256 then 'replayed' else 'conflict' end;
  end if;

  if p_kind = 'authorization' and p_rtn_code = '1'
      and not p_simulate_paid and v_status = 'pending' then
    -- A second checkout that also succeeded stays pending (the receipt is kept)
    -- instead of tripping the one-active-order index and losing the receipt.
    update public.plus_membership_ecpay_order o
    set status = 'active', updated_at = now()
    where o.merchant_trade_no = p_merchant_trade_no
      and not exists (
        select 1 from public.plus_membership_ecpay_order other
        where other.user_id = o.user_id and other.environment = o.environment
          and other.status in ('active', 'cancel_requested')
      );
  end if;

  return 'new';
end;
$$;

create or replace function public.set_plus_ecpay_receipt_result(
  p_source_event_id text,
  p_result text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result text;
begin
  select r.lifecycle_result into v_result
  from public.plus_membership_ecpay_receipt r
  where r.source_event_id = p_source_event_id
  for update;

  if v_result is not null then
    if v_result is distinct from p_result then
      raise exception 'receipt result already set';
    end if;
    return;
  end if;

  update public.plus_membership_ecpay_receipt
  set lifecycle_result = p_result
  where source_event_id = p_source_event_id and lifecycle_result is null;
end;
$$;

create or replace function public.set_plus_ecpay_order_status(
  p_merchant_trade_no text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select o.status into v_status
  from public.plus_membership_ecpay_order o
  where o.merchant_trade_no = p_merchant_trade_no
  for update;

  if found and v_status = p_status then
    return;
  end if;

  if (v_status = 'active' and p_status in ('cancel_requested', 'canceled', 'ended'))
      or (v_status = 'cancel_requested' and p_status in ('canceled', 'ended'))
      or (v_status = 'pending' and p_status = 'ended') then
    update public.plus_membership_ecpay_order
    set status = p_status, updated_at = now()
    where merchant_trade_no = p_merchant_trade_no;
  else
    raise exception 'invalid ecpay order transition';
  end if;
end;
$$;

revoke all on function public.create_plus_ecpay_order(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_plus_ecpay_order(uuid, text, text, text)
  to service_role;

revoke all on function public.record_plus_ecpay_receipt(
  text, text, text, text, integer, text, text, timestamptz, integer, boolean, text
) from public, anon, authenticated;
grant execute on function public.record_plus_ecpay_receipt(
  text, text, text, text, integer, text, text, timestamptz, integer, boolean, text
) to service_role;

revoke all on function public.set_plus_ecpay_receipt_result(text, text)
  from public, anon, authenticated;
grant execute on function public.set_plus_ecpay_receipt_result(text, text)
  to service_role;

revoke all on function public.set_plus_ecpay_order_status(text, text)
  from public, anon, authenticated;
grant execute on function public.set_plus_ecpay_order_status(text, text)
  to service_role;
