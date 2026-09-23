-- Sidecar for #165 temporal authorization repair.
-- Immutable lifecycle events remain authoritative. This successor derives
-- server-only paid windows per source subscription and makes DB time the access
-- authority so future facts cannot erase still-valid present coverage.

create table public.plus_membership_access_window (
  source_system text not null,
  source_customer_id text not null,
  source_subscription_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null references public.plus_membership_plan(plan_code),
  grant_event_id text not null references public.plus_membership_event(event_id),
  access_start timestamptz not null,
  access_end timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (
    source_system,
    source_customer_id,
    source_subscription_id,
    grant_event_id
  ),
  check (access_end > access_start)
);

create index plus_membership_access_window_stream_time_idx
  on public.plus_membership_access_window (
    source_system,
    source_customer_id,
    source_subscription_id,
    access_start,
    access_end
  );

alter table public.plus_membership_access_window enable row level security;
revoke all on public.plus_membership_access_window from public, anon, authenticated;
grant select on public.plus_membership_access_window to service_role;

comment on table public.plus_membership_access_window is
  'Server-only derived paid intervals for one qualified membership stream. Windows are rebuilt from immutable v1 lifecycle evidence; gaps remain gaps.';

create or replace function public.rebuild_plus_membership_access_windows(
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
  v_legacy_start_exists boolean;
  v_cutoff timestamptz;
  v_current_plan_code text;
  v_grant_start timestamptz;
  v_grant_end timestamptz;
begin
  delete from public.plus_membership_access_window
  where source_system = p_source_system
    and source_customer_id = p_source_customer_id
    and source_subscription_id = p_source_subscription_id;

  select user_id into v_user_id
  from public.plus_membership_subscription
  where source_system = p_source_system
    and source_customer_id = p_source_customer_id
    and source_subscription_id = p_source_subscription_id;

  -- Direct legacy/test inserts without a durable binding have no authority.
  if v_user_id is null then
    return;
  end if;

  select
    count(*) filter (
      where event_type = 'membership_started'
        and plan_active_when_observed is true
        and reducer_version = 1
    ),
    bool_or(event_type = 'membership_started' and reducer_version is null)
  into v_trusted_start_count, v_legacy_start_exists
  from public.plus_membership_event
  where source_system = p_source_system
    and source_customer_id = p_source_customer_id
    and source_subscription_id = p_source_subscription_id;

  if v_trusted_start_count <> 1 or coalesce(v_legacy_start_exists, false) then
    return;
  end if;

  select * into v_start
  from public.plus_membership_event
  where source_system = p_source_system
    and source_customer_id = p_source_customer_id
    and source_subscription_id = p_source_subscription_id
    and event_type = 'membership_started'
    and plan_active_when_observed is true
    and reducer_version = 1;

  -- The earliest effective terminal authority clips every grant on this stream.
  select min(
    case
      when event_type = 'membership_canceled' and cancel_at_period_end
        then period_end
      else occurred_at
    end
  )
  into v_cutoff
  from public.plus_membership_event
  where source_system = p_source_system
    and source_customer_id = p_source_customer_id
    and source_subscription_id = p_source_subscription_id
    and (
      event_type in (
        'membership_expired',
        'membership_revoked',
        'membership_refunded',
        'membership_reversed',
        'membership_disputed'
      )
      or event_type = 'membership_canceled'
    );

  v_current_plan_code := v_start.plan_code;
  v_grant_start := greatest(v_start.occurred_at, v_start.period_start);
  v_grant_end := least(
    v_start.period_end,
    coalesce(v_cutoff, 'infinity'::timestamptz)
  );

  if v_grant_end > v_grant_start then
    insert into public.plus_membership_access_window (
      source_system,
      source_customer_id,
      source_subscription_id,
      user_id,
      plan_code,
      grant_event_id,
      access_start,
      access_end
    ) values (
      p_source_system,
      p_source_customer_id,
      p_source_subscription_id,
      v_user_id,
      v_start.plan_code,
      v_start.event_id,
      v_grant_start,
      v_grant_end
    );
  end if;

  for v_event in
    select *
    from public.plus_membership_event
    where source_system = p_source_system
      and source_customer_id = p_source_customer_id
      and source_subscription_id = p_source_subscription_id
      and (occurred_at, event_id) > (v_start.occurred_at, v_start.event_id)
    order by occurred_at, event_id
  loop
    if v_event.event_type = 'membership_pending' then
      continue;
    end if;

    if v_event.event_type = 'membership_payment_failed' then
      if v_event.plan_code is distinct from v_current_plan_code then
        continue;
      end if;

      -- Failure ends every already-established grant that crosses its event
      -- time. Future grants are inserted only by later valid recovery events.
      update public.plus_membership_access_window
      set access_end = v_event.occurred_at
      where source_system = p_source_system
        and source_customer_id = p_source_customer_id
        and source_subscription_id = p_source_subscription_id
        and access_start < v_event.occurred_at
        and access_end > v_event.occurred_at;

      continue;
    end if;

    if v_event.event_type in (
      'membership_renewed',
      'membership_reactivated',
      'membership_restored'
    ) then
      -- Same-plan continuation remains valid after catalog closure. A changed
      -- plan needs immutable active-at-receipt evidence.
      if v_event.plan_code is distinct from v_current_plan_code
         and v_event.plan_active_when_observed is not true then
        continue;
      end if;

      v_grant_start := greatest(v_event.occurred_at, v_event.period_start);
      v_grant_end := least(
        v_event.period_end,
        coalesce(v_cutoff, 'infinity'::timestamptz)
      );

      if v_grant_end > v_grant_start then
        insert into public.plus_membership_access_window (
          source_system,
          source_customer_id,
          source_subscription_id,
          user_id,
          plan_code,
          grant_event_id,
          access_start,
          access_end
        ) values (
          p_source_system,
          p_source_customer_id,
          p_source_subscription_id,
          v_user_id,
          v_event.plan_code,
          v_event.event_id,
          v_grant_start,
          v_grant_end
        );
      end if;

      v_current_plan_code := v_event.plan_code;
    end if;
  end loop;
end;
$$;

revoke all on function public.rebuild_plus_membership_access_windows(text, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.refresh_plus_membership_access_windows_after_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.rebuild_plus_membership_access_windows(
    new.source_system,
    new.source_customer_id,
    new.source_subscription_id
  );
  return new;
end;
$$;

revoke all on function public.refresh_plus_membership_access_windows_after_event()
  from public, anon, authenticated, service_role;

create trigger plus_membership_event_refresh_access_windows
after insert on public.plus_membership_event
for each row
execute function public.refresh_plus_membership_access_windows_after_event();

create or replace function public.resolve_plus_membership_access(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_selected public.plus_membership_stream_summary;
begin
  -- A future successor does not displace a currently effective predecessor.
  -- Once a newer qualified stream becomes effective, however, it is the only
  -- stream considered; lack of a covering window must not resurrect an older
  -- subscription.
  select * into v_selected
  from public.plus_membership_stream_summary
  where user_id = p_user_id
    and qualified
    and not conflicted
    and effective_start <= v_now
  order by start_occurred_at desc, start_event_id desc
  limit 1;

  if not found then
    return jsonb_build_object('access', 'non-member');
  end if;

  if exists (
    select 1
    from public.plus_membership_access_window window
    where window.user_id = p_user_id
      and window.source_system = v_selected.source_system
      and window.source_customer_id = v_selected.source_customer_id
      and window.source_subscription_id = v_selected.source_subscription_id
      and window.access_start <= v_now
      and v_now < window.access_end
  ) then
    return jsonb_build_object('access', 'active');
  end if;

  return jsonb_build_object('access', 'non-member');
end;
$$;

revoke all on function public.resolve_plus_membership_access(uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_plus_membership_access(uuid)
  to service_role;

comment on function public.resolve_plus_membership_access(uuid) is
  'Samples database time once, selects the newest qualified stream already effective at that time, and authorizes only through a paid window on that stream.';

