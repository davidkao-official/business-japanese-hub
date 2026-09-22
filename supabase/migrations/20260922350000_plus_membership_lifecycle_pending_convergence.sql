-- #164 / #165: append-only admission refresh and pending convergence repair.
-- Preserve the established schema, durable source binding, terminal authority,
-- server-only writer and #139 projection. Do not replay migration backfills.
-- Direct admission refreshes its locked row before buffered plan transitions.
-- Same-stream confirmation outranks pending while respecting any predecessor
-- barrier; both delivery orders retain the maximum observed event watermark.

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
  v_binding_preexisting boolean := false;
  v_stream_became_current boolean := false;
  v_retired_own_terminal_at timestamptz;
  v_retired_own_terminal_event_id text;
  v_earliest_terminal_event_id text;
  v_buffered_occurred_at timestamptz;
  v_buffered_event_id text;
  v_buffered_event_type text;
  v_buffered_status text;
  v_buffered_plan_code text;
  v_buffered_period_start timestamptz;
  v_buffered_period_end timestamptz;
  v_buffered_cancel_at_period_end boolean;
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

  -- A source binding that already exists is an already-bound stream: later
  -- lifecycle evidence on it (renewal, reactivation, terminal/cancellation)
  -- must stay accepted even when the plan has since been marked inactive, so a
  -- plan change can never roll back that stream's durable terminal authority.
  v_binding_preexisting := found;

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
      and source_subscription_id = v_subscription.source_subscription_id
    returning * into v_subscription;
  end if;

  select * into v_subscription
  from public.plus_membership_subscription
  where source_system = p_source_system
    and source_customer_id = p_source_customer_id
    and source_subscription_id = p_source_subscription_id
  for update;

  v_boundary_reached := v_subscription.terminal_at is not null
    and (v_subscription.terminal_at <= p_occurred_at or v_subscription.terminal_at <= now());

  -- Choose terminal authority by its effective time, never by webhook
  -- delivery. Immediate terminal events take effect at occurred_at; scheduled
  -- cancellations take effect at period_end.
  select terminal_event.event_id
  into v_earliest_terminal_event_id
  from public.plus_membership_event terminal_event
  where terminal_event.source_system = v_subscription.source_system
    and terminal_event.source_customer_id = v_subscription.source_customer_id
    and terminal_event.source_subscription_id = v_subscription.source_subscription_id
    and (
      terminal_event.event_type in (
        'membership_expired', 'membership_revoked', 'membership_refunded',
        'membership_reversed', 'membership_disputed'
      )
      or terminal_event.event_type = 'membership_canceled'
    )
  order by case
      when terminal_event.event_type = 'membership_canceled'
           and terminal_event.cancel_at_period_end then terminal_event.period_end
      else terminal_event.occurred_at
    end,
    terminal_event.event_id
  limit 1;

-- Newly unadmitted successor terminal evidence retires its own binding before
-- the retired-stream exception below. Its earlier start is still considered
-- by that exception, so the start may select/fold the retired stream.
  select * into v_state
  from public.plus_membership_state
  where user_id = v_subscription.user_id
  for update;
  if v_terminal or v_boundary_reached then
    update public.plus_membership_subscription
    set retired_at = coalesce(retired_at, now()),
        retired_event_id = coalesce(
          v_earliest_terminal_event_id, retired_event_id, v_event.event_id
        )
    where source_system = v_subscription.source_system
      and source_customer_id = v_subscription.source_customer_id
      and source_subscription_id = v_subscription.source_subscription_id;
  end if;

  if v_subscription_retired then
    -- A stream retired by its own durable terminal evidence may still accept a
    -- lifecycle event that occurred strictly before that terminal. The event
    -- must still beat the current stream's ordering barrier below,
    -- so a superseded/replaced stream, an event at or after its own terminal,
    -- and an old terminal that must not mutate an unrelated current stream all
    -- keep returning stale.
    select terminal_event.occurred_at, terminal_event.event_id
    into v_retired_own_terminal_at, v_retired_own_terminal_event_id
    from public.plus_membership_event terminal_event
    where terminal_event.event_id = v_subscription.retired_event_id
      and terminal_event.source_system = v_subscription.source_system
      and terminal_event.source_customer_id = v_subscription.source_customer_id
      and terminal_event.source_subscription_id = v_subscription.source_subscription_id
      and (
        terminal_event.event_type in (
          'membership_expired', 'membership_revoked', 'membership_refunded',
          'membership_reversed', 'membership_disputed'
        )
        or (terminal_event.event_type = 'membership_canceled'
            and not terminal_event.cancel_at_period_end)
      );

    -- A scheduled cancellation is terminal at its effective cutoff, even
    -- though its event was observed earlier. The stored terminal event id
    -- supplies deterministic tie identity at that cutoff.
    if not found and v_subscription.terminal_at is not null
       and v_subscription.terminal_event_id is not null then
      v_retired_own_terminal_at := v_subscription.terminal_at;
      v_retired_own_terminal_event_id := v_subscription.terminal_event_id;
    end if;

    if v_retired_own_terminal_at is null
       or v_retired_own_terminal_event_id is null
       or v_terminal
       or v_period_end_terminal
       or (v_event.occurred_at, v_event.event_id)
           >= (v_retired_own_terminal_at, v_retired_own_terminal_event_id) then
      return 'stale';
    end if;
  end if;

  -- Plan availability gates an activation that is not durably admitted yet. A
  -- binding created by an unconfirmed pending event is not an admitted stream,
  -- so a later start/renewal on it is still gated; a stream whose activation
  -- actually applied while the plan was active keeps accepting renewal,
  -- reactivation, period-end cancellation and terminal evidence even after the
  -- plan is deactivated, so a plan change can never roll back its durable
  -- terminal authority. Immediate cancellation cannot create active access,
  -- but period-end cancellation projects active before its cutoff and remains
  -- gated until the exact plan was durably admitted.
  if v_membership_status = 'active'
     and (p_event_type <> 'membership_canceled' or v_period_end_terminal)
     and (
       v_subscription.admitted_at is null
       or v_subscription.admitted_plan_code is distinct from p_plan_code
     )
     and not exists (
       select 1 from public.plus_membership_plan
       where plan_code = p_plan_code and active
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
  -- outranking later pending evidence, or a confirmed successor displacing an
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
      -- Confirmation outranks uncertainty on this same stream regardless of
      -- event timestamp. A pending successor still carries its predecessor's
      -- terminal barrier: a confirmation at/before that authority cannot use
      -- semantic precedence to bypass the no-resurrection boundary.
      if v_state.membership_status = 'pending' then
        if p_event_type = 'membership_started'
           and v_state.succession_barrier_occurred_at is not null
           and (v_event.occurred_at, v_event.event_id)
               <= (v_state.succession_barrier_occurred_at, v_state.succession_barrier_event_id) then
          return 'stale';
        end if;
        -- Further pending evidence must preserve the barrier until an actual
        -- confirmation replaces uncertainty; its own watermark is not a new
        -- predecessor authority.
        if v_membership_status = 'pending' then
          v_succession_barrier_occurred_at := v_state.succession_barrier_occurred_at;
          v_succession_barrier_event_id := v_state.succession_barrier_event_id;
        end if;
      end if;
      if (v_event.occurred_at, v_event.event_id) <= (v_state.last_event_occurred_at, v_state.last_event_id)
         and not (p_event_type = 'membership_started'
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
        -- Pending delivered after confirmation is status-stale, but its key
        -- still advances the monotonic watermark. This matches pending-first
        -- delivery followed by an older accepted confirmation: intervening
        -- evidence stays stale in both orders without changing paid access.
        if v_membership_status = 'pending'
           and v_state.membership_status in ('active', 'past_due')
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
            retired_event_id = coalesce(
              v_earliest_terminal_event_id, retired_event_id, v_event.event_id
            )
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
      -- This accepted event replaces the current stream below, so durable
      -- evidence already recorded for the incoming stream must be reconciled
      -- before the call returns.
      v_stream_became_current := true;
      -- The reducing stream changes here, so the ordering clock follows the
      -- accepted stream's own key. The replaced stream's clock may still point
      -- at a later renewal that arrived before its own terminal (for example A
      -- renewed at t20, then A's t10 terminal was recorded stale for the
      -- reducer); retaining it would order this accepted successor's own later
      -- events (for example C's payment failure at t15 after C's start at t10)
      -- against that stale clock and reject them as stale. This also covers a
      -- confirmed start that displaces a live pending stream through the stored
      -- succession barrier. The same-stream stale-pending advancement above is
      -- intentionally unaffected.
      v_watermark_occurred_at := v_event.occurred_at;
      v_watermark_event_id := v_event.event_id;
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

  -- A direct active start admits a stream only while its plan is active. Once
  -- a stream is already admitted, a successfully applied active lifecycle
  -- transition to a *different* plan advances the marker to that plan; this
  -- keeps later same-plan lifecycle evidence valid after that plan closes to
  -- new sales. Renewal/reactivation/restoration can never create a marker on
  -- their own, so pending and other unadmitted bindings remain fail-closed.
  -- Do this before a buffered fold so a later authoritative start in that fold
  -- can correctly supersede this direct event's marker.
  if v_membership_status = 'active'
     and exists (
       select 1 from public.plus_membership_plan
       where plan_code = p_plan_code and active
     )
     and (
       p_event_type = 'membership_started'
       or (
         v_subscription.admitted_at is not null
         and v_subscription.admitted_plan_code is distinct from p_plan_code
         and p_event_type in (
           'membership_renewed', 'membership_reactivated', 'membership_restored'
         )
       )
     ) then
    update public.plus_membership_subscription
    set admitted_at = case
          when admitted_at is null
               or admitted_plan_code is distinct from p_plan_code
            then v_event.occurred_at
          else admitted_at
        end,
        admitted_plan_code = case
          when admitted_plan_code is null
               or admitted_plan_code is distinct from p_plan_code
            then p_plan_code
          else admitted_plan_code
        end
    where source_system = v_subscription.source_system
      and source_customer_id = v_subscription.source_customer_id
      and source_subscription_id = v_subscription.source_subscription_id
    returning * into v_subscription;
  end if;

  -- A distinct stream that just became current may already hold durable
  -- evidence that arrived before its own confirmation and was rejected as
  -- stale while another stream was current (for example a payment failure or a
  -- terminal recorded before the confirming start). That evidence has been
  -- durable since it arrived and can never apply through a replay, so the
  -- current state must adopt the reduction of it here: otherwise forward
  -- delivery (evidence before start) stays active while reverse delivery (start
  -- before evidence) ends past_due or terminated. An unconfirmed pending is
  -- outranked by the applied confirmation and is deliberately not folded. The
  -- fold is bounded by the accepted event key (the reset watermark) and the
  -- applied event key, so it can never rewind ordering or resurrect a retired
  -- stream; terminal evidence folded here retires its own binding and revokes
  -- the projection instead of promoting access.
  if v_stream_became_current then
    select buffered.event_type, buffered.membership_status, buffered.plan_code,
           buffered.period_start, buffered.period_end,
           buffered.cancel_at_period_end,
           buffered.occurred_at, buffered.event_id
    into v_buffered_event_type, v_buffered_status, v_buffered_plan_code,
         v_buffered_period_start, v_buffered_period_end,
         v_buffered_cancel_at_period_end,
         v_buffered_occurred_at, v_buffered_event_id
    from public.plus_membership_event buffered
    where buffered.source_system = v_event.source_system
      and buffered.source_customer_id = v_event.source_customer_id
      and buffered.source_subscription_id = v_event.source_subscription_id
      and buffered.membership_status in ('active', 'past_due', 'canceled', 'expired', 'revoked')
      and (buffered.occurred_at, buffered.event_id)
          > (v_event.occurred_at, v_event.event_id)
      and (buffered.occurred_at, buffered.event_id)
          > (v_watermark_occurred_at, v_watermark_event_id)
    order by (
      buffered.event_type in (
        'membership_expired', 'membership_revoked', 'membership_refunded',
        'membership_reversed', 'membership_disputed'
      )
      or (buffered.event_type = 'membership_canceled'
          and not buffered.cancel_at_period_end)
    ) desc,
      buffered.occurred_at desc, buffered.event_id desc
    limit 1;

    if found then
      -- A buffered active lifecycle event becomes authoritative only through
      -- this fold. Match the direct active-plan gate: a new or changed plan
      -- must still be live, while an already admitted same-plan stream may
      -- continue after catalog closure.
      if v_buffered_status = 'active'
         and v_buffered_event_type in (
           'membership_started', 'membership_renewed',
           'membership_reactivated', 'membership_restored'
         )
         and (
           v_subscription.admitted_at is null
           or v_subscription.admitted_plan_code is distinct from v_buffered_plan_code
         ) then
        if not exists (
          select 1 from public.plus_membership_plan
          where plan_code = v_buffered_plan_code and active
        ) then
          raise exception 'plan % is not active for membership activation', v_buffered_plan_code;
        end if;

      end if;

      -- A buffered start can establish first admission. Buffered renewal,
      -- reactivation, and restoration may only advance a preexisting marker
      -- to a different live plan; they must never infer first admission.
      if v_buffered_status = 'active'
         and (
           v_buffered_event_type = 'membership_started'
           or (
             v_subscription.admitted_at is not null
             and v_subscription.admitted_plan_code is distinct from v_buffered_plan_code
             and v_buffered_event_type in (
               'membership_renewed', 'membership_reactivated', 'membership_restored'
             )
           )
         ) then
        update public.plus_membership_subscription
        set admitted_at = case
              when admitted_at is null
                   or admitted_plan_code is distinct from v_buffered_plan_code
                then v_buffered_occurred_at
              else admitted_at
            end,
            admitted_plan_code = case
              when admitted_plan_code is null
                   or admitted_plan_code is distinct from v_buffered_plan_code
                then v_buffered_plan_code
              else admitted_plan_code
            end
        where source_system = v_event.source_system
          and source_customer_id = v_event.source_customer_id
          and source_subscription_id = v_event.source_subscription_id
        returning * into v_subscription;
      end if;

      if v_buffered_event_type in (
        'membership_expired', 'membership_revoked', 'membership_refunded',
        'membership_reversed', 'membership_disputed'
      ) or (v_buffered_event_type = 'membership_canceled'
            and not v_buffered_cancel_at_period_end) then
        update public.plus_membership_subscription
        set retired_at = coalesce(retired_at, now()),
            retired_event_id = coalesce(
              v_earliest_terminal_event_id, retired_event_id, v_buffered_event_id
            )
        where source_system = v_event.source_system
          and source_customer_id = v_event.source_customer_id
          and source_subscription_id = v_event.source_subscription_id;
      end if;

      update public.plus_membership_state
      set membership_status = v_buffered_status,
          plan_code = v_buffered_plan_code,
          period_start = v_buffered_period_start,
          period_end = v_buffered_period_end,
          cancel_at_period_end = v_buffered_cancel_at_period_end,
          last_event_occurred_at = v_buffered_occurred_at,
          last_event_id = v_buffered_event_id,
          updated_at = now()
      where user_id = v_subscription.user_id;

      update public.plus_membership_access
      set membership_status = v_buffered_status,
          current_period_end = case when v_subscription.terminal_at is not null
            then least(v_buffered_period_end, v_subscription.terminal_at)
            else v_buffered_period_end
          end,
          updated_at = now()
      where user_id = v_subscription.user_id;
    end if;
  end if;

  return 'applied';
end;
$$;

revoke all on function public.record_plus_membership_event(
  text, text, text, text, uuid, text, text, timestamptz, timestamptz, timestamptz, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.record_plus_membership_event(
  text, text, text, text, uuid, text, text, timestamptz, timestamptz, timestamptz, boolean, jsonb
) to service_role;
