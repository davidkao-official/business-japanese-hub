-- #164 successor repair lock-order hardening: the 15:00 successor-retire writer
-- took the per-stream advisory lock for an incoming replacement stream, then
-- the per-user advisory lock, and only afterwards updated the outgoing
-- (currently current) stream's binding. A concurrent event on that outgoing
-- stream could hold the outgoing stream's row lock while waiting for the same
-- per-user lock, producing a lock-order deadlock.
--
-- This migration only replaces the writer function. The per-user advisory lock
-- (keyed on the claimed user) is now acquired before the per-stream advisory
-- lock and before any subscription row lock, so every user's bind, retire,
-- stream switch, state and access writes run under one consistent order:
--   per-user lock -> source-stream lock -> subscription rows -> state/access.
-- The successor-retire behavior and all previously established behaviors are
-- preserved unchanged:
--   * selecting a replacement stream durably retires the stream it supersedes,
--     and terminal evidence retires its own binding, so later events on an old
--     stream (including a delayed newer start) remain stale and never touch the
--     current stream's access;
--   * terminal evidence older than the reducer's current ordering still
--     revokes access (immediate terminals) or clamps access at its durable
--     terminal_at (delayed period-end cancellation) before returning stale;
--   * event_id uses length-prefixed segments, so arbitrary nonempty source
--     identifiers can no longer collide through ':' concatenation.

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
  v_period_end_terminal boolean;
  v_boundary_reached boolean := false;
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
  v_period_end_terminal := p_event_type = 'membership_canceled' and p_cancel_at_period_end;

  -- Take the per-user advisory lock before any stream or row lock so concurrent
  -- events for the same user -- including a replacement stream that retires the
  -- outgoing current stream -- acquire locks in one consistent order and cannot
  -- deadlock against an event still holding the outgoing stream's row lock.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 164));

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

  -- Length-prefixed segments keep the durable event identity injective for
  -- arbitrary nonempty source identifiers; plain ':' concatenation can collide
  -- (for example source_system 'a:b' versus customer 'b:c').
  v_event_id := length(v_subscription.user_id::text)::text || ':' || v_subscription.user_id::text
    || ':' || length(p_source_system)::text || ':' || p_source_system
    || ':' || length(p_source_customer_id)::text || ':' || p_source_customer_id
    || ':' || length(p_source_subscription_id)::text || ':' || p_source_subscription_id
    || ':' || length(p_source_event_id)::text || ':' || p_source_event_id;
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

  if v_period_end_terminal then
    update public.plus_membership_subscription
    set terminal_at = least(coalesce(terminal_at, p_period_end), p_period_end),
        terminal_event_id = case
          when terminal_at is null or p_period_end < terminal_at then v_event.event_id
          else terminal_event_id
        end
    where source_system = v_subscription.source_system
      and source_customer_id = v_subscription.source_customer_id
      and source_subscription_id = v_subscription.source_subscription_id;
  end if;

  select * into v_subscription
  from public.plus_membership_subscription
  where source_system = p_source_system
    and source_customer_id = p_source_customer_id
    and source_subscription_id = p_source_subscription_id
  for update;

  v_boundary_reached := v_subscription.terminal_at is not null
    and (v_subscription.terminal_at <= p_occurred_at or v_subscription.terminal_at <= now());

  if v_terminal or v_boundary_reached then
    update public.plus_membership_subscription
    set retired_at = coalesce(retired_at, now()),
        retired_event_id = coalesce(retired_event_id, v_event.event_id)
    where source_system = v_subscription.source_system
      and source_customer_id = v_subscription.source_customer_id
      and source_subscription_id = v_subscription.source_subscription_id;
  end if;

  if v_subscription_retired then
    return 'stale';
  end if;

  if v_membership_status = 'active' and not exists (
    select 1 from public.plus_membership_plan where plan_code = p_plan_code and active
  ) then
    raise exception 'plan % is not active for membership activation', p_plan_code;
  end if;

  if v_boundary_reached and p_event_type in (
    'membership_started', 'membership_renewed', 'membership_reactivated',
    'membership_restored', 'membership_pending'
  ) then
    return 'stale';
  end if;

  select * into v_state from public.plus_membership_state
  where user_id = v_subscription.user_id for update;

  if found then
    if v_state.source_system = v_event.source_system
       and v_state.source_customer_id = v_event.source_customer_id
       and v_state.source_subscription_id = v_event.source_subscription_id then
      -- Terminal evidence for the current stream keeps terminal authority even
      -- when it is older than the reducer's ordering. The reducer state still
      -- treats the evidence as stale, but access is revoked (immediate terminal)
      -- or clamped at the durable terminal_at (delayed period-end cancellation)
      -- before the call returns.
      if (v_event.occurred_at, v_event.event_id) <= (v_state.last_event_occurred_at, v_state.last_event_id) then
        if v_terminal then
          insert into public.plus_membership_access as access_row (
            user_id, membership_status, current_period_end
          ) values (
            v_subscription.user_id,
            v_membership_status,
            case when v_subscription.terminal_at is not null
              then least(v_event.period_end, v_subscription.terminal_at)
              else v_event.period_end
            end
          ) on conflict (user_id) do update set
            membership_status = excluded.membership_status,
            current_period_end = least(access_row.current_period_end, excluded.current_period_end),
            updated_at = now();
        elsif v_period_end_terminal and v_subscription.terminal_at is not null then
          update public.plus_membership_access
          set current_period_end = least(current_period_end, v_subscription.terminal_at),
              updated_at = now()
          where user_id = v_subscription.user_id;
        end if;
        return 'stale';
      end if;
      if v_state.membership_status in ('canceled', 'expired', 'revoked')
         or (v_state.membership_status in ('active', 'past_due') and v_membership_status = 'pending') then
        return 'stale';
      end if;
    else
      -- A replaced/noncurrent stream can only retire its own binding. Terminal
      -- evidence here must never alter the current stream's access.
      if v_terminal or v_period_end_terminal then
        update public.plus_membership_subscription
        set retired_at = coalesce(retired_at, now()),
            retired_event_id = coalesce(retired_event_id, v_event.event_id)
        where source_system = v_subscription.source_system
          and source_customer_id = v_subscription.source_customer_id
          and source_subscription_id = v_subscription.source_subscription_id;
        return 'stale';
      end if;
      if (v_event.occurred_at, v_event.event_id) <= (v_state.last_event_occurred_at, v_state.last_event_id)
         or (v_state.membership_status in ('active', 'past_due') and v_membership_status = 'pending')
         or (v_state.membership_status = 'pending' and v_membership_status = 'active')
         or p_event_type not in ('membership_started', 'membership_pending') then
        return 'stale';
      end if;
      -- The incoming stream is newer than the current one and becomes current
      -- below, so the stream it supersedes is retired durably before the switch.
      -- Any later-delivered event on the replaced stream now resolves through
      -- the retired-binding path and can never update state or access again.
      update public.plus_membership_subscription
      set retired_at = coalesce(retired_at, now()),
          retired_event_id = coalesce(retired_event_id, v_event.event_id)
      where source_system = v_state.source_system
        and source_customer_id = v_state.source_customer_id
        and source_subscription_id = v_state.source_subscription_id;
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

  insert into public.plus_membership_access (user_id, membership_status, current_period_end)
  values (
    v_subscription.user_id,
    v_event.membership_status,
    case when v_subscription.terminal_at is not null
      then least(v_event.period_end, v_subscription.terminal_at)
      else v_event.period_end
    end
  )
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
