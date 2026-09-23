-- A #164 production bootstrap requires empty lifecycle tables. This check is
-- intentionally fail-closed; it does not delete or reinterpret existing rows.
create or replace function public.assert_plus_membership_lifecycle_bootstrap_empty()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.plus_membership_event)
     or exists (select 1 from public.plus_membership_subscription)
     or exists (select 1 from public.plus_membership_state)
     or exists (select 1 from public.plus_membership_access) then
    raise exception using
      errcode = 'P0001',
      message = 'Plus membership lifecycle bootstrap requires empty lifecycle tables';
  end if;
end;
$$;

revoke all on function public.assert_plus_membership_lifecycle_bootstrap_empty()
  from public, anon, authenticated, service_role;

do $$
begin
  perform public.assert_plus_membership_lifecycle_bootstrap_empty();
end;
$$;

-- Legacy initial-start evidence has unknown admission provenance. Keep new
-- receipt facts intact, but do not let a new start erase stream ambiguity.
create or replace function public.recompute_plus_membership_stream(
  p_source_system text,
  p_source_customer_id text,
  p_source_subscription_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_start public.plus_membership_event;
  v_event public.plus_membership_event;
  v_trusted_start_count integer;
  v_conflicted boolean;
  v_legacy_start_exists boolean;
  v_cutoff timestamptz;
  v_cutoff_event_id text;
  v_effective_start timestamptz;
  v_status text;
  v_plan_code text;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_cancel_at_period_end boolean := false;
  v_last_at timestamptz;
  v_last_id text;
  v_applied_at timestamptz;
  v_applied_id text;
  v_access_start timestamptz;
  v_qualified boolean := false;
  v_access_end timestamptz;
begin
  select user_id into v_user_id
  from public.plus_membership_subscription
  where source_system = p_source_system
    and source_customer_id = p_source_customer_id
    and source_subscription_id = p_source_subscription_id;
  if v_user_id is null then
    raise exception 'membership source binding is unavailable';
  end if;

  select count(*) filter (where event_type = 'membership_started'
                           and plan_active_when_observed is true
                           and reducer_version = 1)
  into v_trusted_start_count
  from public.plus_membership_event
  where source_system = p_source_system
    and source_customer_id = p_source_customer_id
    and source_subscription_id = p_source_subscription_id;
  v_conflicted := v_trusted_start_count > 1;

  select exists (
    select 1 from public.plus_membership_event
    where source_system = p_source_system
      and source_customer_id = p_source_customer_id
      and source_subscription_id = p_source_subscription_id
      and event_type = 'membership_started'
      and reducer_version is null
  ) into v_legacy_start_exists;

  -- Terminal authority is scoped to this stream and folded before admission.
  select case
           when event_type = 'membership_canceled' and cancel_at_period_end then period_end
           else occurred_at
         end,
         event_id
  into v_cutoff, v_cutoff_event_id
  from public.plus_membership_event
  where source_system = p_source_system
    and source_customer_id = p_source_customer_id
    and source_subscription_id = p_source_subscription_id
    and (event_type in ('membership_expired', 'membership_revoked', 'membership_refunded',
                        'membership_reversed', 'membership_disputed')
         or event_type = 'membership_canceled')
  order by case when event_type = 'membership_canceled' and cancel_at_period_end
                then period_end else occurred_at end,
           event_id
  limit 1;

  if not v_conflicted and not v_legacy_start_exists and v_trusted_start_count = 1 then
    select * into v_start
    from public.plus_membership_event
    where source_system = p_source_system
      and source_customer_id = p_source_customer_id
      and source_subscription_id = p_source_subscription_id
      and event_type = 'membership_started'
      and plan_active_when_observed is true
      and reducer_version = 1;
    v_effective_start := greatest(v_start.occurred_at, v_start.period_start);

    if v_start.period_end > v_effective_start
       and (v_cutoff is null or v_cutoff > v_effective_start) then
      v_qualified := true;
      v_plan_code := v_start.plan_code;
      v_status := 'active';
      v_period_start := v_start.period_start;
      v_period_end := v_start.period_end;
      v_access_start := v_effective_start;
      v_applied_at := v_start.occurred_at;
      v_applied_id := v_start.event_id;
      v_last_at := v_start.occurred_at;
      v_last_id := v_start.event_id;

      for v_event in
        select * from public.plus_membership_event
        where source_system = p_source_system
          and source_customer_id = p_source_customer_id
          and source_subscription_id = p_source_subscription_id
          and (occurred_at, event_id) > (v_start.occurred_at, v_start.event_id)
        order by occurred_at, event_id
      loop
        if (v_event.occurred_at, v_event.event_id) > (v_last_at, v_last_id) then
          v_last_at := v_event.occurred_at;
          v_last_id := v_event.event_id;
        end if;
        -- Facts that happened before the paid interval cannot seed admission
        -- or move the state of the confirmed membership.
        if v_event.occurred_at < v_effective_start then
          continue;
        end if;
        if v_event.event_type in (
          'membership_canceled', 'membership_expired', 'membership_revoked',
          'membership_refunded', 'membership_reversed', 'membership_disputed'
        ) and v_event.event_id <> v_cutoff_event_id then
          continue;
        end if;
        if v_cutoff is not null and v_event.event_type not in (
          'membership_canceled', 'membership_expired', 'membership_revoked',
          'membership_refunded', 'membership_reversed', 'membership_disputed'
        ) and v_event.occurred_at >= v_cutoff then
          continue;
        end if;
        if v_event.event_type = 'membership_pending' then
          continue;
        elsif v_event.event_type in (
          'membership_expired', 'membership_revoked', 'membership_refunded',
          'membership_reversed', 'membership_disputed'
        ) or (v_event.event_type = 'membership_canceled' and not v_event.cancel_at_period_end) then
          v_status := case when v_event.event_type = 'membership_expired' then 'expired'
                           when v_event.event_type = 'membership_canceled' then 'canceled'
                           else 'revoked' end;
          v_plan_code := v_event.plan_code;
          v_period_start := v_event.period_start;
          v_period_end := v_event.period_end;
          v_cancel_at_period_end := false;
          v_applied_at := v_event.occurred_at;
          v_applied_id := v_event.event_id;
        elsif v_event.event_type = 'membership_canceled' and v_event.cancel_at_period_end then
          if v_event.plan_code = v_plan_code then
            -- Scheduling cancellation clamps the current state; it cannot
            -- turn past_due back into active.
            v_cancel_at_period_end := true;
            v_applied_at := v_event.occurred_at;
            v_applied_id := v_event.event_id;
          end if;
        elsif v_event.event_type = 'membership_payment_failed' then
          if v_event.plan_code is distinct from v_plan_code then
            continue;
          end if;
          v_status := 'past_due';
          v_period_start := v_event.period_start;
          v_period_end := v_event.period_end;
          v_access_start := greatest(v_access_start, v_period_start);
          v_cancel_at_period_end := false;
          v_applied_at := v_event.occurred_at;
          v_applied_id := v_event.event_id;
        elsif v_event.event_type in (
          'membership_renewed', 'membership_reactivated', 'membership_restored'
        ) then
          if v_event.plan_code is distinct from v_plan_code
             and v_event.plan_active_when_observed is not true then
            continue;
          end if;
          v_access_start := case
            when v_status = 'active' and v_period_end >= greatest(v_event.occurred_at, v_event.period_start)
              then v_access_start
            else greatest(v_event.occurred_at, v_event.period_start)
          end;
          v_status := 'active';
          v_plan_code := v_event.plan_code;
          v_period_start := v_event.period_start;
          v_period_end := v_event.period_end;
          v_cancel_at_period_end := false;
          v_applied_at := v_event.occurred_at;
          v_applied_id := v_event.event_id;
        end if;
      end loop;
      v_access_end := case when v_cutoff is not null
                           then least(v_period_end, v_cutoff)
                           else v_period_end end;
      if exists (
        select 1 from public.plus_membership_event
        where event_id = v_cutoff_event_id
          and event_type = 'membership_canceled'
          and cancel_at_period_end
      ) then
        v_cancel_at_period_end := true;
      end if;
    end if;
  end if;

  insert into public.plus_membership_stream_summary (
    source_system, source_customer_id, source_subscription_id, user_id,
    reducer_version, qualified, conflicted, start_occurred_at, start_event_id,
    effective_start, current_period_start, access_period_end,
    plan_code, membership_status, period_start, period_end,
    cancel_at_period_end, last_event_occurred_at, last_event_id,
    applied_event_occurred_at, applied_event_id, terminal_at, terminal_event_id, updated_at
  ) values (
    p_source_system, p_source_customer_id, p_source_subscription_id, v_user_id,
    1, v_qualified, v_conflicted,
    case when v_trusted_start_count = 1 then v_start.occurred_at end,
    case when v_trusted_start_count = 1 then v_start.event_id end,
    v_effective_start, v_access_start, v_access_end,
    v_plan_code, v_status, v_period_start, v_period_end,
    v_cancel_at_period_end, v_last_at, v_last_id, v_applied_at, v_applied_id,
    v_cutoff, v_cutoff_event_id, now()
  ) on conflict (source_system, source_customer_id, source_subscription_id)
  do update set
    user_id = excluded.user_id,
    reducer_version = excluded.reducer_version,
    qualified = excluded.qualified,
    conflicted = excluded.conflicted,
    start_occurred_at = excluded.start_occurred_at,
    start_event_id = excluded.start_event_id,
    effective_start = excluded.effective_start,
    current_period_start = excluded.current_period_start,
    access_period_end = excluded.access_period_end,
    plan_code = excluded.plan_code,
    membership_status = excluded.membership_status,
    period_start = excluded.period_start,
    period_end = excluded.period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    last_event_occurred_at = excluded.last_event_occurred_at,
    last_event_id = excluded.last_event_id,
    applied_event_occurred_at = excluded.applied_event_occurred_at,
    applied_event_id = excluded.applied_event_id,
    terminal_at = excluded.terminal_at,
    terminal_event_id = excluded.terminal_event_id,
    updated_at = excluded.updated_at;
end;
$$;


revoke all on function public.recompute_plus_membership_stream(text, text, text)
  from public, anon, authenticated, service_role;

comment on function public.recompute_plus_membership_stream(text, text, text) is
  'Rebuilds the touched stream, keeping legacy-start ambiguity unqualified without treating it as a new-start conflict.';

comment on function public.assert_plus_membership_lifecycle_bootstrap_empty() is
  'Read-only preflight for the Plus lifecycle migration chain; requires empty event, binding, state, and access tables.';
