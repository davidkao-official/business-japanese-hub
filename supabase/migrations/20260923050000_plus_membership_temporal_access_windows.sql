-- Temporal paid windows are the authorization source. Existing per-user
-- state/access rows remain materialized snapshots for consumers that need
-- lifecycle display, but cannot represent disjoint or future coverage.

create table public.plus_membership_access_window (
  window_id bigint generated always as identity primary key,
  source_system text not null,
  source_customer_id text not null,
  source_subscription_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  grant_event_id text not null references public.plus_membership_event(event_id),
  window_start timestamptz not null,
  window_end timestamptz not null,
  created_at timestamptz not null default now(),
  unique (source_system, source_customer_id, source_subscription_id, grant_event_id),
  check (window_start < window_end)
);

create index plus_membership_access_window_stream_coverage_idx
  on public.plus_membership_access_window (
    source_system, source_customer_id, source_subscription_id,
    window_start, window_end
  );

alter table public.plus_membership_access_window enable row level security;
revoke all on public.plus_membership_access_window from public, anon, authenticated, service_role;
grant select on public.plus_membership_access_window to service_role;
revoke all on sequence public.plus_membership_access_window_window_id_seq
  from public, anon, authenticated, service_role;

comment on table public.plus_membership_access_window is
  'Server-only derived half-open paid intervals rebuilt for one qualified source stream; never backfilled from legacy snapshots.';

create or replace function public.rebuild_plus_membership_access_windows_for_stream(
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
  v_summary public.plus_membership_stream_summary;
  v_start public.plus_membership_event;
  v_event public.plus_membership_event;
  v_plan_code text;
  v_status text := 'active';
  v_cutoff timestamptz;
  v_start_at timestamptz;
  v_end_at timestamptz;
begin
  delete from public.plus_membership_access_window
  where source_system = p_source_system
    and source_customer_id = p_source_customer_id
    and source_subscription_id = p_source_subscription_id;

  select * into v_summary
  from public.plus_membership_stream_summary
  where source_system = p_source_system
    and source_customer_id = p_source_customer_id
    and source_subscription_id = p_source_subscription_id;
  if not found or not v_summary.qualified or v_summary.conflicted then
    return;
  end if;

  select * into v_start
  from public.plus_membership_event
  where event_id = v_summary.start_event_id
    and reducer_version = 1
    and plan_active_when_observed is true
    and event_type = 'membership_started';
  if not found then
    return;
  end if;

  v_plan_code := v_start.plan_code;
  v_cutoff := v_summary.terminal_at;
  v_start_at := greatest(v_start.occurred_at, v_start.period_start);
  v_end_at := least(v_start.period_end, coalesce(v_cutoff, v_start.period_end));
  if v_start_at < v_end_at then
    insert into public.plus_membership_access_window (
      source_system, source_customer_id, source_subscription_id,
      user_id, grant_event_id, window_start, window_end
    ) values (
      p_source_system, p_source_customer_id, p_source_subscription_id,
      v_summary.user_id, v_start.event_id, v_start_at, v_end_at
    );
  end if;

  for v_event in
    select * from public.plus_membership_event
    where source_system = p_source_system
      and source_customer_id = p_source_customer_id
      and source_subscription_id = p_source_subscription_id
      and (occurred_at, event_id) > (v_start.occurred_at, v_start.event_id)
    order by occurred_at, event_id
  loop
    -- Match the stream reducer: pre-effective facts cannot grant coverage,
    -- but failure and its subsequent valid recovery govern future time.
    if v_event.occurred_at < v_summary.effective_start
       and v_event.event_type <> 'membership_payment_failed'
       and not (
         v_status = 'past_due'
         and v_event.event_type in (
           'membership_renewed', 'membership_reactivated', 'membership_restored'
         )
       ) then
      continue;
    end if;
    if v_cutoff is not null and v_event.occurred_at >= v_cutoff then
      continue;
    end if;

    if v_event.event_type = 'membership_pending' then
      continue;
    elsif v_event.event_type in (
      'membership_expired', 'membership_revoked', 'membership_refunded',
      'membership_reversed', 'membership_disputed'
    ) or (v_event.event_type = 'membership_canceled' and not v_event.cancel_at_period_end) then
      -- The earliest terminal is represented by the summary cutoff and will
      -- clip all intervals below. Later terminal facts do not grant coverage.
      continue;
    elsif v_event.event_type = 'membership_canceled' and v_event.cancel_at_period_end then
      -- Its scheduled period_end is the cutoff, not this receipt's occurred_at.
      continue;
    elsif v_event.event_type = 'membership_payment_failed' then
      if v_event.plan_code is distinct from v_plan_code then
        continue;
      end if;
      v_status := 'past_due';
      -- A failure removes unearned future coverage and clips any window which
      -- was already covering its event time. Earlier paid windows remain.
      delete from public.plus_membership_access_window
      where source_system = p_source_system
        and source_customer_id = p_source_customer_id
        and source_subscription_id = p_source_subscription_id
        and window_start >= v_event.occurred_at;
      update public.plus_membership_access_window
      set window_end = v_event.occurred_at
      where source_system = p_source_system
        and source_customer_id = p_source_customer_id
        and source_subscription_id = p_source_subscription_id
        and window_start < v_event.occurred_at
        and window_end > v_event.occurred_at;
    elsif v_event.event_type in (
      'membership_renewed', 'membership_reactivated', 'membership_restored'
    ) then
      if v_event.plan_code is distinct from v_plan_code
         and v_event.plan_active_when_observed is not true then
        continue;
      end if;
      v_status := 'active';
      v_plan_code := v_event.plan_code;
      v_start_at := greatest(
        v_summary.effective_start, v_event.occurred_at, v_event.period_start
      );
      v_end_at := least(v_event.period_end, coalesce(v_cutoff, v_event.period_end));
      if v_start_at < v_end_at then
        insert into public.plus_membership_access_window (
          source_system, source_customer_id, source_subscription_id,
          user_id, grant_event_id, window_start, window_end
        ) values (
          p_source_system, p_source_customer_id, p_source_subscription_id,
          v_summary.user_id, v_event.event_id, v_start_at, v_end_at
        );
      end if;
    end if;
  end loop;

  -- Enforce the first own terminal (including scheduled cancellation) on all
  -- prior grants. A scheduled terminal's cutoff is period_end in the summary.
  if v_cutoff is not null then
    delete from public.plus_membership_access_window
    where source_system = p_source_system
      and source_customer_id = p_source_customer_id
      and source_subscription_id = p_source_subscription_id
      and window_start >= v_cutoff;
    update public.plus_membership_access_window
    set window_end = v_cutoff
    where source_system = p_source_system
      and source_customer_id = p_source_customer_id
      and source_subscription_id = p_source_subscription_id
      and window_start < v_cutoff
      and window_end > v_cutoff;
  end if;
end;
$$;

revoke all on function public.rebuild_plus_membership_access_windows_for_stream(text, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.rebuild_plus_membership_access_windows_after_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.rebuild_plus_membership_access_windows_for_stream(
    new.source_system, new.source_customer_id, new.source_subscription_id
  );
  return new;
end;
$$;

revoke all on function public.rebuild_plus_membership_access_windows_after_summary()
  from public, anon, authenticated, service_role;

create trigger plus_membership_stream_summary_rebuild_access_windows
after insert or update on public.plus_membership_stream_summary
for each row execute function public.rebuild_plus_membership_access_windows_after_summary();

-- This helper permits deterministic fixed-time database tests but is not an
-- API. Only the public wrapper below is executable by the service role.
create or replace function public._resolve_plus_membership_access_at(
  p_user_id uuid,
  p_now timestamptz
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with selected as (
    select source_system, source_customer_id, source_subscription_id
    from public.plus_membership_stream_summary
    where user_id = p_user_id
      and qualified
      and not conflicted
      and effective_start <= p_now
    order by start_occurred_at desc, start_event_id desc
    limit 1
  )
  select jsonb_build_object(
    'access_status',
    case when exists (
      select 1
      from selected
      join public.plus_membership_access_window as paid_window
        using (source_system, source_customer_id, source_subscription_id)
      where paid_window.user_id = p_user_id
        and paid_window.window_start <= p_now
        and p_now < paid_window.window_end
    ) then 'active' else 'non-member' end
  );
$$;

revoke all on function public._resolve_plus_membership_access_at(uuid, timestamptz)
  from public, anon, authenticated, service_role;

create or replace function public.resolve_plus_membership_access(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_user_id is null then
    return jsonb_build_object('access_status', 'non-member');
  end if;
  return public._resolve_plus_membership_access_at(p_user_id, v_now);
end;
$$;

revoke all on function public.resolve_plus_membership_access(uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_plus_membership_access(uuid) to service_role;

comment on function public.resolve_plus_membership_access(uuid) is
  'Server-only temporal Plus access decision. Samples the database clock once, selects the latest effective qualified initial-start stream, then checks only that stream’s paid windows.';
