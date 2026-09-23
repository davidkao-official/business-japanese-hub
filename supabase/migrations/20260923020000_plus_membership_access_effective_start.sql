-- #165 effective access interval: retain start only for overlapping active coverage
-- on the same selected stream. Unknown legacy starts remain NULL and deny access.
alter table public.plus_membership_access
  add column current_period_start timestamptz;

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
  v_plan_active_when_observed boolean;
  v_activation_eligible_when_observed boolean;
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
  v_stream_became_current boolean := false;
  v_confirming_pending boolean := false;
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
  v_buffered_activation_eligible_when_observed boolean;
  v_fold_terminal_seen boolean := false;
  v_buffered_terminal boolean;
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

  -- Binding identity and admission are separate: terminal evidence remains
  -- recordable on any bound stream; active evidence still needs the exact-plan
  -- receipt eligibility checked below.

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
  -- Capture trusted receipt-time catalog evidence, serialized with catalog
  -- edits. Replays keep their stored evidence; caller metadata is never proof.
  select active into v_plan_active_when_observed
  from public.plus_membership_plan where plan_code = p_plan_code for share;
  v_activation_eligible_when_observed := p_event_type in (
    'membership_started', 'membership_renewed',
    'membership_reactivated', 'membership_restored'
  ) and (
    v_plan_active_when_observed is true
    or (v_subscription.admitted_at is not null
        and v_subscription.admitted_plan_code = p_plan_code)
    or (v_subscription.admitted_at is null and exists (
      select 1 from public.plus_membership_event eligible
      where eligible.source_system = p_source_system
        and eligible.source_customer_id = p_source_customer_id
        and eligible.source_subscription_id = p_source_subscription_id
        and eligible.plan_code = p_plan_code
        and eligible.activation_eligible_when_observed is true
        and (eligible.occurred_at, eligible.event_id) < (p_occurred_at, v_event_id)
    ))
  );
  if p_event_type = 'membership_started'
     and v_subscription.initial_start_event_id is not null
     and v_subscription.initial_start_event_id <> v_event_id then
    raise exception 'conflicting initial membership start for source subscription';
  end if;

  insert into public.plus_membership_event (
    event_id, source_system, source_customer_id, source_subscription_id,
    source_event_id, user_id, plan_code, event_type,
    occurred_at, period_start, period_end, membership_status,
    cancel_at_period_end, metadata, plan_active_when_observed,
    activation_eligible_when_observed
  ) values (
    v_event_id, p_source_system, p_source_customer_id, p_source_subscription_id,
    p_source_event_id, v_subscription.user_id, p_plan_code, p_event_type,
    p_occurred_at, p_period_start, p_period_end, v_membership_status,
    p_cancel_at_period_end, coalesce(p_metadata, '{}'::jsonb), v_plan_active_when_observed,
    v_activation_eligible_when_observed
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

  if p_event_type = 'membership_started'
     and v_subscription.initial_start_event_id is null then
    update public.plus_membership_subscription
    set initial_start_occurred_at = v_event.occurred_at,
        initial_start_event_id = v_event.event_id
    where source_system = v_subscription.source_system
      and source_customer_id = v_subscription.source_customer_id
      and source_subscription_id = v_subscription.source_subscription_id
    returning * into v_subscription;
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
    -- Once an admitted stream is no longer current, replacement is final even
    -- if an earlier own cancellation remains its recorded retirement reason.
    -- The pre-terminal exception below is for delayed first admission/current
    -- historical evidence; it must never resurrect a superseded paid stream.
    if v_subscription.admitted_at is not null
       and (v_state.user_id is null
         or (v_state.source_system, v_state.source_customer_id, v_state.source_subscription_id)
            is distinct from (p_source_system, p_source_customer_id, p_source_subscription_id)) then
      return 'stale';
    end if;

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

  -- Cancellation is not payment confirmation. Its immutable normalized event
  -- remains active-before-cutoff evidence, but an unadmitted exact plan has no
  -- paid access to retain. Keep that projection pending until a valid start is
  -- admitted; the durable cutoff still constrains any later confirmation.
  if v_period_end_terminal and (
    v_subscription.admitted_at is null
    or v_subscription.admitted_plan_code is distinct from p_plan_code
  ) then
    v_membership_status := 'pending';
  end if;

  -- Trusted receipt eligibility gates activation not durably admitted yet. A
  -- binding created by an unconfirmed pending event is not an admitted stream,
  -- so a later start/renewal on it is still gated; a stream whose activation
  -- actually applied with eligible receipt evidence keeps accepting renewal,
  -- reactivation, period-end cancellation and terminal evidence even after the
  -- plan is deactivated, so a plan change can never roll back its durable
  -- terminal authority. Immediate cancellation cannot create active access,
  -- while an unadmitted period-end cancellation was mapped to pending above
  -- and may record its cutoff without minting access on an inactive plan.
  if v_membership_status = 'active'
     and (p_event_type <> 'membership_canceled' or v_period_end_terminal)
     and (
       v_subscription.admitted_at is null
       or v_subscription.admitted_plan_code is distinct from p_plan_code
     )
     and v_event.activation_eligible_when_observed is not true then
    raise exception 'plan % is not active for membership activation', p_plan_code;
  end if;

  -- Follow-up evidence cannot establish first admission. Retain its facts for
  -- a later valid start, but keep an unconfirmed stream pending and fail closed.
  if v_subscription.admitted_at is null and p_event_type in (
    'membership_renewed', 'membership_reactivated', 'membership_restored',
    'membership_payment_failed'
  ) then
    v_membership_status := 'pending';
  end if;

  if v_boundary_reached and p_event_type in (
    'membership_started', 'membership_renewed', 'membership_reactivated',
    'membership_restored', 'membership_pending'
  ) then
    return 'stale';
  end if;

  if p_event_type = 'membership_started'
     and v_subscription.predecessor_barrier_occurred_at is not null
     and (v_event.occurred_at, v_event.event_id) <= (
       v_subscription.predecessor_barrier_occurred_at,
       v_subscription.predecessor_barrier_event_id
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
        v_confirming_pending := p_event_type = 'membership_started';
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
      if (v_event.occurred_at, v_event.event_id) <= (v_state.applied_event_occurred_at, v_state.applied_event_id)
         and not (p_event_type = 'membership_started'
                  and v_state.membership_status = 'pending') then
        if v_terminal then
          insert into public.plus_membership_access as access_row (
            user_id, membership_status, current_period_start, current_period_end
          ) values (
            v_subscription.user_id,
            v_membership_status,
            greatest(v_event.occurred_at, v_event.period_start),
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
        -- A cancellation for an unadmitted changed plan cannot replace the
        -- admitted plan, but its stream-wide cutoff still bounds existing
        -- access, including when the cancellation is newer than the watermark.
        if v_period_end_terminal then
          update public.plus_membership_access
          set current_period_end = least(current_period_end, v_subscription.terminal_at),
              updated_at = now()
          where user_id = v_subscription.user_id;
        end if;
        -- Pending is observed evidence only. Keep its monotonic audit marker
        -- separate from the applied key, so intervening authoritative lifecycle
        -- evidence remains eligible regardless of pending delivery order.
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

      -- A future scheduled cancellation received while noncurrent may have
      -- retired this binding before its delayed first start was admitted. Once
      -- it is current, that future cutoff has not ended it:
      -- use live applied ordering until the cutoff is effective. Keep the audit
      -- retirement row intact and never ignore immediate terminal authority.
      if v_current_stream_retired
         and v_state.membership_status in ('pending', 'active', 'past_due')
         and v_current_stream_terminal_at > greatest(now(), v_event.occurred_at)
         and exists (
           select 1 from public.plus_membership_subscription current_stream
           where current_stream.source_system = v_state.source_system
             and current_stream.source_customer_id = v_state.source_customer_id
             and current_stream.source_subscription_id = v_state.source_subscription_id
             and current_stream.retired_event_id = current_stream.terminal_event_id
         )
         and not exists (
           select 1 from public.plus_membership_event immediate_terminal
           where immediate_terminal.source_system = v_state.source_system
             and immediate_terminal.source_customer_id = v_state.source_customer_id
             and immediate_terminal.source_subscription_id = v_state.source_subscription_id
             and (immediate_terminal.event_type in (
               'membership_expired', 'membership_revoked', 'membership_refunded',
               'membership_reversed', 'membership_disputed'
             ) or (immediate_terminal.event_type = 'membership_canceled'
                   and not immediate_terminal.cancel_at_period_end))
         ) then
        v_current_stream_retired := false;
      end if;

      -- A durable scheduled cutoff that wall-clock time has already reached
      -- ends the current stream even when no later event has retired its
      -- binding yet. Retire the current state stream binding here, before the
      -- successor comparison, so the barrier below is the scheduled terminal
      -- authority instead of the reducer clock: a successor whose occurred_at
      -- fell before the elapsed cutoff must stay stale no matter when it is
      -- delivered, while a successor strictly after the cutoff still applies.
      if v_current_stream_terminal_at is not null
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
        set membership_status = case
              when membership_status in ('pending', 'active', 'past_due') then 'expired'
              else membership_status
            end,
            current_period_end = least(current_period_end, v_current_stream_terminal_at),
            updated_at = now()
        where user_id = v_state.user_id;
        v_current_stream_retired := true;
      end if;

      -- Cross-stream selection is based on the selected stream's canonical
      -- initial start, never its applied/observed event clock or terminal time.
      -- Terminal evidence retires/clamps only its own source stream.
      select current_stream.initial_start_occurred_at,
             current_stream.initial_start_event_id
      into v_ordering_barrier_occurred_at, v_ordering_barrier_event_id
      from public.plus_membership_subscription current_stream
      where current_stream.source_system = v_state.source_system
        and current_stream.source_customer_id = v_state.source_customer_id
        and current_stream.source_subscription_id = v_state.source_subscription_id;
      if v_state.membership_status = 'pending'
         and p_event_type = 'membership_started' then
        -- A provisional stream inherits predecessor selection authority; its
        -- own pending and terminal delivery times cannot create authority.
        v_ordering_barrier_occurred_at := v_state.succession_barrier_occurred_at;
        v_ordering_barrier_event_id := v_state.succession_barrier_event_id;
      elsif v_ordering_barrier_occurred_at is null then
        -- An ambiguous legacy incumbent has no provable cross-stream key.
        return 'stale';
      end if;

      -- A confirmed start on a distinct, strictly newer stream may supersede a
      -- pending current stream and restore active access; everything else on a
      -- stream that is not current stays stale.
      -- An unconfirmed pending stream may replace a terminal/retired stream,
      -- but it may never supersede a live pending current stream: that would
      -- retire the live stream's binding before its own confirmation arrives.
      -- Only a confirmed membership_started supersedes a live pending stream.
      if (v_ordering_barrier_occurred_at is not null
          and (v_event.occurred_at, v_event.event_id) <= (v_ordering_barrier_occurred_at, v_ordering_barrier_event_id))
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
        if v_subscription.predecessor_barrier_occurred_at is not null
           and (v_succession_barrier_occurred_at is null
             or (v_subscription.predecessor_barrier_occurred_at,
                 v_subscription.predecessor_barrier_event_id)
                > (v_succession_barrier_occurred_at, v_succession_barrier_event_id)) then
          v_succession_barrier_occurred_at := v_subscription.predecessor_barrier_occurred_at;
          v_succession_barrier_event_id := v_subscription.predecessor_barrier_event_id;
        end if;
        update public.plus_membership_subscription
        set predecessor_barrier_occurred_at = v_succession_barrier_occurred_at,
            predecessor_barrier_event_id = v_succession_barrier_event_id
        where source_system = v_event.source_system
          and source_customer_id = v_event.source_customer_id
          and source_subscription_id = v_event.source_subscription_id
          and (predecessor_barrier_occurred_at is null
            or (predecessor_barrier_occurred_at, predecessor_barrier_event_id)
               < (v_succession_barrier_occurred_at, v_succession_barrier_event_id));
      end if;
      -- Only an admitted stream is permanently retired by replacement. A
      -- provisional pending selection never granted access and may still
      -- confirm later, subject to its stored predecessor and current authority.
      update public.plus_membership_subscription
      set retired_at = coalesce(retired_at, now()),
          retired_event_id = coalesce(retired_event_id, v_event.event_id)
      where source_system = v_state.source_system
        and source_customer_id = v_state.source_customer_id
        and source_subscription_id = v_state.source_subscription_id
        and admitted_at is not null;
    end if;
  end if;

  insert into public.plus_membership_state (
    user_id, plan_code, membership_status, period_start, period_end,
    source_system, source_customer_id, source_subscription_id,
    cancel_at_period_end, last_event_occurred_at, last_event_id,
    succession_barrier_occurred_at, succession_barrier_event_id,
    applied_event_occurred_at, applied_event_id
  ) values (
    v_subscription.user_id, v_event.plan_code, v_membership_status,
    v_event.period_start, v_event.period_end, v_event.source_system,
    v_event.source_customer_id, v_event.source_subscription_id,
    v_event.cancel_at_period_end, v_event.occurred_at, v_event.event_id,
    v_succession_barrier_occurred_at, v_succession_barrier_event_id,
    v_event.occurred_at, v_event.event_id
  ) on conflict (user_id) do update set
    plan_code = excluded.plan_code, membership_status = excluded.membership_status,
    period_start = excluded.period_start, period_end = excluded.period_end,
    source_system = excluded.source_system, source_customer_id = excluded.source_customer_id,
    source_subscription_id = excluded.source_subscription_id,
    cancel_at_period_end = excluded.cancel_at_period_end,
    last_event_occurred_at = v_watermark_occurred_at,
    last_event_id = v_watermark_event_id,
    applied_event_occurred_at = excluded.applied_event_occurred_at,
    applied_event_id = excluded.applied_event_id,
    succession_barrier_occurred_at = v_succession_barrier_occurred_at,
    succession_barrier_event_id = v_succession_barrier_event_id,
    updated_at = now();

  insert into public.plus_membership_access as access_row (
    user_id, membership_status, current_period_start, current_period_end
  ) values (
    v_subscription.user_id,
    v_membership_status,
    greatest(p_occurred_at, p_period_start),
    case when v_subscription.terminal_at is not null
      then least(v_event.period_end, v_subscription.terminal_at)
      else v_event.period_end
    end
  )
  on conflict (user_id) do update set
    membership_status = excluded.membership_status,
    current_period_start = case
      when access_row.membership_status = 'active'
       and access_row.current_period_start is not null
       and access_row.current_period_end >= greatest(p_occurred_at, p_period_start)
       and v_membership_status = 'active'
       and v_state.membership_status = 'active'
       and (v_state.source_system, v_state.source_customer_id, v_state.source_subscription_id)
           = (v_event.source_system, v_event.source_customer_id, v_event.source_subscription_id)
        then access_row.current_period_start
      else excluded.current_period_start
    end,
    current_period_end = excluded.current_period_end, updated_at = now();

  -- A direct active start admits a stream only with trusted receipt eligibility. Once
  -- a stream is already admitted, a successfully applied active lifecycle
  -- transition to a *different* plan advances the marker to that plan; this
  -- keeps later same-plan lifecycle evidence valid after that plan closes to
  -- new sales. Renewal/reactivation/restoration can never create a marker on
  -- their own, so pending and other unadmitted bindings remain fail-closed.
  -- Do this before a buffered fold so a later authoritative start in that fold
  -- can correctly supersede this direct event's marker.
  if v_membership_status = 'active'
     and v_event.activation_eligible_when_observed is true
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

  -- Confirmation reconciles durable follow-up evidence in event order. Pending
  -- observations do not bound this fold. Process intermediate plan admissions
  -- before later cancellation, and never apply active evidence after a terminal.
  if v_stream_became_current or v_confirming_pending then
    for v_buffered_event_type, v_buffered_status, v_buffered_plan_code,
        v_buffered_period_start, v_buffered_period_end,
        v_buffered_cancel_at_period_end,
        v_buffered_occurred_at, v_buffered_event_id,
        v_buffered_activation_eligible_when_observed in
    select buffered.event_type, buffered.membership_status, buffered.plan_code,
           buffered.period_start, buffered.period_end,
           buffered.cancel_at_period_end,
           buffered.occurred_at, buffered.event_id,
           buffered.activation_eligible_when_observed
    from public.plus_membership_event buffered
    where buffered.source_system = v_event.source_system
      and buffered.source_customer_id = v_event.source_customer_id
      and buffered.source_subscription_id = v_event.source_subscription_id
      and buffered.membership_status in ('active', 'past_due', 'canceled', 'expired', 'revoked')
      and (buffered.occurred_at, buffered.event_id)
          > (v_event.occurred_at, v_event.event_id)
    order by buffered.occurred_at, buffered.event_id
    loop
      v_buffered_terminal := v_buffered_event_type in (
        'membership_expired', 'membership_revoked', 'membership_refunded',
        'membership_reversed', 'membership_disputed'
      ) or (v_buffered_event_type = 'membership_canceled'
            and not v_buffered_cancel_at_period_end);
      if v_fold_terminal_seen and not v_buffered_terminal then
        continue;
      end if;
      if v_subscription.terminal_at is not null
         and v_buffered_occurred_at >= v_subscription.terminal_at
         and v_buffered_event_type in (
           'membership_started', 'membership_renewed',
           'membership_reactivated', 'membership_restored'
         ) then
        continue;
      end if;
      -- A buffered active lifecycle event becomes authoritative only through
      -- this fold. Receipt-time proof admits a new/changed plan even after
      -- catalog closure; unknown historical proof cannot create admission.
      if v_buffered_status = 'active'
         and v_buffered_event_type in (
           'membership_started', 'membership_renewed',
           'membership_reactivated', 'membership_restored'
         )
         and (
           v_subscription.admitted_at is null
           or v_subscription.admitted_plan_code is distinct from v_buffered_plan_code
         ) then
        if v_buffered_activation_eligible_when_observed is not true then
          raise exception 'plan % is not active for membership activation', v_buffered_plan_code;
        end if;

      end if;

      if v_subscription.admitted_at is null and v_buffered_event_type in (
        'membership_renewed', 'membership_reactivated', 'membership_restored',
        'membership_payment_failed'
      ) then
        v_buffered_status := 'pending';
      end if;

      -- A buffered start can establish first admission. Buffered renewal,
      -- reactivation, and restoration may only advance a preexisting marker
      -- to a plan eligible at receipt; they never infer first admission.
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

      -- Match direct scheduled cancellation: without exact-plan admission,
      -- buffered cancellation cannot turn an unconfirmed selection into access.
      if v_buffered_event_type = 'membership_canceled'
         and v_buffered_cancel_at_period_end
         and (v_subscription.admitted_at is null
              or v_subscription.admitted_plan_code is distinct from v_buffered_plan_code) then
        if v_subscription.admitted_at is not null
           and v_membership_status in ('active', 'past_due') then
          -- Match the direct changed-plan stale path: retain the valid plan
          -- just selected, and apply only the stream-wide cutoff and marker.
          update public.plus_membership_state
          set last_event_occurred_at = greatest(last_event_occurred_at, v_buffered_occurred_at),
              last_event_id = case
                when (v_buffered_occurred_at, v_buffered_event_id)
                     > (last_event_occurred_at, last_event_id) then v_buffered_event_id
                else last_event_id
              end,
              updated_at = now()
          where user_id = v_subscription.user_id;
          update public.plus_membership_access
          set current_period_end = least(current_period_end, v_subscription.terminal_at),
              updated_at = now()
          where user_id = v_subscription.user_id;
          continue;
        end if;
        v_buffered_status := 'pending';
      end if;

      if v_buffered_terminal then
        v_fold_terminal_seen := true;
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
          applied_event_occurred_at = v_buffered_occurred_at,
          applied_event_id = v_buffered_event_id,
          last_event_occurred_at = greatest(last_event_occurred_at, v_buffered_occurred_at),
          last_event_id = case
            when (v_buffered_occurred_at, v_buffered_event_id)
                 > (last_event_occurred_at, last_event_id) then v_buffered_event_id
            else last_event_id
          end,
          updated_at = now()
      where user_id = v_subscription.user_id;

      update public.plus_membership_access as access_row
      set membership_status = v_buffered_status,
          current_period_start = case
            when access_row.membership_status = 'active'
             and access_row.current_period_start is not null
             and access_row.current_period_end >= greatest(v_buffered_occurred_at, v_buffered_period_start)
             and v_buffered_status = 'active'
              then access_row.current_period_start
            else greatest(v_buffered_occurred_at, v_buffered_period_start)
          end,
          current_period_end = case when v_subscription.terminal_at is not null
            then least(v_buffered_period_end, v_subscription.terminal_at)
            else v_buffered_period_end
          end,
          updated_at = now()
      where user_id = v_subscription.user_id;
      v_membership_status := v_buffered_status;
    end loop;
  end if;

  return 'applied';
end;
$$;
