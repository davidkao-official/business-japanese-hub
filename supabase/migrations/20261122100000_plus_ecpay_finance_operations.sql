-- #276 M5. Plus operations are separate from historical Book refunds.
alter table public.plus_membership_ecpay_order add column finance_policy_revision text;
-- A request is not proof of a refund, provider stop, or membership cutoff.
create table public.plus_ecpay_finance_case (
  id uuid primary key default gen_random_uuid(),
  source_event_id text not null references public.plus_membership_ecpay_receipt(source_event_id),
  reason text not null check (reason in ('duplicate_charge', 'refund', 'reversal', 'dispute')),
  requested_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (source_event_id, reason)
);

-- No policy is seeded: #107/#112 must admit the exact environment/revision,
-- including whether the entire recurring stream terminates at effective_at.
-- Only the deployment operator (not a browser or service-role API) may admit it.
create table public.plus_ecpay_finance_policy (
  plan_code text not null references public.plus_membership_plan(plan_code),
  consent_revision text not null check (length(trim(consent_revision)) between 1 and 64),
  environment text not null check (environment in ('stage', 'prod')),
  revision text not null check (length(trim(revision)) between 1 and 64),
  outcome text not null check (outcome in ('refund', 'void', 'reversal', 'dispute')),
  access_effect text not null check (access_effect in ('preserve', 'terminate_stream')),
  approval_sha256 text not null check (approval_sha256 ~ '^[0-9a-f]{64}$'),
  approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null,
  primary key (environment, revision, outcome)
);

create table public.plus_ecpay_financial_outcome (
  case_id uuid primary key references public.plus_ecpay_finance_case(id),
  environment text not null,
  policy_revision text not null,
  outcome text not null,
  trade_no text not null,
  amount_twd integer not null check (amount_twd > 0),
  provider_reference text not null check (length(trim(provider_reference)) between 1 and 128),
  effective_at timestamptz not null,
  evidence_sha256 text not null check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  confirmed_by uuid not null references auth.users(id),
  confirmed_at timestamptz not null default now(),
  lifecycle_result text not null check (lifecycle_result in ('applied', 'replayed', 'stale', 'preserved')),
  foreign key (environment, policy_revision, outcome)
    references public.plus_ecpay_finance_policy(environment, revision, outcome),
  unique (environment, provider_reference)
);

create unique index plus_ecpay_one_full_refund_per_charge
  on public.plus_ecpay_financial_outcome(environment, trade_no)
  where outcome in ('refund', 'void');

alter table public.plus_ecpay_finance_case enable row level security;
alter table public.plus_ecpay_finance_policy enable row level security;
alter table public.plus_ecpay_financial_outcome enable row level security;
revoke all on public.plus_ecpay_finance_case, public.plus_ecpay_finance_policy,
  public.plus_ecpay_financial_outcome from public, anon, authenticated, service_role;
grant select on public.plus_ecpay_finance_case, public.plus_ecpay_finance_policy,
  public.plus_ecpay_financial_outcome to service_role;

create view public.plus_ecpay_finance_open_case with (security_invoker = true) as
  select c.id, c.source_event_id, c.reason, c.created_at,
    r.merchant_trade_no, r.trade_no, r.amount_twd, o.environment, o.finance_policy_revision
  from public.plus_ecpay_finance_case c
  join public.plus_membership_ecpay_receipt r using (source_event_id)
  join public.plus_membership_ecpay_order o using (merchant_trade_no)
  left join public.plus_ecpay_financial_outcome f on f.case_id = c.id
  where f.case_id is null;
revoke all on public.plus_ecpay_finance_open_case from public, anon, authenticated, service_role;
grant select on public.plus_ecpay_finance_open_case to service_role;

create function public.request_plus_ecpay_finance_case(
  p_source_event_id text, p_reason text, p_actor uuid default null
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_case_id uuid;
begin
  if p_actor is null then
    if p_reason is distinct from 'duplicate_charge' then
      raise exception 'finance_admin required';
    end if;
  else
    perform 1 from public.finance_roles where user_id = p_actor and role = 'finance_admin' for share;
    if not found then raise exception 'finance_admin required'; end if;
  end if;
  if p_reason is null or p_reason not in ('duplicate_charge', 'refund', 'reversal', 'dispute') then
    raise exception 'invalid plus finance reason';
  end if;
  perform 1 from public.plus_membership_ecpay_receipt r
    join public.plus_membership_ecpay_order o using (merchant_trade_no)
    where r.source_event_id = p_source_event_id and r.kind = 'authorization'
      and r.rtn_code = '1' and not r.simulate_paid and r.amount_twd = o.period_amount_twd
      and nullif(trim(r.trade_no), '') is not null;
  if not found then raise exception 'verified plus charge required'; end if;

  insert into public.plus_ecpay_finance_case(source_event_id, reason, requested_by)
    values (p_source_event_id, p_reason, p_actor)
    on conflict (source_event_id, reason) do nothing returning id into v_case_id;
  if not found then
    select id into v_case_id from public.plus_ecpay_finance_case
      where source_event_id = p_source_event_id and reason = p_reason;
    return v_case_id;
  end if;
  insert into public.admin_audit_log(actor, action, entity_type, entity_id, after_state)
    values (p_actor, 'plus.finance.requested', 'plus_finance_case', v_case_id::text,
      jsonb_build_object('source_event_id', p_source_event_id, 'reason', p_reason));
  return v_case_id;
end;
$$;

-- Trusted operator/service ingestion ONLY, intentionally absent from the
-- browser-facing finance actions. The caller must verify the provider's actual
-- financial evidence; an admin request or refund API acceptance is insufficient.
create function public.confirm_plus_ecpay_financial_outcome(
  p_case_id uuid, p_environment text, p_trade_no text, p_outcome text,
  p_amount_twd integer, p_provider_reference text, p_effective_at timestamptz,
  p_evidence_sha256 text, p_policy_revision text, p_actor uuid
)
returns text language plpgsql security definer set search_path = public
as $$
declare
  v_case public.plus_ecpay_finance_case;
  v_order public.plus_membership_ecpay_order;
  v_charge public.plus_membership_ecpay_receipt;
  v_existing public.plus_ecpay_financial_outcome;
  v_policy public.plus_ecpay_finance_policy;
  v_result text := 'preserved';
  v_event_type text;
  v_period_start timestamptz;
  v_period_end timestamptz;
begin
  perform 1 from public.finance_roles where user_id = p_actor and role = 'finance_admin' for share;
  if not found then raise exception 'finance_admin required'; end if;
  select * into v_case from public.plus_ecpay_finance_case where id = p_case_id;
  if not found then raise exception 'unknown plus finance case'; end if;
  select * into strict v_charge from public.plus_membership_ecpay_receipt
    where source_event_id = v_case.source_event_id;
  select * into strict v_order from public.plus_membership_ecpay_order
    where merchant_trade_no = v_charge.merchant_trade_no;

  -- Follow the lifecycle writer's user-before-stream lock order. Never lock a
  -- receipt/order first and then wait for the user lifecycle lock.
  perform pg_advisory_xact_lock(hashtextextended(v_order.user_id::text, 164));
  select * into strict v_case from public.plus_ecpay_finance_case where id = p_case_id for update;
  if p_environment is distinct from v_order.environment
      or p_trade_no is distinct from v_charge.trade_no
      or p_amount_twd is distinct from v_charge.amount_twd
      or p_effective_at is null or not isfinite(p_effective_at)
      or p_effective_at < v_charge.process_at or p_effective_at > now()
      or p_evidence_sha256 is null or p_evidence_sha256 !~ '^[0-9a-f]{64}$'
      or p_provider_reference is null or length(trim(p_provider_reference)) not between 1 and 128
      or p_outcome is null or p_outcome not in ('refund', 'void', 'reversal', 'dispute')
      or (v_case.reason = 'duplicate_charge' and p_outcome not in ('refund', 'void'))
      or (v_case.reason = 'refund' and p_outcome not in ('refund', 'void'))
      or (v_case.reason in ('reversal', 'dispute') and p_outcome <> v_case.reason) then
    raise exception 'financial evidence does not match plus charge';
  end if;

  select * into v_existing from public.plus_ecpay_financial_outcome where case_id = p_case_id;
  if found then
    if v_existing.environment = p_environment and v_existing.trade_no = p_trade_no
        and v_existing.outcome = p_outcome and v_existing.amount_twd = p_amount_twd
        and v_existing.provider_reference = p_provider_reference
        and v_existing.effective_at = p_effective_at and v_existing.evidence_sha256 = p_evidence_sha256
        and v_existing.policy_revision = p_policy_revision then
      return 'replayed';
    end if;
    raise exception 'plus financial outcome conflict';
  end if;
  select * into v_policy from public.plus_ecpay_finance_policy
    where environment = p_environment and revision = p_policy_revision and outcome = p_outcome
      and plan_code = v_order.plan_code and consent_revision = v_order.consent_revision
      and revision = v_order.finance_policy_revision
    for share;
  if not found then raise exception 'plus financial policy not admitted'; end if;

  if v_policy.access_effect = 'terminate_stream' then
    select period_start, period_end into v_period_start, v_period_end
      from public.plus_membership_event
      where source_system = 'ecpay_aio_period:' || v_order.environment
        and source_subscription_id = v_order.merchant_trade_no
        and source_event_id = v_charge.source_event_id
        and event_type in ('membership_started', 'membership_renewed');
    if not found then raise exception 'mapped plus charge required for terminal outcome'; end if;
    v_event_type := case p_outcome
      when 'refund' then 'membership_refunded' when 'void' then 'membership_refunded'
      when 'reversal' then 'membership_reversed' when 'dispute' then 'membership_disputed' end;
    v_result := public.record_plus_membership_event(
      'ecpay_aio_period:' || v_order.environment,
      v_order.merchant_trade_no, v_order.merchant_trade_no,
      v_order.merchant_trade_no || ':finance:' || p_case_id::text,
      v_order.user_id, v_order.plan_code, v_event_type, p_effective_at,
      v_period_start, v_period_end, false, jsonb_build_object('case_id', p_case_id, 'policy_revision', p_policy_revision)
    );
    if v_result not in ('applied', 'replayed', 'stale') then
      raise exception 'plus financial lifecycle conflict';
    end if;
  end if;
  insert into public.plus_ecpay_financial_outcome(
    case_id, environment, policy_revision, outcome, trade_no, amount_twd,
    provider_reference, effective_at, evidence_sha256, confirmed_by, lifecycle_result
  ) values (
    p_case_id, p_environment, p_policy_revision, p_outcome, p_trade_no, p_amount_twd,
    p_provider_reference, p_effective_at, p_evidence_sha256, p_actor, v_result
  );
  insert into public.admin_audit_log(actor, action, entity_type, entity_id, after_state)
    values (p_actor, 'plus.finance.confirmed', 'plus_finance_case', p_case_id::text,
      jsonb_build_object('outcome', p_outcome, 'lifecycle_result', v_result,
        'policy_revision', p_policy_revision, 'evidence_sha256', p_evidence_sha256));
  -- Future-charge cancellation is a separate verified provider operation.
  -- Do not close the order here: that would hide it from cancel/reconciliation.
  return v_result;
end;
$$;

revoke all on function public.request_plus_ecpay_finance_case(text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.request_plus_ecpay_finance_case(text, text, uuid) to service_role;
revoke all on function public.confirm_plus_ecpay_financial_outcome(uuid, text, text, text, integer, text, timestamptz, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_plus_ecpay_financial_outcome(uuid, text, text, text, integer, text, timestamptz, text, text, uuid) to service_role;

-- Repair earlier duplicate-charge receipts whose only operational signal was
-- a log. Invalid/simulated/mismatched authorizations never enter this queue.
with queued as (
  insert into public.plus_ecpay_finance_case(source_event_id, reason)
  select r.source_event_id, 'duplicate_charge'
  from public.plus_membership_ecpay_receipt r
  join public.plus_membership_ecpay_order o using (merchant_trade_no)
  where r.lifecycle_result = 'not_mapped' and r.kind = 'authorization'
    and r.rtn_code = '1' and not r.simulate_paid and r.amount_twd = o.period_amount_twd
    and nullif(trim(r.trade_no), '') is not null
  on conflict (source_event_id, reason) do nothing returning id, source_event_id
)
insert into public.admin_audit_log(action, entity_type, entity_id, after_state)
select 'plus.finance.requested', 'plus_finance_case', id::text,
  jsonb_build_object('source_event_id', source_event_id, 'reason', 'duplicate_charge') from queued;
