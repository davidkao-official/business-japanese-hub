-- #165 deterministic per-stream reconciliation. Source events are the audit
-- authority; the existing per-user state/access rows are disposable projections.

-- A null marker means the event predates this reducer and cannot prove that an
-- audited start passed the new receipt/binding admission contract. Leave legacy
-- evidence unknown; only this RPC writes reducer version 1.
alter table public.plus_membership_event
  add column reducer_version integer;

alter table public.plus_membership_event
  add constraint plus_membership_event_reducer_version_check
  check (reducer_version is null or reducer_version = 1);

comment on column public.plus_membership_event.reducer_version is
  'Server-owned admission proof version. NULL legacy events are not qualified as initial starts by reconciliation.';

create table public.plus_membership_stream_summary (
  source_system text not null,
  source_customer_id text not null,
  source_subscription_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  reducer_version integer not null default 1,
  qualified boolean not null default false,
  conflicted boolean not null default false,
  start_occurred_at timestamptz,
  start_event_id text references public.plus_membership_event(event_id),
  effective_start timestamptz,
  current_period_start timestamptz,
  access_period_end timestamptz,
  plan_code text references public.plus_membership_plan(plan_code),
  membership_status text,
  period_start timestamptz,
  period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  last_event_occurred_at timestamptz,
  last_event_id text references public.plus_membership_event(event_id),
  applied_event_occurred_at timestamptz,
  applied_event_id text references public.plus_membership_event(event_id),
  terminal_at timestamptz,
  terminal_event_id text references public.plus_membership_event(event_id),
  updated_at timestamptz not null default now(),
  primary key (source_system, source_customer_id, source_subscription_id),
  check ((start_occurred_at is null) = (start_event_id is null)),
  check ((last_event_occurred_at is null) = (last_event_id is null)),
  check ((applied_event_occurred_at is null) = (applied_event_id is null)),
  check ((terminal_at is null) = (terminal_event_id is null)),
  check (not qualified or (
    start_occurred_at is not null and effective_start is not null
    and plan_code is not null and membership_status is not null
    and current_period_start is not null
    and access_period_end is not null
    and period_start is not null and period_end is not null
    and applied_event_occurred_at is not null and applied_event_id is not null
  )),
  check (membership_status is null or membership_status in (
    'active', 'past_due', 'pending', 'canceled', 'expired', 'revoked'
  ))
);

create index plus_membership_stream_summary_user_selection_idx
  on public.plus_membership_stream_summary (user_id, start_occurred_at desc, start_event_id desc)
  where qualified and not conflicted;

alter table public.plus_membership_stream_summary enable row level security;
revoke all on public.plus_membership_stream_summary from public, anon, authenticated;
grant select on public.plus_membership_stream_summary to service_role;

comment on table public.plus_membership_stream_summary is
  'Server-only materialized fold of one source subscription stream. No legacy summaries are backfilled; each row is rebuilt from that stream’s immutable event evidence.';

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

  if not v_conflicted and v_trusted_start_count = 1 then
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

create or replace function public.project_plus_membership_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_selected public.plus_membership_stream_summary;
begin
  select * into v_selected
  from public.plus_membership_stream_summary
  where user_id = p_user_id and qualified and not conflicted
  order by start_occurred_at desc, start_event_id desc
  limit 1;

  if not found then
    delete from public.plus_membership_state where user_id = p_user_id;
    delete from public.plus_membership_access where user_id = p_user_id;
    return;
  end if;

  insert into public.plus_membership_state (
    user_id, plan_code, membership_status, period_start, period_end,
    source_system, source_customer_id, source_subscription_id,
    cancel_at_period_end, last_event_occurred_at, last_event_id,
    succession_barrier_occurred_at, succession_barrier_event_id,
    applied_event_occurred_at, applied_event_id, updated_at
  ) values (
    p_user_id, v_selected.plan_code, v_selected.membership_status,
    v_selected.period_start, v_selected.period_end,
    v_selected.source_system, v_selected.source_customer_id,
    v_selected.source_subscription_id, v_selected.cancel_at_period_end,
    v_selected.last_event_occurred_at, v_selected.last_event_id,
    null, null, v_selected.applied_event_occurred_at,
    v_selected.applied_event_id, now()
  ) on conflict (user_id) do update set
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
    succession_barrier_occurred_at = null,
    succession_barrier_event_id = null,
    applied_event_occurred_at = excluded.applied_event_occurred_at,
    applied_event_id = excluded.applied_event_id,
    updated_at = excluded.updated_at;

  insert into public.plus_membership_access as access_row (
    user_id, membership_status, current_period_start, current_period_end
  ) values (
    p_user_id, v_selected.membership_status,
    v_selected.current_period_start, v_selected.access_period_end
  ) on conflict (user_id) do update set
    membership_status = excluded.membership_status,
    current_period_start = v_selected.current_period_start,
    current_period_end = v_selected.access_period_end,
    updated_at = now();
end;
$$;

revoke all on function public.project_plus_membership_user(uuid)
  from public, anon, authenticated, service_role;

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
  v_user_id uuid;
  v_event_id text;
  v_status text;
  v_plan_active boolean;
  v_event public.plus_membership_event;
  v_existing public.plus_membership_event;
  v_subscription public.plus_membership_subscription;
  v_start_count integer;
  v_before_state public.plus_membership_state;
  v_after_state public.plus_membership_state;
  v_before_access public.plus_membership_access;
  v_after_access public.plus_membership_access;
  v_projection_changed boolean;
begin
  if p_source_system is null or length(trim(p_source_system)) = 0
     or p_source_customer_id is null or length(trim(p_source_customer_id)) = 0
     or p_source_subscription_id is null or length(trim(p_source_subscription_id)) = 0
     or p_source_event_id is null or length(trim(p_source_event_id)) = 0
     or p_user_id is null or p_plan_code is null
     or p_occurred_at is null or p_period_start is null or p_period_end is null then
    raise exception 'membership source identity, period, and claimed user are required';
  end if;
  if p_period_end <= p_period_start then
    raise exception 'membership period must end after it starts';
  end if;

  v_status := case p_event_type
    when 'membership_pending' then 'pending'
    when 'membership_started' then 'active'
    when 'membership_renewed' then 'active'
    when 'membership_reactivated' then 'active'
    when 'membership_payment_failed' then 'past_due'
    when 'membership_canceled' then case when coalesce(p_cancel_at_period_end, false) then 'active' else 'canceled' end
    when 'membership_expired' then 'expired'
    when 'membership_revoked' then 'revoked'
    when 'membership_refunded' then 'revoked'
    when 'membership_reversed' then 'revoked'
    when 'membership_disputed' then 'revoked'
    when 'membership_restored' then 'active'
    else null
  end;
  if v_status is null then
    raise exception 'unsupported membership event type %', p_event_type;
  end if;

  -- Preserve the established global lock order: user, then source stream.
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
    v_user_id := v_subscription.user_id;
  else
    insert into public.plus_membership_subscription (
      source_system, source_customer_id, source_subscription_id, user_id
    ) values (
      p_source_system, p_source_customer_id, p_source_subscription_id, p_user_id
    ) returning * into v_subscription;
    v_user_id := v_subscription.user_id;
  end if;

  select * into v_before_state from public.plus_membership_state where user_id = v_user_id;
  select * into v_before_access from public.plus_membership_access where user_id = v_user_id;

  select active into v_plan_active
  from public.plus_membership_plan
  where plan_code = p_plan_code for share;
  if not found then
    raise exception 'unknown membership plan %', p_plan_code;
  end if;

  v_event_id := length(v_user_id::text)::text || ':' || v_user_id::text
    || ':' || length(p_source_system)::text || ':' || p_source_system
    || ':' || length(p_source_customer_id)::text || ':' || p_source_customer_id
    || ':' || length(p_source_subscription_id)::text || ':' || p_source_subscription_id
    || ':' || length(p_source_event_id)::text || ':' || p_source_event_id;

  insert into public.plus_membership_event (
    event_id, source_system, source_customer_id, source_subscription_id,
    source_event_id, user_id, plan_code, event_type,
    occurred_at, period_start, period_end, membership_status,
    cancel_at_period_end, metadata, plan_active_when_observed,
    activation_eligible_when_observed, reducer_version
  ) values (
    v_event_id, p_source_system, p_source_customer_id, p_source_subscription_id,
    p_source_event_id, v_user_id, p_plan_code, p_event_type,
    p_occurred_at, p_period_start, p_period_end, v_status,
    coalesce(p_cancel_at_period_end, false), coalesce(p_metadata, '{}'::jsonb),
    v_plan_active,
    p_event_type in ('membership_started', 'membership_renewed',
                     'membership_reactivated', 'membership_restored') and v_plan_active,
    1
  ) on conflict (source_system, source_event_id) do nothing
  returning * into v_event;

  if not found then
    select * into v_existing from public.plus_membership_event
    where source_system = p_source_system and source_event_id = p_source_event_id;
    if v_existing.user_id <> v_user_id
       or v_existing.source_customer_id <> p_source_customer_id
       or v_existing.source_subscription_id <> p_source_subscription_id then
      raise exception 'membership source event identity conflict for %/%', p_source_system, p_source_event_id;
    end if;
    if v_existing.event_type <> p_event_type
       or v_existing.plan_code <> p_plan_code
       or v_existing.occurred_at <> p_occurred_at
       or v_existing.period_start <> p_period_start
       or v_existing.period_end <> p_period_end
       or v_existing.cancel_at_period_end <> coalesce(p_cancel_at_period_end, false) then
      raise exception 'membership source event facts conflict for %/%', p_source_system, p_source_event_id;
    end if;
    return 'replayed';
  end if;

  perform public.recompute_plus_membership_stream(
    p_source_system, p_source_customer_id, p_source_subscription_id
  );
  perform public.project_plus_membership_user(v_user_id);

  if p_event_type = 'membership_started' and v_plan_active is true then
    select count(*) into v_start_count
    from public.plus_membership_event
    where source_system = p_source_system
      and source_customer_id = p_source_customer_id
      and source_subscription_id = p_source_subscription_id
      and event_type = 'membership_started'
      and plan_active_when_observed is true
      and reducer_version = 1;
    if v_start_count > 1 then
      return 'conflict';
    end if;
  end if;

  select * into v_after_state from public.plus_membership_state where user_id = v_user_id;
  select * into v_after_access from public.plus_membership_access where user_id = v_user_id;
  v_projection_changed :=
    (v_before_state.user_id is null) is distinct from (v_after_state.user_id is null)
    or row(v_before_state.plan_code, v_before_state.membership_status,
           v_before_state.period_start, v_before_state.period_end,
           v_before_state.source_system, v_before_state.source_customer_id,
           v_before_state.source_subscription_id, v_before_state.cancel_at_period_end,
           v_before_state.applied_event_occurred_at, v_before_state.applied_event_id)
       is distinct from
       row(v_after_state.plan_code, v_after_state.membership_status,
           v_after_state.period_start, v_after_state.period_end,
           v_after_state.source_system, v_after_state.source_customer_id,
           v_after_state.source_subscription_id, v_after_state.cancel_at_period_end,
           v_after_state.applied_event_occurred_at, v_after_state.applied_event_id)
    or (v_before_access.user_id is null) is distinct from (v_after_access.user_id is null)
    or row(v_before_access.membership_status, v_before_access.current_period_start,
           v_before_access.current_period_end)
       is distinct from
       row(v_after_access.membership_status, v_after_access.current_period_start,
           v_after_access.current_period_end);
  return case when v_projection_changed then 'applied' else 'stale' end;
end;
$$;

revoke all on function public.record_plus_membership_event(
  text, text, text, text, uuid, text, text, timestamptz, timestamptz, timestamptz, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.record_plus_membership_event(
  text, text, text, text, uuid, text, text, timestamptz, timestamptz, timestamptz, boolean, jsonb
) to service_role;
