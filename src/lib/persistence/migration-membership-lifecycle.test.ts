import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260922100000_plus_membership_lifecycle.sql'),
  'utf8',
);
const repairSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260922120000_plus_membership_lifecycle_terminal_repair.sql'),
  'utf8',
);
const finalRepairSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260922130000_plus_membership_lifecycle_access_clamp.sql'),
  'utf8',
);
const terminalAuthoritySql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260922140000_plus_membership_lifecycle_terminal_authority.sql',
  ),
  'utf8',
);
const successorRetireSql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260922150000_plus_membership_lifecycle_successor_retire.sql',
  ),
  'utf8',
);
const successorRetireLockOrderSql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260922160000_plus_membership_lifecycle_successor_retire_lock_order.sql',
  ),
  'utf8',
);
const terminalSuccessorSelectionSql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260922170000_plus_membership_lifecycle_terminal_successor_selection.sql',
  ),
  'utf8',
);

describe('#164 membership lifecycle migration', () => {
  it('seeds the approved monthly plans without date-based repricing', () => {
    expect(sql).toContain("'plus_early_access_monthly', 'TWD', 29900, 'month', true");
    expect(sql).toContain("'plus_standard_monthly', 'TWD', 39900, 'month', false");
    expect(sql).not.toMatch(/current_date|now\(\).*39900|39900.*now\(\)/i);
  });

  it('audits every lifecycle event and constrains the event vocabulary', () => {
    expect(sql).toContain('create table public.plus_membership_event');
    for (const event of [
      'membership_started', 'membership_renewed', 'membership_payment_failed',
      'membership_canceled', 'membership_reactivated', 'membership_expired',
      'membership_revoked', 'membership_refunded', 'membership_reversed',
      'membership_disputed', 'membership_restored',
    ]) expect(sql).toContain(`'${event}'`);
    expect(sql).toContain('event_id text primary key');
    expect(sql).toContain('source_system text not null');
    expect(sql).toContain('source_customer_id text not null');
    expect(sql).toContain('source_subscription_id text not null');
    expect(sql).toContain('unique (source_system, source_event_id)');
    expect(sql).toContain('membership_status text not null');
    expect(sql).not.toContain('p_membership_status');
  });

  it('makes replay and stale ordering behavior part of the server writer', () => {
    expect(sql).toContain('on conflict (source_system, source_event_id) do nothing');
    expect(sql).toContain("return 'replayed'");
    expect(sql).toContain("return 'stale'");
    expect(sql).toContain('v_event.occurred_at, v_event.event_id');
    expect(sql).toContain('on conflict (user_id) do update');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('before looking for state');
    expect(sql).toContain("when 'membership_started' then 'active'");
    expect(sql).toContain("when 'membership_refunded' then 'revoked'");
    expect(sql).toContain("when 'membership_canceled' then case when p_cancel_at_period_end then 'active' else 'canceled' end");
    expect(sql).toContain('source_subscription_id <> v_state.source_subscription_id');
    expect(sql).toContain('membership source event identity conflict');
  });

  it('keeps all lifecycle writes server-only and projects the #139 seam', () => {
    for (const table of ['plus_membership_plan', 'plus_membership_event', 'plus_membership_state']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on public.${table} from public, anon, authenticated`);
    }
    expect(sql).toContain('insert into public.plus_membership_access');
    expect(sql).toContain('revoke insert, update, delete on public.plus_membership_access from service_role');
    expect(sql).toContain('grant select on public.plus_membership_access to service_role');
    expect(sql).toContain('grant execute on function public.record_plus_membership_event');
    expect(sql).toContain('to service_role');
    expect(sql).toContain('user_id uuid not null,');
    expect(sql).toContain('source_customer_id text not null');
    const eventTable = sql.split('create table public.plus_membership_event')[1].split('comment on table public.plus_membership_event')[0];
    expect(eventTable).not.toMatch(/references auth\.users/i);
  });

  it('does not introduce provider-specific or Book commerce identifiers', () => {
    for (const identifier of [
      'paypal', 'ecpay', 'stripe', 'newebpay',
      'orders', 'payments', 'refunds', 'book_entitlement', 'book_entitlements',
    ]) {
      expect(sql).not.toMatch(new RegExp(`\\b${identifier}\\b`, 'i'));
    }
    expect(sql).not.toMatch(/\/functions\/v1\/(?:checkout|[^\s/]*webhook)\b/i);
  });
});

describe('#164 membership lifecycle terminal repair migration', () => {
  it('adds an effective terminal cutoff without changing the #139 projection seam', () => {
    expect(repairSql).toContain('add column terminal_at timestamptz');
    expect(repairSql).toContain('add column terminal_event_id text');
    expect(repairSql).toContain("v_period_end_terminal := p_event_type = 'membership_canceled' and p_cancel_at_period_end");
    expect(repairSql).toContain('terminal_at <= p_occurred_at or v_subscription.terminal_at <= now()');
    expect(repairSql).toContain('membership_started\', \'membership_renewed\', \'membership_reactivated\'');
    expect(repairSql).toContain("'membership_restored', 'membership_pending'");
    expect(repairSql).toContain('Keep the earliest effective end');
    expect(repairSql).toContain('insert into public.plus_membership_access');
    expect(repairSql).not.toContain('drop table public.plus_membership_access');
  });

  it('retires terminal stale bindings before stale returns and preserves idempotency', () => {
    expect(repairSql).toContain('Terminal evidence retires its own binding');
    expect(repairSql).toContain('retired_at = coalesce(retired_at, now())');
    expect(repairSql).toContain('retired_event_id = coalesce(retired_event_id, v_event.event_id)');
    expect(repairSql).toContain('if v_subscription_retired then');
    expect(repairSql).toContain('on conflict (source_system, source_event_id) do nothing');
    expect(repairSql).toContain("return 'replayed'");
    expect(repairSql).toContain("return 'stale'");
    for (const event of ['membership_expired', 'membership_revoked', 'membership_refunded', 'membership_reversed', 'membership_disputed']) {
      expect(repairSql).toContain(`p_event_type in ('membership_expired', 'membership_revoked', 'membership_refunded', 'membership_reversed', 'membership_disputed')`);
      expect(repairSql).toContain(`'${event}'`);
    }
    expect(repairSql).toContain('grant execute on function public.record_plus_membership_event');
  });
});

describe('#164 membership lifecycle access clamp migration', () => {
  it('only changes the writer projection to honor terminal_at', () => {
    expect(finalRepairSql).toContain('create or replace function public.record_plus_membership_event');
    expect(finalRepairSql).toContain('least(v_event.period_end, v_subscription.terminal_at)');
    expect(finalRepairSql).toContain('if v_subscription_retired then');
    expect(finalRepairSql).toContain("return 'replayed'");
    expect(finalRepairSql).toContain("return 'stale'");
    expect(finalRepairSql).toContain('insert into public.plus_membership_access');
    expect(finalRepairSql).not.toContain('drop table public.plus_membership_access');
  });
});

describe('#164 membership lifecycle terminal authority migration', () => {
  it('enforces terminal authority for ordering-stale same-stream evidence before returning stale', () => {
    expect(terminalAuthoritySql).toContain('create or replace function public.record_plus_membership_event');
    expect(terminalAuthoritySql).toContain('on conflict (source_system, source_event_id) do nothing');
    expect(terminalAuthoritySql).toContain('insert into public.plus_membership_access as access_row');
    expect(terminalAuthoritySql).toContain('least(access_row.current_period_end, excluded.current_period_end)');
    expect(terminalAuthoritySql).toContain(
      'current_period_end = least(current_period_end, v_subscription.terminal_at)',
    );
    expect(terminalAuthoritySql).toContain('if v_terminal or v_period_end_terminal then');
    expect(terminalAuthoritySql).toContain('A replaced/noncurrent stream can only retire its own binding');
    expect(terminalAuthoritySql).toContain("return 'replayed'");
    expect(terminalAuthoritySql).toContain("return 'stale'");
    expect(terminalAuthoritySql).not.toContain('drop table public.plus_membership_access');
  });

  it('derives unambiguous audit event ids for arbitrary nonempty identifiers', () => {
    expect(terminalAuthoritySql).toContain('length(p_source_system)::text');
    expect(terminalAuthoritySql).toContain('length(p_source_customer_id)::text');
    expect(terminalAuthoritySql).toContain('length(p_source_subscription_id)::text');
    expect(terminalAuthoritySql).toContain('length(p_source_event_id)::text');
    expect(terminalAuthoritySql).not.toContain("|| p_source_system || ':' || p_source_customer_id");
  });

  it('does not introduce provider-specific or Book commerce identifiers', () => {
    for (const identifier of [
      'paypal', 'ecpay', 'stripe', 'newebpay',
      'orders', 'payments', 'refunds', 'book_entitlement', 'book_entitlements',
    ]) {
      expect(terminalAuthoritySql).not.toMatch(new RegExp(`\\b${identifier}\\b`, 'i'));
    }
    expect(terminalAuthoritySql).not.toMatch(/\/functions\/v1\/(?:checkout|[^\s/]*webhook)\b/i);
  });
});

describe('#164 membership lifecycle successor retire migration', () => {
  it('durably retires the superseded stream before a newer stream becomes current', () => {
    expect(successorRetireSql).toContain('create or replace function public.record_plus_membership_event');
    expect(successorRetireSql).toContain('retire the superseded stream when a newer start');
    expect(successorRetireSql).toContain('where source_system = v_state.source_system');
    expect(successorRetireSql).toContain('and source_customer_id = v_state.source_customer_id');
    expect(successorRetireSql).toContain('and source_subscription_id = v_state.source_subscription_id');
    expect(successorRetireSql).toContain('if v_subscription_retired then');
    expect(successorRetireSql).toContain("return 'replayed'");
    expect(successorRetireSql).toContain("return 'stale'");
  });

  it('preserves current-stream terminal authority and the noncurrent-terminal path', () => {
    expect(successorRetireSql).toContain('insert into public.plus_membership_access as access_row');
    expect(successorRetireSql).toContain('least(access_row.current_period_end, excluded.current_period_end)');
    expect(successorRetireSql).toContain('current_period_end = least(current_period_end, v_subscription.terminal_at)');
    expect(successorRetireSql).toContain('if v_terminal or v_period_end_terminal then');
    expect(successorRetireSql).toContain('A replaced/noncurrent stream can only retire its own binding');
    expect(successorRetireSql).not.toContain('drop table public.plus_membership_access');
  });

  it('does not introduce provider-specific or Book commerce identifiers', () => {
    for (const identifier of [
      'paypal', 'ecpay', 'stripe', 'newebpay',
      'orders', 'payments', 'refunds', 'book_entitlement', 'book_entitlements',
    ]) {
      expect(successorRetireSql).not.toMatch(new RegExp(`\\b${identifier}\\b`, 'i'));
    }
    expect(successorRetireSql).not.toMatch(/\/functions\/v1\/(?:checkout|[^\s/]*webhook)\b/i);
  });
});

describe('#164 membership lifecycle successor retire lock order migration', () => {
  it('acquires the per-user lock before the per-stream lock and any stream row lock', () => {
    expect(successorRetireLockOrderSql).toContain(
      'create or replace function public.record_plus_membership_event',
    );
    const userLock = successorRetireLockOrderSql.indexOf('hashtextextended(p_user_id::text, 164)');
    const streamLock = successorRetireLockOrderSql.indexOf(
      "p_source_system || ':' || p_source_customer_id || ':' || p_source_subscription_id, 164",
    );
    const firstSubscriptionLock = successorRetireLockOrderSql.indexOf(
      'from public.plus_membership_subscription',
    );
    expect(userLock).toBeGreaterThan(-1);
    expect(streamLock).toBeGreaterThan(-1);
    expect(firstSubscriptionLock).toBeGreaterThan(-1);
    expect(userLock).toBeLessThan(streamLock);
    expect(streamLock).toBeLessThan(firstSubscriptionLock);
    expect(successorRetireLockOrderSql).not.toContain(
      'hashtextextended(v_subscription.user_id::text, 164)',
    );
  });

  it('preserves successor retirement, terminal authority, and stale/replay behavior', () => {
    expect(successorRetireLockOrderSql).toContain('where source_system = v_state.source_system');
    expect(successorRetireLockOrderSql).toContain(
      'and source_customer_id = v_state.source_customer_id',
    );
    expect(successorRetireLockOrderSql).toContain(
      'and source_subscription_id = v_state.source_subscription_id',
    );
    expect(successorRetireLockOrderSql).toContain('insert into public.plus_membership_access as access_row');
    expect(successorRetireLockOrderSql).toContain(
      'least(access_row.current_period_end, excluded.current_period_end)',
    );
    expect(successorRetireLockOrderSql).toContain(
      'current_period_end = least(current_period_end, v_subscription.terminal_at)',
    );
    expect(successorRetireLockOrderSql).toContain('if v_terminal or v_period_end_terminal then');
    expect(successorRetireLockOrderSql).toContain(
      'A replaced/noncurrent stream can only retire its own binding',
    );
    expect(successorRetireLockOrderSql).toContain('if v_subscription_retired then');
    expect(successorRetireLockOrderSql).toContain("return 'replayed'");
    expect(successorRetireLockOrderSql).toContain("return 'stale'");
    expect(successorRetireLockOrderSql).not.toContain('drop table public.plus_membership_access');
  });

  it('keeps the writer server-only without provider-specific or Book commerce identifiers', () => {
    expect(successorRetireLockOrderSql).toContain(
      'revoke all on function public.record_plus_membership_event',
    );
    expect(successorRetireLockOrderSql).toContain(
      'grant execute on function public.record_plus_membership_event',
    );
    for (const identifier of [
      'paypal', 'ecpay', 'stripe', 'newebpay',
      'orders', 'payments', 'refunds', 'book_entitlement', 'book_entitlements',
    ]) {
      expect(successorRetireLockOrderSql).not.toMatch(new RegExp(`\\b${identifier}\\b`, 'i'));
    }
    expect(successorRetireLockOrderSql).not.toMatch(
      /\/functions\/v1\/(?:checkout|[^\s/]*webhook)\b/i,
    );
  });
});

describe('#164 membership lifecycle terminal successor selection migration', () => {
  it('lets a fresh start become current once the current stream is terminal', () => {
    expect(terminalSuccessorSelectionSql).toContain(
      'create or replace function public.record_plus_membership_event',
    );
    expect(terminalSuccessorSelectionSql).toContain('v_current_stream_retired boolean := false');
    expect(terminalSuccessorSelectionSql).toContain('v_current_stream_retired := exists (');
    expect(terminalSuccessorSelectionSql).toContain(
      'from public.plus_membership_subscription current_stream',
    );
    expect(terminalSuccessorSelectionSql).toContain(
      'and current_stream.retired_at is not null',
    );
    // Ordering is enforced only while the current stream is not retired.
    expect(terminalSuccessorSelectionSql).toContain(
      '(v_event.occurred_at, v_event.event_id) <= (v_state.last_event_occurred_at, v_state.last_event_id)',
    );
    expect(terminalSuccessorSelectionSql).toContain('and not v_current_stream_retired)');
    expect(terminalSuccessorSelectionSql).toContain(
      "or p_event_type not in ('membership_started', 'membership_pending') then",
    );
    // Lock order stays per-user -> per-stream -> stream rows.
    const userLock = terminalSuccessorSelectionSql.indexOf(
      'hashtextextended(p_user_id::text, 164)',
    );
    const streamLock = terminalSuccessorSelectionSql.indexOf(
      "p_source_system || ':' || p_source_customer_id || ':' || p_source_subscription_id, 164",
    );
    const firstSubscriptionLock = terminalSuccessorSelectionSql.indexOf(
      'from public.plus_membership_subscription',
    );
    expect(userLock).toBeGreaterThan(-1);
    expect(streamLock).toBeGreaterThan(-1);
    expect(firstSubscriptionLock).toBeGreaterThan(-1);
    expect(userLock).toBeLessThan(streamLock);
    expect(streamLock).toBeLessThan(firstSubscriptionLock);
    expect(terminalSuccessorSelectionSql).not.toContain(
      'hashtextextended(v_subscription.user_id::text, 164)',
    );
  });

  it('still retires the superseded stream and cannot resurrect a retired stream', () => {
    expect(terminalSuccessorSelectionSql).toContain(
      'and source_subscription_id = v_state.source_subscription_id',
    );
    expect(terminalSuccessorSelectionSql).toContain(
      'set retired_at = coalesce(retired_at, now()),',
    );
    // Retired bindings are rejected before reducer state is read, so an old
    // stream can never take authority back from the current one.
    const retiredReturn = terminalSuccessorSelectionSql.indexOf('if v_subscription_retired then');
    const stateRead = terminalSuccessorSelectionSql.indexOf(
      'select * into v_state from public.plus_membership_state',
    );
    expect(retiredReturn).toBeGreaterThan(-1);
    expect(stateRead).toBeGreaterThan(-1);
    expect(retiredReturn).toBeLessThan(stateRead);
  });

  it('fails closed only when a duplicate event id carries different lifecycle facts', () => {
    expect(terminalSuccessorSelectionSql).toContain(
      'on conflict (source_system, source_event_id) do nothing',
    );
    expect(terminalSuccessorSelectionSql).toContain('if v_event.event_type <> p_event_type');
    expect(terminalSuccessorSelectionSql).toContain('or v_event.plan_code <> p_plan_code');
    expect(terminalSuccessorSelectionSql).toContain('or v_event.occurred_at <> p_occurred_at');
    expect(terminalSuccessorSelectionSql).toContain('or v_event.period_start <> p_period_start');
    expect(terminalSuccessorSelectionSql).toContain('or v_event.period_end <> p_period_end');
    expect(terminalSuccessorSelectionSql).toContain(
      'or v_event.cancel_at_period_end <> coalesce(p_cancel_at_period_end, false) then',
    );
    expect(terminalSuccessorSelectionSql).toContain(
      "raise exception 'membership source event facts conflict for %/%'",
    );
    // The fact check runs before the replay return, so a mismatch never replays.
    const factsConflict = terminalSuccessorSelectionSql.indexOf('membership source event facts conflict');
    const replayReturn = terminalSuccessorSelectionSql.indexOf("return 'replayed'");
    expect(factsConflict).toBeGreaterThan(-1);
    expect(replayReturn).toBeGreaterThan(-1);
    expect(factsConflict).toBeLessThan(replayReturn);
    // Metadata stays outside identity: it is documented and never compared.
    expect(terminalSuccessorSelectionSql).toContain(
      'Metadata is intentionally excluded from identity',
    );
    expect(terminalSuccessorSelectionSql).not.toContain('v_event.metadata <>');
  });

  it('keeps the writer server-only without provider-specific or Book commerce identifiers', () => {
    expect(terminalSuccessorSelectionSql).toContain(
      'revoke all on function public.record_plus_membership_event',
    );
    expect(terminalSuccessorSelectionSql).toContain(
      'grant execute on function public.record_plus_membership_event',
    );
    for (const identifier of [
      'paypal', 'ecpay', 'stripe', 'newebpay',
      'orders', 'payments', 'refunds', 'book_entitlement', 'book_entitlements',
    ]) {
      expect(terminalSuccessorSelectionSql).not.toMatch(new RegExp(`\\b${identifier}\\b`, 'i'));
    }
    expect(terminalSuccessorSelectionSql).not.toMatch(
      /\/functions\/v1\/(?:checkout|[^\s/]*webhook)\b/i,
    );
  });
});
