-- #164: provider-neutral Plus membership lifecycle evidence and projection writer.
--
-- This migration deliberately stops at the server-side lifecycle contract. It
-- does not model a provider, checkout, webhook, dunning, reconciliation, or
-- annual billing. #139's plus_membership_access row remains the read seam.

-- Fail before changing schema or revoking #139 writes if any membership state
-- already exists. The migration runner applies this file in one transaction;
-- NOWAIT rejects an in-flight writer and keeps the lock until that transaction
-- commits. The later lifecycle guard repeats this check for defense in depth.
set transaction isolation level read committed;

lock table public.plus_membership_access
  in share row exclusive mode nowait;

do $membership_bootstrap$
declare
  v_table text;
  v_has_rows boolean;
begin
  foreach v_table in array array[
    'plus_membership_event',
    'plus_membership_subscription',
    'plus_membership_state',
    'plus_membership_access'
  ] loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format('lock table public.%I in share row exclusive mode nowait', v_table);
      execute format('select exists (select 1 from public.%I)', v_table)
        into v_has_rows;
      if v_has_rows then
        raise exception using
          errcode = 'P0001',
          message = format('Plus membership bootstrap requires empty public.%I', v_table);
      end if;
    end if;
  end loop;
end;
$membership_bootstrap$;

create table public.plus_membership_plan (
  plan_code text primary key,
  currency text not null check (currency = 'TWD'),
  amount_minor integer not null check (amount_minor > 0),
  interval text not null check (interval = 'month'),
  active boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.plus_membership_plan is
  'Server-authoritative provider-neutral Plus plans. Inactive plans are retained for future pricing, not checkout.';

insert into public.plus_membership_plan (plan_code, currency, amount_minor, interval, active)
values
  ('plus_early_access_monthly', 'TWD', 29900, 'month', true),
  ('plus_standard_monthly', 'TWD', 39900, 'month', false);

create table public.plus_membership_event (
  event_id text primary key,
  source_system text not null check (length(trim(source_system)) > 0),
  source_customer_id text not null check (length(trim(source_customer_id)) > 0),
  source_subscription_id text not null check (length(trim(source_subscription_id)) > 0),
  source_event_id text not null check (length(trim(source_event_id)) > 0),
  user_id uuid not null,
  plan_code text not null references public.plus_membership_plan (plan_code),
  event_type text not null check (event_type in (
    'membership_started', 'membership_renewed',
    'membership_payment_failed', 'membership_canceled',
    'membership_reactivated', 'membership_expired',
    'membership_revoked', 'membership_refunded', 'membership_reversed',
    'membership_disputed', 'membership_restored'
  )),
  occurred_at timestamptz not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  membership_status text not null check (membership_status in (
    'active', 'past_due', 'canceled', 'expired', 'revoked'
  )),
  cancel_at_period_end boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now(),
  unique (source_system, source_event_id),
  check (period_end > period_start)
);

comment on table public.plus_membership_event is
  'Append-only normalized Plus membership lifecycle audit. Stream identity is source_system + source_customer_id + source_subscription_id; auth deletion never removes evidence.';

create index plus_membership_event_user_order_idx
  on public.plus_membership_event (user_id, occurred_at, event_id);

create table public.plus_membership_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan_code text not null references public.plus_membership_plan (plan_code),
  source_system text not null,
  source_customer_id text not null,
  source_subscription_id text not null,
  membership_status text not null check (membership_status in (
    'active', 'past_due', 'canceled', 'expired', 'revoked'
  )),
  period_start timestamptz not null,
  period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  last_event_occurred_at timestamptz not null,
  last_event_id text not null references public.plus_membership_event (event_id),
  updated_at timestamptz not null default now(),
  check (period_end > period_start)
);

comment on table public.plus_membership_state is
  'Deterministic per-user lifecycle reducer state; plus_membership_access remains the delivery projection.';

alter table public.plus_membership_plan enable row level security;
alter table public.plus_membership_event enable row level security;
alter table public.plus_membership_state enable row level security;

revoke all on public.plus_membership_plan from public, anon, authenticated;
revoke all on public.plus_membership_event from public, anon, authenticated;
revoke all on public.plus_membership_state from public, anon, authenticated;
grant select on public.plus_membership_plan to service_role;
grant select on public.plus_membership_event to service_role;
grant select on public.plus_membership_state to service_role;

-- #139 granted service_role direct projection writes. Keep the read seam, but
-- make this lifecycle writer the only service-side mutation boundary.
revoke insert, update, delete on public.plus_membership_access from service_role;
grant select on public.plus_membership_access to service_role;

drop function if exists public.record_plus_membership_event(
  text, uuid, text, text, timestamptz, timestamptz, timestamptz, text, boolean, jsonb
);

create or replace function public.record_plus_membership_event(
  p_source_system text,
  p_source_customer_id text,
  p_source_subscription_id text,
  p_source_event_id text,
  p_user_id uuid,
  p_plan_code text,
  p_event_type text,
  p_occurred_at timestamptz,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean default false,
  p_metadata jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.plus_membership_event;
  v_state public.plus_membership_state;
  v_membership_status text;
  v_event_id text;
begin
  if p_source_system is null or length(trim(p_source_system)) = 0
     or p_source_customer_id is null or length(trim(p_source_customer_id)) = 0
     or p_source_subscription_id is null or length(trim(p_source_subscription_id)) = 0
     or p_source_event_id is null or length(trim(p_source_event_id)) = 0 then
    raise exception 'membership source system, customer, subscription, and event identity are required';
  end if;

  if p_period_end <= p_period_start then
    raise exception 'membership period must end after it starts';
  end if;

  v_membership_status := case p_event_type
    when 'membership_started' then 'active'
    when 'membership_renewed' then 'active'
    when 'membership_reactivated' then 'active'
    when 'membership_payment_failed' then 'past_due'
    when 'membership_canceled' then case when p_cancel_at_period_end then 'active' else 'canceled' end
    when 'membership_expired' then 'expired'
    when 'membership_revoked' then 'revoked'
    when 'membership_refunded' then 'revoked'
    when 'membership_reversed' then 'revoked'
    when 'membership_disputed' then 'revoked'
    when 'membership_restored' then 'active'
    else null
  end;

  if v_membership_status is null then
    raise exception 'unsupported membership event type %', p_event_type;
  end if;

  -- Serialize every event for a user before looking for state. This includes
  -- the no-state/first-event case, so two concurrent first events cannot both
  -- pass the reducer ordering check.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 164));

  v_event_id := p_user_id::text || ':' || p_source_system || ':' || p_source_customer_id || ':'
    || p_source_subscription_id || ':' || p_source_event_id;
  insert into public.plus_membership_event (
    event_id, source_system, source_customer_id, source_subscription_id,
    source_event_id, user_id, plan_code, event_type,
    occurred_at, period_start, period_end, membership_status,
    cancel_at_period_end, metadata
  ) values (
    v_event_id, p_source_system, p_source_customer_id, p_source_subscription_id,
    p_source_event_id, p_user_id, p_plan_code, p_event_type,
    p_occurred_at, p_period_start, p_period_end, v_membership_status,
    p_cancel_at_period_end, coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (source_system, source_event_id) do nothing
  returning * into v_event;

  if not found then
    select * into v_event
    from public.plus_membership_event
    where source_system = p_source_system and source_event_id = p_source_event_id;
    if v_event.user_id <> p_user_id
       or v_event.source_customer_id <> p_source_customer_id
       or v_event.source_subscription_id <> p_source_subscription_id then
      raise exception 'membership source event identity conflict for %/%', p_source_system, p_source_event_id;
    end if;
    return 'replayed';
  end if;

  -- Activation is derived solely from the event type and can only use an
  -- explicitly active plan. A caller cannot activate an inactive future plan
  -- by supplying an active status or by choosing a different event type.
  -- This check follows replay detection so an already accepted event remains
  -- idempotent if the plan catalog is later changed.
  if v_membership_status = 'active'
     and not exists (
       select 1 from public.plus_membership_plan
       where plan_code = p_plan_code and active
     ) then
    raise exception 'plan % is not active for membership activation', p_plan_code;
  end if;

  select * into v_state
  from public.plus_membership_state
  where user_id = p_user_id
  for update;

  -- (occurred_at,event_id) is the total ordering. A late event remains in the
  -- audit log but cannot roll the reducer or access projection backwards.
  if found and (
       v_event.source_system <> v_state.source_system
       or v_event.source_customer_id <> v_state.source_customer_id
       or v_event.source_subscription_id <> v_state.source_subscription_id
     ) then
    -- A replacement stream is selected only by its own start event.
    -- Once selected, a late event from the old stream is audit-only even if
    -- its provider timestamp happens to be newer than the replacement.
    if v_event.event_type <> 'membership_started'
       or (v_event.occurred_at, v_event.event_id)
          <= (v_state.last_event_occurred_at, v_state.last_event_id) then
      return 'stale';
    end if;
  elsif found and (v_event.occurred_at, v_event.event_id)
      <= (v_state.last_event_occurred_at, v_state.last_event_id) then
    return 'stale';
  end if;

  insert into public.plus_membership_state (
    user_id, plan_code, membership_status, period_start, period_end,
    source_system, source_customer_id, source_subscription_id,
    cancel_at_period_end, last_event_occurred_at, last_event_id
  ) values (
    v_event.user_id, v_event.plan_code, v_event.membership_status,
    v_event.period_start, v_event.period_end,
    v_event.source_system, v_event.source_customer_id, v_event.source_subscription_id,
    v_event.cancel_at_period_end,
    v_event.occurred_at, v_event.event_id
  )
  on conflict (user_id) do update set
    plan_code = excluded.plan_code,
    membership_status = excluded.membership_status,
    period_start = excluded.period_start,
    period_end = excluded.period_end,
    source_system = excluded.source_system,
    source_customer_id = excluded.source_customer_id,
    source_subscription_id = excluded.source_subscription_id,
    cancel_at_period_end = excluded.cancel_at_period_end,
    last_event_occurred_at = excluded.last_event_occurred_at,
    last_event_id = excluded.last_event_id,
    updated_at = now();

  insert into public.plus_membership_access (
    user_id, membership_status, current_period_end
  ) values (
    v_event.user_id, v_event.membership_status, v_event.period_end
  )
  on conflict (user_id) do update set
    membership_status = excluded.membership_status,
    current_period_end = excluded.current_period_end,
    updated_at = now();

  return 'applied';
end;
$$;

revoke all on function public.record_plus_membership_event(
  text, text, text, text, uuid, text, text, timestamptz, timestamptz, timestamptz, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.record_plus_membership_event(
  text, text, text, text, uuid, text, text, timestamptz, timestamptz, timestamptz, boolean, jsonb
) to service_role;
