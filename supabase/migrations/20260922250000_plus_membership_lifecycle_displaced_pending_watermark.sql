-- #164 displaced-pending reducer watermark reset (append-only repair of
-- 20260922240000).
--
-- This migration keeps every invariant and repair from 20260922240000 and adds
-- one bounded fix: when a confirmed membership_started on a distinct stream
-- displaces a LIVE pending current stream through the stored succession
-- barrier, the applied reducer watermark is reset to the confirmed start event
-- key instead of retaining the displaced pending stream's higher clock.
--
-- Rationale: the displaced pending stream is durably retired, so its clock can
-- no longer order anything. Retaining it made a later event on the confirmed
-- successor (for example its membership_payment_failed) compare against a clock
-- from a stream that no longer exists and be rejected as stale purely from
-- delivery order. Ordering against the confirmed start key makes forward and
-- reverse delivery converge. The same-stream stale-pending watermark
-- advancement (P1a below) is unchanged.
--
-- This migration keeps every prior #164 invariant (provider-neutral writer, #139
-- projection untouched, no provider ingestion, server-only execution boundary,
-- per-user -> source-stream -> subscription rows -> state/access lock order,
-- replay facts fail closed, source binding retirement, retired bindings never
-- resurrect, durable elapsed period-end cutoff as terminal authority, and
-- immediate-vs-scheduled terminal authority) and repairs the three remaining
-- native threads left by 20260922220000/20260922230000.
--
-- P1a: a same-timestamp membership_pending delivered after its confirming
-- membership_started on the same stream is semantically stale (active/past_due
-- outranks unconfirmed pending) but it was still observed at that key. The
-- reducer watermark must advance to it: otherwise the reverse delivery (pending
-- recorded first) keeps the higher key while the forward delivery keeps the
-- lower key, and a later same-timestamp payment_failed ordered between the two
-- keys applies in one delivery order and is stale in the other. Access keeps the
-- confirmed active state; only the monotonic ordering watermark advances.
--
-- P1b: a live pending current stream is unconfirmed, so a confirmed
-- membership_started on a distinct stream must be ordered against the barrier
-- the pending stream itself had to beat, not the pending stream's own key.
-- Otherwise the confirmation delivered first becomes active (matching reverse
-- delivery) while the same confirmation delivered after an earlier-ordered live
-- pending stream is rejected purely from delivery order. The barrier a pending
-- stream beat is recorded in plus_membership_state.succession_barrier_* while
-- that pending stream is current, so its successor keeps the same terminal
-- authority and can never resurrect a stream the pending stream had superseded.
-- An unconfirmed pending still never retires a live pending or active stream,
-- and an applied confirmation still never rewinds the ordering watermark.
--
-- P2: when a membership_canceled(period-end) shares a p_period_end equal to the
-- stream's already recorded earliest terminal_at, the durable terminal_event_id
-- must be selected deterministically (the lexicographically least durable event
-- id) instead of by delivery order, so the barrier a successor at exactly
-- terminal_at is compared against no longer depends on which equal-cutoff
-- cancellation happened to arrive first.

alter table public.plus_membership_state
  add column if not exists succession_barrier_occurred_at timestamptz;
alter table public.plus_membership_state
  add column if not exists succession_barrier_event_id text
    references public.plus_membership_event (event_id);

comment on column public.plus_membership_state.succession_barrier_occurred_at is
  'Ordering barrier the live pending current stream had to beat; a confirmed successor is compared against it instead of the pending stream key.';
comment on column public.plus_membership_state.succession_barrier_event_id is
  'Durable event identity of the live pending stream succession barrier, for exact-tie ordering.';

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
  v_current_stream_retired boolean := false;
  v_current_stream_terminal_at timestamptz;
  v_current_stream_terminal_event_id text;
  v_current_stream_immediate_terminal_at timestamptz;
  v_current_stream_immediate_terminal_event_id text;
  v_ordering_barrier_occurred_at timestamptz;
  v_ordering_barrier_event_id text;
  v_watermark_occurred_at timestamptz;
  v_watermark_event_id text;
  v_succession_barrier_occurred_at timestamptz;
  v_succession_barrier_event_id text;
  v_displaces_live_pending boolean := false;
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
    -- A same-source event id is a replay only when every immutable normalized
    -- lifecycle fact matches. Metadata is intentionally excluded from identity
    -- (it is display-only context), so metadata-only differences still replay.
    if v_event.event_type <> p_event_type
       or v_event.plan_code <> p_plan_code
       or v_event.occurred_at <> p_occurred_at
       or v_event.period_start <> p_period_start
       or v_event.period_end <> p_period_end
       or v_event.cancel_at_period_end <> coalesce(p_cancel_at_period_end, false) then
      raise exception 'membership source event facts conflict for %/%', p_source_system, p_source_event_id;
    end if;
    return 'replayed';
  end if;

  if v_period_end_terminal then
    update public.plus_membership_subscription
    set terminal_at = least(coalesce(terminal_at, p_period_end), p_period_end),
        terminal_event_id = case
          -- An equal p_period_end must not keep whichever equal-cutoff
          -- cancellation arrived first: the least durable event id keeps the
          -- cutoff identity (and the successor barrier at exactly terminal_at)
          -- identical for either delivery order.
          when terminal_at is null
            or p_period_end < terminal_at
            or (p_period_end = terminal_at and v_event.event_id < terminal_event_id)
            then v_event.event_id
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

  -- The reducer watermark a successful apply would otherwise write is the
  -- applied event's own key. Semantic precedence (a same-stream confirmation
  -- winning an equal-timestamp tie, or a confirmed successor displacing an
  -- earlier-ordered live pending stream) can order the applied event below the
  -- recorded key, so the watermark written is the greater of the two and never
  -- rewinds.
  v_watermark_occurred_at := v_event.occurred_at;
  v_watermark_event_id := v_event.event_id;

  if found then
    if (v_state.last_event_occurred_at, v_state.last_event_id)
       > (v_watermark_occurred_at, v_watermark_event_id) then
      v_watermark_occurred_at := v_state.last_event_occurred_at;
      v_watermark_event_id := v_state.last_event_id;
    end if;
    if v_state.source_system = v_event.source_system
       and v_state.source_customer_id = v_event.source_customer_id
       and v_state.source_subscription_id = v_event.source_subscription_id then
      -- Terminal evidence for the current stream keeps terminal authority even
      -- when it is older than the reducer's ordering. The reducer state still
      -- treats the evidence as stale, but access is revoked (immediate terminal)
      -- or clamped at the durable terminal_at (delayed period-end cancellation)
      -- before the call returns.
      -- A confirmed start that shares an occurred_at with a live pending state
      -- wins the tie without consulting the source event id, so delivery order
      -- and event-id sort order cannot let an unconfirmed pending block its own
      -- confirmation. Every other equal-or-earlier event keeps the strict
      -- (occurred_at, event_id) ordering below.
      if (v_event.occurred_at, v_event.event_id) <= (v_state.last_event_occurred_at, v_state.last_event_id)
         and not (v_event.occurred_at = v_state.last_event_occurred_at
                  and p_event_type = 'membership_started'
                  and v_state.membership_status = 'pending') then
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
        -- A same-timestamp pending delivered after its confirming start is
        -- semantically stale, but it was still observed at that key. Advance the
        -- monotonic ordering watermark to it so a later same-timestamp event
        -- ordered below it stays stale no matter which of the two was delivered
        -- first. Access and status stay with the confirmed start.
        if v_membership_status = 'pending'
           and v_state.membership_status in ('active', 'past_due')
           and v_event.occurred_at = v_state.last_event_occurred_at
           and (v_event.occurred_at, v_event.event_id)
               > (v_state.last_event_occurred_at, v_state.last_event_id) then
          update public.plus_membership_state
          set last_event_occurred_at = v_event.occurred_at,
              last_event_id = v_event.event_id,
              updated_at = now()
          where user_id = v_state.user_id;
        end if;
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
      -- A stream that is already retired is no longer a live ordering barrier:
      -- its reducer clock may still point at a newer pre-terminal event, so a
      -- legitimately delivered start on a distinct non-retired stream must
      -- still be selectable. Ordering is not disabled, though: a retired
      -- current binding is ordered against the durable authority that ended it
      -- instead of the reducer clock, so a successor older than that authority
      -- stays stale no matter when it is delivered. A non-retired current
      -- stream keeps strict (occurred_at,event_id) ordering, and a retired
      -- stream can never resurrect because its own binding is rejected before
      -- this point.
      select current_stream.retired_at is not null,
             current_stream.terminal_at,
             current_stream.terminal_event_id
      into v_current_stream_retired,
           v_current_stream_terminal_at,
           v_current_stream_terminal_event_id
      from public.plus_membership_subscription current_stream
      where current_stream.source_system = v_state.source_system
        and current_stream.source_customer_id = v_state.source_customer_id
        and current_stream.source_subscription_id = v_state.source_subscription_id;

      -- A durable scheduled cutoff that wall-clock time has already reached
      -- ends the current stream even when no later event has retired its
      -- binding yet. Retire the current state stream binding here, before the
      -- successor comparison, so the barrier below is the scheduled terminal
      -- authority instead of the reducer clock: a successor whose occurred_at
      -- fell before the elapsed cutoff must stay stale no matter when it is
      -- delivered, while a successor strictly after the cutoff still applies.
      if not v_current_stream_retired
         and v_current_stream_terminal_at is not null
         and v_current_stream_terminal_at <= now() then
        update public.plus_membership_subscription
        set retired_at = coalesce(retired_at, now()),
            retired_event_id = coalesce(
              retired_event_id, v_current_stream_terminal_event_id, v_event.event_id
            )
        where source_system = v_state.source_system
          and source_customer_id = v_state.source_customer_id
          and source_subscription_id = v_state.source_subscription_id;
        -- The elapsed scheduled cutoff ends the current stream even when no
        -- separate expiry event ever arrives: clamp the projection to the
        -- durable cutoff and mark it terminally non-active so a period-end
        -- cancellation cannot keep an active horizon past its effective end.
        -- A successor ordered strictly after the cutoff still overwrites this
        -- projection when it becomes current below.
        update public.plus_membership_access
        set membership_status = 'expired',
            current_period_end = least(current_period_end, v_current_stream_terminal_at),
            updated_at = now()
        where user_id = v_state.user_id;
        v_current_stream_retired := true;
      end if;

      v_ordering_barrier_occurred_at := v_state.last_event_occurred_at;
      v_ordering_barrier_event_id := v_state.last_event_id;
      if v_current_stream_retired then
        -- The earliest immediate terminal evidence on the retired stream is the
        -- event that ended it there; a later non-terminal arrival may have
        -- triggered the durable retirement, so it is not used as the ordering
        -- barrier. A period-end cancellation is deliberately excluded: its
        -- authority is terminal_at below, not its delivery time.
        select terminal_event.occurred_at, terminal_event.event_id
        into v_current_stream_immediate_terminal_at,
             v_current_stream_immediate_terminal_event_id
        from public.plus_membership_event terminal_event
        where terminal_event.source_system = v_state.source_system
          and terminal_event.source_customer_id = v_state.source_customer_id
          and terminal_event.source_subscription_id = v_state.source_subscription_id
          and (
            terminal_event.event_type in (
              'membership_expired', 'membership_revoked', 'membership_refunded',
              'membership_reversed', 'membership_disputed'
            )
            or (terminal_event.event_type = 'membership_canceled'
                and not terminal_event.cancel_at_period_end)
          )
        order by terminal_event.occurred_at, terminal_event.event_id
        limit 1;
        if v_current_stream_terminal_at is not null
           and (v_current_stream_immediate_terminal_at is null
                or v_current_stream_terminal_at <= v_current_stream_immediate_terminal_at) then
          -- The durable scheduled terminal authority is the effective end when
          -- it is not later than the immediate terminal: terminal_at is the
          -- cutoff and terminal_event_id is its deterministic event identity for
          -- exact-tie ordering. The reducer clock is deliberately not used here,
          -- because a preexisting/out-of-order renewal may have pushed it past
          -- the scheduled cutoff.
          v_ordering_barrier_occurred_at := v_current_stream_terminal_at;
          if v_current_stream_terminal_event_id is not null then
            v_ordering_barrier_event_id := v_current_stream_terminal_event_id;
          end if;
        elsif v_current_stream_immediate_terminal_at is not null then
          -- An immediate terminal that took effect before the scheduled cutoff
          -- ends the stream earlier than terminal_at; a successor that started
          -- between the two is legitimately newer and must not be rejected
          -- against the later scheduled terminal_at.
          v_ordering_barrier_occurred_at := v_current_stream_immediate_terminal_at;
          v_ordering_barrier_event_id := v_current_stream_immediate_terminal_event_id;
        end if;
      elsif v_state.membership_status = 'pending'
            and p_event_type = 'membership_started'
            and v_state.succession_barrier_occurred_at is not null then
        -- A live pending current stream is unconfirmed, so a confirmed start on
        -- a distinct stream is ordered against the barrier that pending stream
        -- itself had to beat -- not the pending stream's own recorded key.
        -- Otherwise a later-delivered confirmation that is legitimately newer
        -- than the terminal authority the pending stream superseded would be
        -- rejected purely from delivery order, contradicting the reverse
        -- delivery where the same confirmation becomes active first. Ordering
        -- against the stored barrier preserves no-resurrection: a confirmation
        -- at or below the terminal the pending stream superseded stays stale.
        v_ordering_barrier_occurred_at := v_state.succession_barrier_occurred_at;
        v_ordering_barrier_event_id := v_state.succession_barrier_event_id;
        v_displaces_live_pending := true;
      end if;

      -- A confirmed start on a distinct, strictly newer stream may supersede a
      -- pending current stream and restore active access; everything else on a
      -- stream that is not current stays stale.
      -- An unconfirmed pending stream may replace a terminal/retired stream,
      -- but it may never supersede a live pending current stream: that would
      -- retire the live stream's binding before its own confirmation arrives.
      -- Only a confirmed membership_started supersedes a live pending stream.
      if (v_event.occurred_at, v_event.event_id) <= (v_ordering_barrier_occurred_at, v_ordering_barrier_event_id)
         or (v_state.membership_status in ('active', 'past_due') and v_membership_status = 'pending')
         or (v_membership_status = 'pending'
             and v_state.membership_status = 'pending'
             and not v_current_stream_retired)
         or p_event_type not in ('membership_started', 'membership_pending') then
        return 'stale';
      end if;
      -- A confirmed start that displaces a live pending stream through the
      -- stored succession barrier replaces the current stream entirely. The
      -- displaced pending stream's higher reducer clock only ordered a stream
      -- that is now durably retired; retaining it would order this confirmed
      -- successor's own later events (for example its payment failure) against a
      -- stale clock and reject them as stale. Reset the applied watermark to the
      -- confirmed start key so subsequent current-stream events order from it.
      -- The same-stream stale-pending advancement above is intentionally
      -- unaffected.
      if v_displaces_live_pending then
        v_watermark_occurred_at := v_event.occurred_at;
        v_watermark_event_id := v_event.event_id;
      end if;
      -- A live pending stream that becomes current records the ordering barrier
      -- it had to beat, so a confirmed successor is later compared against the
      -- same terminal authority regardless of delivery order. Any other applied
      -- event clears the barrier, which is only meaningful while the current
      -- stream is pending.
      v_succession_barrier_occurred_at := null;
      v_succession_barrier_event_id := null;
      if v_event.membership_status = 'pending' then
        v_succession_barrier_occurred_at := v_ordering_barrier_occurred_at;
        v_succession_barrier_event_id := v_ordering_barrier_event_id;
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
    cancel_at_period_end, last_event_occurred_at, last_event_id,
    succession_barrier_occurred_at, succession_barrier_event_id
  ) values (
    v_subscription.user_id, v_event.plan_code, v_event.membership_status,
    v_event.period_start, v_event.period_end, v_event.source_system,
    v_event.source_customer_id, v_event.source_subscription_id,
    v_event.cancel_at_period_end, v_event.occurred_at, v_event.event_id,
    v_succession_barrier_occurred_at, v_succession_barrier_event_id
  ) on conflict (user_id) do update set
    plan_code = excluded.plan_code, membership_status = excluded.membership_status,
    period_start = excluded.period_start, period_end = excluded.period_end,
    source_system = excluded.source_system, source_customer_id = excluded.source_customer_id,
    source_subscription_id = excluded.source_subscription_id,
    cancel_at_period_end = excluded.cancel_at_period_end,
    last_event_occurred_at = v_watermark_occurred_at,
    last_event_id = v_watermark_event_id,
    succession_barrier_occurred_at = v_succession_barrier_occurred_at,
    succession_barrier_event_id = v_succession_barrier_event_id,
    updated_at = now();

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
