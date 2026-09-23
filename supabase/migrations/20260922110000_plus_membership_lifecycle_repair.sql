-- #164 review repair: bind provider-neutral subscription streams to users,
-- retire terminal streams permanently, and represent uncertain membership as
-- pending without granting Plus access. The 10:00 migration remains intact.

create table public.plus_membership_subscription (
  source_system text not null check (length(trim(source_system)) > 0),
  source_customer_id text not null check (length(trim(source_customer_id)) > 0),
  source_subscription_id text not null check (length(trim(source_subscription_id)) > 0),
  user_id uuid references auth.users (id) on delete set null,
  retired_at timestamptz,
  retired_event_id text,
  bound_at timestamptz not null default now(),
  primary key (source_system, source_customer_id, source_subscription_id),
  unique (retired_event_id)
);

comment on table public.plus_membership_subscription is
  'Canonical immutable source-stream binding. user_id is bound once; terminal evidence retires the stream permanently. A deleted auth user leaves the source binding and audit evidence retained but unavailable.';

alter table public.plus_membership_subscription enable row level security;
revoke all on public.plus_membership_subscription from public, anon, authenticated;
grant select on public.plus_membership_subscription to service_role;

alter table public.plus_membership_event
  drop constraint if exists plus_membership_event_event_type_check;
alter table public.plus_membership_event
  add constraint plus_membership_event_event_type_check check (event_type in (
    'membership_pending', 'membership_started', 'membership_renewed',
    'membership_payment_failed', 'membership_canceled',
    'membership_reactivated', 'membership_expired', 'membership_revoked',
    'membership_refunded', 'membership_reversed', 'membership_disputed',
    'membership_restored'
  ));

alter table public.plus_membership_event
  drop constraint if exists plus_membership_event_membership_status_check;
alter table public.plus_membership_event
  add constraint plus_membership_event_membership_status_check check (
    membership_status in ('pending', 'active', 'past_due', 'canceled', 'expired', 'revoked')
  );

alter table public.plus_membership_state
  drop constraint if exists plus_membership_state_membership_status_check;
alter table public.plus_membership_state
  add constraint plus_membership_state_membership_status_check check (
    membership_status in ('pending', 'active', 'past_due', 'canceled', 'expired', 'revoked')
  );

create or replace function public.plus_membership_event_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'membership lifecycle evidence is append-only';
end;
$$;

revoke all on function public.plus_membership_event_append_only() from public, anon, authenticated;
create trigger plus_membership_event_append_only_guard
before update or delete on public.plus_membership_event
for each row execute function public.plus_membership_event_append_only();

drop function if exists public.record_plus_membership_event(
  text, text, text, text, uuid, text, text, timestamptz, timestamptz, timestamptz, boolean, jsonb
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
  v_subscription public.plus_membership_subscription;
  v_membership_status text;
  v_event_id text;
  v_terminal boolean;
  v_subscription_retired boolean := false;
begin
  if p_source_system is null or length(trim(p_source_system)) = 0
     or p_source_customer_id is null or length(trim(p_source_customer_id)) = 0
     or p_source_subscription_id is null or length(trim(p_source_subscription_id)) = 0
     or p_source_event_id is null or length(trim(p_source_event_id)) = 0
     or p_user_id is null then
    raise exception 'membership source identity and claimed user are required';
  end if;

  if p_period_end <= p_period_start then
    raise exception 'membership period must end after it starts';
  end if;

  v_membership_status := case p_event_type
    when 'membership_pending' then 'pending'
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

  v_terminal := (p_event_type = 'membership_canceled' and not p_cancel_at_period_end)
    or p_event_type in ('membership_expired', 'membership_revoked', 'membership_refunded', 'membership_reversed', 'membership_disputed');

  -- The binding is the authority. A claimed user is only accepted for the
  -- first bind; it is never allowed to rebind an existing source stream.
  perform pg_advisory_xact_lock(hashtextextended(
    p_source_system || ':' || p_source_customer_id || ':' || p_source_subscription_id, 164
  ));
  select * into v_subscription
  from public.plus_membership_subscription
  where source_system = p_source_system
    and source_customer_id = p_source_customer_id
    and source_subscription_id = p_source_subscription_id
  for update;

  if found then
    if v_subscription.user_id is null then
      raise exception 'membership source binding is unavailable';
    end if;
    if v_subscription.user_id <> p_user_id then
      raise exception 'membership source binding belongs to another user';
    end if;
    v_subscription_retired := v_subscription.retired_at is not null;
  else
    insert into public.plus_membership_subscription (
      source_system, source_customer_id, source_subscription_id, user_id
    ) values (
      p_source_system, p_source_customer_id, p_source_subscription_id, p_user_id
    ) returning * into v_subscription;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_subscription.user_id::text, 164));

  v_event_id := v_subscription.user_id::text || ':' || p_source_system || ':' || p_source_customer_id || ':'
    || p_source_subscription_id || ':' || p_source_event_id;
  insert into public.plus_membership_event (
    event_id, source_system, source_customer_id, source_subscription_id,
    source_event_id, user_id, plan_code, event_type,
    occurred_at, period_start, period_end, membership_status,
    cancel_at_period_end, metadata
  ) values (
    v_event_id, p_source_system, p_source_customer_id, p_source_subscription_id,
    p_source_event_id, v_subscription.user_id, p_plan_code, p_event_type,
    p_occurred_at, p_period_start, p_period_end, v_membership_status,
    p_cancel_at_period_end, coalesce(p_metadata, '{}'::jsonb)
  ) on conflict (source_system, source_event_id) do nothing
  returning * into v_event;

  if not found then
    select * into v_event from public.plus_membership_event
    where source_system = p_source_system and source_event_id = p_source_event_id;
    if v_event.user_id <> v_subscription.user_id
       or v_event.source_customer_id <> p_source_customer_id
       or v_event.source_subscription_id <> p_source_subscription_id then
      raise exception 'membership source event identity conflict for %/%', p_source_system, p_source_event_id;
    end if;
    return 'replayed';
  end if;

  -- Retired-stream arrivals remain durable audit evidence but can never
  -- change reducer state or the access projection.
  if v_subscription_retired then
    return 'stale';
  end if;

  if v_membership_status = 'active' and not exists (
    select 1 from public.plus_membership_plan where plan_code = p_plan_code and active
  ) then
    raise exception 'plan % is not active for membership activation', p_plan_code;
  end if;

  select * into v_state from public.plus_membership_state
  where user_id = v_subscription.user_id for update;

  if found then
    if v_state.source_system = v_event.source_system
       and v_state.source_customer_id = v_event.source_customer_id
       and v_state.source_subscription_id = v_event.source_subscription_id then
      if (v_event.occurred_at, v_event.event_id) <= (v_state.last_event_occurred_at, v_state.last_event_id)
         or v_state.membership_status in ('canceled', 'expired', 'revoked')
         or (v_state.membership_status in ('active', 'past_due') and v_membership_status = 'pending') then
        return 'stale';
      end if;
    else
      -- A different stream may replace a terminal/expired stream. Pending or
      -- older uncertainty must never regress already-authoritative access.
      if (v_event.occurred_at, v_event.event_id) <= (v_state.last_event_occurred_at, v_state.last_event_id)
         or (v_state.membership_status in ('active', 'past_due') and v_membership_status = 'pending')
         or (v_state.membership_status = 'pending' and v_membership_status = 'active')
         or p_event_type not in ('membership_started', 'membership_pending') then
        return 'stale';
      end if;
    end if;
  end if;

  insert into public.plus_membership_state (
    user_id, plan_code, membership_status, period_start, period_end,
    source_system, source_customer_id, source_subscription_id,
    cancel_at_period_end, last_event_occurred_at, last_event_id
  ) values (
    v_subscription.user_id, v_event.plan_code, v_event.membership_status,
    v_event.period_start, v_event.period_end, v_event.source_system,
    v_event.source_customer_id, v_event.source_subscription_id,
    v_event.cancel_at_period_end, v_event.occurred_at, v_event.event_id
  ) on conflict (user_id) do update set
    plan_code = excluded.plan_code, membership_status = excluded.membership_status,
    period_start = excluded.period_start, period_end = excluded.period_end,
    source_system = excluded.source_system, source_customer_id = excluded.source_customer_id,
    source_subscription_id = excluded.source_subscription_id,
    cancel_at_period_end = excluded.cancel_at_period_end,
    last_event_occurred_at = excluded.last_event_occurred_at,
    last_event_id = excluded.last_event_id, updated_at = now();

  if v_terminal then
    update public.plus_membership_subscription
    set retired_at = now(), retired_event_id = v_event.event_id
    where source_system = v_subscription.source_system
      and source_customer_id = v_subscription.source_customer_id
      and source_subscription_id = v_subscription.source_subscription_id;
  end if;

  insert into public.plus_membership_access (user_id, membership_status, current_period_end)
  values (v_subscription.user_id, v_event.membership_status, v_event.period_end)
  on conflict (user_id) do update set
    membership_status = excluded.membership_status,
    current_period_end = excluded.current_period_end, updated_at = now();

  return 'applied';
end;
$$;

revoke all on function public.record_plus_membership_event(
  text, text, text, text, uuid, text, text, timestamptz, timestamptz, timestamptz, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.record_plus_membership_event(
  text, text, text, text, uuid, text, text, timestamptz, timestamptz, timestamptz, boolean, jsonb
) to service_role;
