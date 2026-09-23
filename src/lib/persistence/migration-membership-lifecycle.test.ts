import { readFileSync, readdirSync } from 'node:fs';
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
  join(
    process.cwd(),
    'supabase/migrations/20260922340000_plus_membership_lifecycle_buffered_admission_followup.sql',
  ),
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
const terminalEvidenceOrderSql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260922180000_plus_membership_lifecycle_terminal_evidence_order.sql',
  ),
  'utf8',
);
const scheduledTerminalBarrierSql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260922190000_plus_membership_lifecycle_scheduled_terminal_barrier.sql',
  ),
  'utf8',
);
const effectiveTerminalAuthoritySql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260922200000_plus_membership_lifecycle_effective_terminal_authority.sql',
  ),
  'utf8',
);
const elapsedScheduledTerminalSql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260922210000_plus_membership_lifecycle_elapsed_scheduled_terminal.sql',
  ),
  'utf8',
);
const pendingSuccessionPrecedenceSql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260922220000_plus_membership_lifecycle_pending_succession_precedence.sql',
  ),
  'utf8',
);
const pendingConfirmationWatermarkSql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260922230000_plus_membership_lifecycle_pending_confirmation_watermark.sql',
  ),
  'utf8',
);
const monotonicPendingSuccessionSql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260922240000_plus_membership_lifecycle_monotonic_pending_succession.sql',
  ),
  'utf8',
);
const displacedPendingWatermarkSql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260922250000_plus_membership_lifecycle_displaced_pending_watermark.sql',
  ),
  'utf8',
);
const bufferedStreamEvidenceSql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260922260000_plus_membership_lifecycle_buffered_stream_evidence.sql',
  ),
  'utf8',
);
const selectionAuthoritySql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260923010000_plus_membership_lifecycle_stream_selection_authority.sql',
  ),
  'utf8',
);
const accessWindowSql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260923020000_plus_membership_access_effective_start.sql',
  ),
  'utf8',
);
const reconciliationSql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260923030000_plus_membership_stream_reconciliation.sql',
  ),
  'utf8',
);
const legacyStartGuardSql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260923040000_plus_membership_legacy_start_guard.sql',
  ),
  'utf8',
);
const lifecyclePgTapFiles = readdirSync(join(process.cwd(), 'supabase/tests'))
  .filter((file) => /^plus_membership_(?:lifecycle(?:_[a-z_]+)?|access_effective_start)\.test\.sql$/.test(file))
  .sort()
  .map((file) => ({
    file,
    sql: readFileSync(join(process.cwd(), 'supabase/tests', file), 'utf8'),
  }));
const lifecyclePgTapSql = lifecyclePgTapFiles.map(({ sql }) => sql).join('\n');

function expectLifecycleTapPlans() {
  let total = 0;
  for (const { file, sql } of lifecyclePgTapFiles) {
    const declaredPlan = sql.match(/select plan\((\d+)\)/);
    const assertions = sql.match(
      /^select (?:is|ok|isnt|has_table|has_table_privilege|has_function_privilege|throws_ok|col_is_null|lives_ok|matches)\(/gm,
    );
    expect(declaredPlan, file).not.toBeNull();
    expect(assertions, file).not.toBeNull();
    expect(assertions!.length, file).toBe(Number(declaredPlan![1]));
    total += Number(declaredPlan![1]);
  }
  expect(total).toBe(1714);
}

describe('#165 membership stream selection authority migration', () => {
  it('stores one initial-start key and uses it for cross-stream selection', () => {
    expect(selectionAuthoritySql).toContain('initial_start_occurred_at timestamptz');
    expect(selectionAuthoritySql).toContain('initial_start_event_id text');
    expect(selectionAuthoritySql).toContain('conflicting initial membership start for source subscription');
    expect(selectionAuthoritySql).toContain('current_stream.initial_start_occurred_at');
    expect(selectionAuthoritySql).toContain('current_stream.initial_start_event_id');
    expect(selectionAuthoritySql).toContain('A provisional stream inherits predecessor selection authority');
    expect(selectionAuthoritySql).not.toContain('v_ordering_barrier_occurred_at := v_state.applied_event_occurred_at');
    expect(selectionAuthoritySql).not.toContain('v_ordering_barrier_occurred_at := v_current_stream_terminal_at');
    expect(selectionAuthoritySql).toContain('Terminal evidence retires/clamps only its own source stream');
  });
});

describe('#165 membership access effective-start migration', () => {
  it('persists server-derived starts without guessing legacy access windows', () => {
    expect(accessWindowSql).toContain('add column current_period_start timestamptz;');
    expect(accessWindowSql).toContain('greatest(v_event.occurred_at, v_event.period_start)');
    expect(accessWindowSql).toContain('greatest(p_occurred_at, p_period_start)');
    expect(accessWindowSql).toContain('greatest(v_buffered_occurred_at, v_buffered_period_start)');
    expect(accessWindowSql).toContain('current_period_start = case');
    expect(accessWindowSql.match(/current_period_start = case/g)).toHaveLength(2);
    expect(accessWindowSql).toContain('current_period_start, current_period_end');
    expect(accessWindowSql.slice(0, accessWindowSql.indexOf('create or replace function')))
      .not.toMatch(/\b(update|insert)\s+public\.plus_membership_access\b/i);
    expect(accessWindowSql).not.toMatch(/update public\.plus_membership_access[\s\S]*set current_period_start\s*=\s*coalesce/i);
    expect(accessWindowSql).not.toContain('update public.plus_membership_access\nset current_period_start');
  });
});

describe('#165 per-stream reconciliation successor', () => {
  it('uses append-only receipt facts and a per-stream materialized fold as projection authority', () => {
    expect(reconciliationSql).toContain('create table public.plus_membership_stream_summary');
    expect(reconciliationSql).toContain('reducer_version integer not null default 1');
    expect(reconciliationSql).toContain('add column reducer_version integer;');
    expect(reconciliationSql).toContain('and reducer_version = 1');
    expect(reconciliationSql).toContain('activation_eligible_when_observed, reducer_version');
    expect(reconciliationSql).toContain('NULL legacy events are not qualified as initial starts');
    expect(reconciliationSql).toContain('create or replace function public.recompute_plus_membership_stream');
    expect(reconciliationSql).toContain('create or replace function public.project_plus_membership_user');
    expect(reconciliationSql).toContain('plan_active_when_observed is true');
    expect(reconciliationSql).toContain('v_event.plan_active_when_observed is not true');
    expect(reconciliationSql).toContain("return 'conflict'");
    expect(reconciliationSql).toContain('v_projection_changed');
    expect(reconciliationSql).toContain('current_period_start');
    expect(reconciliationSql).toContain('access_period_end');
    expect(reconciliationSql).toContain('revoke all on function public.recompute_plus_membership_stream');
    expect(reconciliationSql).toContain('revoke all on function public.project_plus_membership_user');
    expect(reconciliationSql).toContain('grant execute on function public.record_plus_membership_event');
    expect(reconciliationSql.slice(0, reconciliationSql.indexOf('create or replace function')))
      .not.toMatch(/\b(update|insert)\s+public\.plus_membership_(?:state|access|stream_summary)\b/i);
    const writer = reconciliationSql.slice(
      reconciliationSql.indexOf('create or replace function public.record_plus_membership_event'),
    );
    expect(writer).not.toMatch(/\b(?:admitted_at|admitted_plan_code|retired_at|retired_event_id|predecessor_barrier)\b/);
    expect(writer).not.toContain('raise exception \'conflicting initial membership start');
  });

  it('adds both-order stream reconciliation pgTAP coverage and exact plan count', () => {
    for (const user of ['300', '301', '302', '303', '304', '305', '306', '307', '308', '309', '310', '311', '312', '313', '314', '315', '316', '317', '318', '319']) {
      expect(lifecyclePgTapSql).toContain(`50000000-0000-0000-0000-000000000${user}`);
    }
    expect(lifecyclePgTapSql).toContain('C start t15 outranks B t10 despite B failure t30');
    expect(lifecyclePgTapSql).toContain('C start t15 outranks B start t10');
    expect(lifecyclePgTapSql).toContain('302 terminal-only B has no selection authority');
    expect(lifecyclePgTapSql).toContain('second trusted start records conflict without rollback');
    expectLifecycleTapPlans();
  });
});

describe('#165 legacy initial-start ambiguity guard', () => {
  it('withholds candidate proof when unknown historical starts exist', () => {
    expect(legacyStartGuardSql).toContain('v_legacy_start_exists boolean');
    expect(legacyStartGuardSql).toContain('and reducer_version is null');
    expect(legacyStartGuardSql).toContain('not v_legacy_start_exists');
    expect(legacyStartGuardSql).toContain('create or replace function public.assert_plus_membership_lifecycle_bootstrap_empty');
    expect(legacyStartGuardSql).toContain('Plus membership lifecycle bootstrap requires empty lifecycle tables');
    expect(legacyStartGuardSql).toContain('revoke all on function public.recompute_plus_membership_stream');
    expect(lifecyclePgTapSql).toContain('new start cannot qualify an ambiguous legacy stream');
    expect(lifecyclePgTapSql).toContain('legacy ambiguity is not misreported as a two-new-start conflict');
    expect(lifecyclePgTapSql).toContain('legacy event, binding, and state fail the bootstrap preflight');
    expect(lifecyclePgTapSql).toContain('projection-only data also fails the bootstrap preflight');
    expectLifecycleTapPlans();
  });
});

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

describe('#164 membership lifecycle final terminal retirement migration', () => {
  it('always retires terminal evidence before allowing pre-terminal retired-stream selection', () => {
    expect(finalRepairSql).toContain('create or replace function public.record_plus_membership_event');
    expect(finalRepairSql).toContain('least(v_event.period_end, v_subscription.terminal_at)');
    expect(finalRepairSql).toContain('if v_subscription_retired then');
    expect(finalRepairSql).toContain('if v_terminal or v_boundary_reached then');
    expect(finalRepairSql).not.toContain('v_defer_terminal_retirement');
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

describe('#164 membership lifecycle terminal evidence order migration', () => {
  it('orders a cross-stream successor against durable terminal evidence instead of bypassing ordering', () => {
    expect(terminalEvidenceOrderSql).toContain(
      'create or replace function public.record_plus_membership_event',
    );
    expect(terminalEvidenceOrderSql).toContain('v_current_stream_retired boolean := false');
    expect(terminalEvidenceOrderSql).toContain('v_ordering_barrier_occurred_at timestamptz');
    expect(terminalEvidenceOrderSql).toContain('v_ordering_barrier_event_id text');
    // A retired current binding is resolved from durable subscription rows.
    expect(terminalEvidenceOrderSql).toContain('select current_stream.retired_at is not null');
    expect(terminalEvidenceOrderSql).toContain(
      'from public.plus_membership_subscription current_stream',
    );
    // The barrier is the stream's earliest terminal evidence, not the reducer clock.
    expect(terminalEvidenceOrderSql).toContain('v_ordering_barrier_occurred_at := v_state.last_event_occurred_at');
    expect(terminalEvidenceOrderSql).toContain('if v_current_stream_retired then');
    expect(terminalEvidenceOrderSql).toContain(
      'from public.plus_membership_event terminal_event',
    );
    expect(terminalEvidenceOrderSql).toContain(
      'and terminal_event.source_subscription_id = v_state.source_subscription_id',
    );
    expect(terminalEvidenceOrderSql).toContain(
      "or (terminal_event.event_type = 'membership_canceled'",
    );
    expect(terminalEvidenceOrderSql).toContain(
      'order by terminal_event.occurred_at, terminal_event.event_id',
    );
    // Deterministic tie ordering is preserved by comparing (occurred_at, event_id).
    expect(terminalEvidenceOrderSql).toContain(
      '(v_event.occurred_at, v_event.event_id) <= (v_ordering_barrier_occurred_at, v_ordering_barrier_event_id)',
    );
    // The unconditional ordering bypass from the previous migration is gone.
    expect(terminalEvidenceOrderSql).not.toContain('and not v_current_stream_retired)');
  });

  it('lets a newer confirmed start supersede pending without letting pending replace active', () => {
    expect(terminalEvidenceOrderSql).toContain(
      "(v_state.membership_status in ('active', 'past_due') and v_membership_status = 'pending')",
    );
    // A distinct newer membership_started may take over a pending current stream.
    expect(terminalEvidenceOrderSql).not.toContain(
      "or (v_state.membership_status = 'pending' and v_membership_status = 'active')",
    );
    expect(terminalEvidenceOrderSql).toContain(
      "or p_event_type not in ('membership_started', 'membership_pending') then",
    );
  });

  it('still retires the superseded stream and cannot resurrect a retired stream', () => {
    expect(terminalEvidenceOrderSql).toContain(
      'and source_subscription_id = v_state.source_subscription_id',
    );
    expect(terminalEvidenceOrderSql).toContain('set retired_at = coalesce(retired_at, now()),');
    const retiredReturn = terminalEvidenceOrderSql.indexOf('if v_subscription_retired then');
    const stateRead = terminalEvidenceOrderSql.indexOf(
      'select * into v_state from public.plus_membership_state',
    );
    expect(retiredReturn).toBeGreaterThan(-1);
    expect(stateRead).toBeGreaterThan(-1);
    expect(retiredReturn).toBeLessThan(stateRead);
  });

  it('keeps the lock order and server-only execution boundary', () => {
    const userLock = terminalEvidenceOrderSql.indexOf('hashtextextended(p_user_id::text, 164)');
    const streamLock = terminalEvidenceOrderSql.indexOf(
      "p_source_system || ':' || p_source_customer_id || ':' || p_source_subscription_id, 164",
    );
    const firstSubscriptionLock = terminalEvidenceOrderSql.indexOf(
      'from public.plus_membership_subscription',
    );
    expect(userLock).toBeGreaterThan(-1);
    expect(streamLock).toBeGreaterThan(-1);
    expect(firstSubscriptionLock).toBeGreaterThan(-1);
    expect(userLock).toBeLessThan(streamLock);
    expect(streamLock).toBeLessThan(firstSubscriptionLock);
    expect(terminalEvidenceOrderSql).not.toContain(
      'hashtextextended(v_subscription.user_id::text, 164)',
    );
    expect(terminalEvidenceOrderSql).toContain(
      'revoke all on function public.record_plus_membership_event',
    );
    expect(terminalEvidenceOrderSql).toContain(
      'grant execute on function public.record_plus_membership_event',
    );
    for (const identifier of [
      'paypal', 'ecpay', 'stripe', 'newebpay',
      'orders', 'payments', 'refunds', 'book_entitlement', 'book_entitlements',
    ]) {
      expect(terminalEvidenceOrderSql).not.toMatch(new RegExp(`\\b${identifier}\\b`, 'i'));
    }
    expect(terminalEvidenceOrderSql).not.toMatch(
      /\/functions\/v1\/(?:checkout|[^\s/]*webhook)\b/i,
    );
  });
});

describe('#164 membership lifecycle scheduled terminal barrier migration', () => {
  it('orders a cross-stream successor against the durable scheduled terminal authority', () => {
    expect(scheduledTerminalBarrierSql).toContain(
      'create or replace function public.record_plus_membership_event',
    );
    // The writer reads the retired binding's durable scheduled authority.
    expect(scheduledTerminalBarrierSql).toContain('current_stream.terminal_at,');
    expect(scheduledTerminalBarrierSql).toContain('current_stream.terminal_event_id');
    expect(scheduledTerminalBarrierSql).toContain('v_current_stream_terminal_at timestamptz');
    expect(scheduledTerminalBarrierSql).toContain('v_current_stream_terminal_event_id text');
    expect(scheduledTerminalBarrierSql).toContain(
      'if v_current_stream_retired and v_current_stream_terminal_at is not null then',
    );
    // terminal_at, not the reducer clock, is the barrier once it exists.
    expect(scheduledTerminalBarrierSql).toContain(
      'v_ordering_barrier_occurred_at := v_current_stream_terminal_at;',
    );
    // The terminal event identity is the deterministic exact-tie breaker.
    expect(scheduledTerminalBarrierSql).toContain(
      'v_ordering_barrier_event_id := v_current_stream_terminal_event_id;',
    );
    expect(scheduledTerminalBarrierSql).toContain(
      '(v_event.occurred_at, v_event.event_id) <= (v_ordering_barrier_occurred_at, v_ordering_barrier_event_id)',
    );
    // The unconditional ordering bypass from 20260922170000 is gone.
    expect(scheduledTerminalBarrierSql).not.toContain('and not v_current_stream_retired)');
  });

  it('preserves immediate-terminal evidence ordering and non-retired reducer ordering', () => {
    // A retired stream without a scheduled cutoff keeps the earliest-event barrier.
    expect(scheduledTerminalBarrierSql).toContain('elsif v_current_stream_retired then');
    expect(scheduledTerminalBarrierSql).toContain(
      'from public.plus_membership_event terminal_event',
    );
    expect(scheduledTerminalBarrierSql).toContain(
      'order by terminal_event.occurred_at, terminal_event.event_id',
    );
    expect(scheduledTerminalBarrierSql).toContain(
      "or (terminal_event.event_type = 'membership_canceled'",
    );
    // A non-retired current stream still uses its reducer clock as the barrier.
    expect(scheduledTerminalBarrierSql).toContain(
      'v_ordering_barrier_occurred_at := v_state.last_event_occurred_at;',
    );
    expect(scheduledTerminalBarrierSql).toContain(
      'v_ordering_barrier_event_id := v_state.last_event_id;',
    );
    // Successor retirement and the retired-stream rejection are unchanged.
    expect(scheduledTerminalBarrierSql).toContain('set retired_at = coalesce(retired_at, now()),');
    expect(scheduledTerminalBarrierSql).toContain(
      'and source_subscription_id = v_state.source_subscription_id',
    );
    const retiredReturn = scheduledTerminalBarrierSql.indexOf('if v_subscription_retired then');
    const stateRead = scheduledTerminalBarrierSql.indexOf(
      'select * into v_state from public.plus_membership_state',
    );
    expect(retiredReturn).toBeGreaterThan(-1);
    expect(stateRead).toBeGreaterThan(-1);
    expect(retiredReturn).toBeLessThan(stateRead);
  });

  it('keeps the lock order and server-only execution boundary', () => {
    const userLock = scheduledTerminalBarrierSql.indexOf('hashtextextended(p_user_id::text, 164)');
    const streamLock = scheduledTerminalBarrierSql.indexOf(
      "p_source_system || ':' || p_source_customer_id || ':' || p_source_subscription_id, 164",
    );
    const firstSubscriptionLock = scheduledTerminalBarrierSql.indexOf(
      'from public.plus_membership_subscription',
    );
    expect(userLock).toBeGreaterThan(-1);
    expect(streamLock).toBeGreaterThan(-1);
    expect(firstSubscriptionLock).toBeGreaterThan(-1);
    expect(userLock).toBeLessThan(streamLock);
    expect(streamLock).toBeLessThan(firstSubscriptionLock);
    expect(scheduledTerminalBarrierSql).not.toContain(
      'hashtextextended(v_subscription.user_id::text, 164)',
    );
    expect(scheduledTerminalBarrierSql).toContain(
      'revoke all on function public.record_plus_membership_event',
    );
    expect(scheduledTerminalBarrierSql).toContain(
      'grant execute on function public.record_plus_membership_event',
    );
    for (const identifier of [
      'paypal', 'ecpay', 'stripe', 'newebpay',
      'orders', 'payments', 'refunds', 'book_entitlement', 'book_entitlements',
    ]) {
      expect(scheduledTerminalBarrierSql).not.toMatch(new RegExp(`\\b${identifier}\\b`, 'i'));
    }
    expect(scheduledTerminalBarrierSql).not.toMatch(
      /\/functions\/v1\/(?:checkout|[^\s/]*webhook)\b/i,
    );
  });
});

describe('#164 membership lifecycle effective terminal authority migration', () => {
  it('uses the effective earliest terminal authority for cross-stream successor ordering', () => {
    expect(effectiveTerminalAuthoritySql).toContain(
      'create or replace function public.record_plus_membership_event',
    );
    // The writer keeps both terminal authorities available for a retired stream.
    expect(effectiveTerminalAuthoritySql).toContain('current_stream.terminal_at,');
    expect(effectiveTerminalAuthoritySql).toContain('current_stream.terminal_event_id');
    expect(effectiveTerminalAuthoritySql).toContain(
      'v_current_stream_immediate_terminal_at timestamptz',
    );
    expect(effectiveTerminalAuthoritySql).toContain(
      'v_current_stream_immediate_terminal_event_id text',
    );
    // The earliest immediate terminal evidence is read from durable events.
    expect(effectiveTerminalAuthoritySql).toContain(
      'into v_current_stream_immediate_terminal_at,',
    );
    expect(effectiveTerminalAuthoritySql).toContain(
      'from public.plus_membership_event terminal_event',
    );
    expect(effectiveTerminalAuthoritySql).toContain(
      'order by terminal_event.occurred_at, terminal_event.event_id',
    );
    expect(effectiveTerminalAuthoritySql).toContain(
      "or (terminal_event.event_type = 'membership_canceled'",
    );
    // The scheduled terminal wins only when it is not later than the immediate terminal.
    expect(effectiveTerminalAuthoritySql).toContain(
      'and (v_current_stream_immediate_terminal_at is null',
    );
    expect(effectiveTerminalAuthoritySql).toContain(
      'or v_current_stream_terminal_at <= v_current_stream_immediate_terminal_at) then',
    );
    expect(effectiveTerminalAuthoritySql).toContain(
      'v_ordering_barrier_occurred_at := v_current_stream_terminal_at;',
    );
    expect(effectiveTerminalAuthoritySql).toContain(
      'v_ordering_barrier_event_id := v_current_stream_terminal_event_id;',
    );
    // An earlier immediate terminal becomes the barrier instead of the later cutoff.
    expect(effectiveTerminalAuthoritySql).toContain(
      'elsif v_current_stream_immediate_terminal_at is not null then',
    );
    expect(effectiveTerminalAuthoritySql).toContain(
      'v_ordering_barrier_occurred_at := v_current_stream_immediate_terminal_at;',
    );
    expect(effectiveTerminalAuthoritySql).toContain(
      'v_ordering_barrier_event_id := v_current_stream_immediate_terminal_event_id;',
    );
    // Ordering is never bypassed for a retired stream.
    expect(effectiveTerminalAuthoritySql).toContain(
      '(v_event.occurred_at, v_event.event_id) <= (v_ordering_barrier_occurred_at, v_ordering_barrier_event_id)',
    );
    expect(effectiveTerminalAuthoritySql).not.toContain('and not v_current_stream_retired)');
    // The earlier single-authority branch from 20260922190000 is replaced.
    expect(effectiveTerminalAuthoritySql).not.toContain(
      'if v_current_stream_retired and v_current_stream_terminal_at is not null then',
    );
  });

  it('preserves reducer-clock fallback, successor retirement and retired-stream rejection', () => {
    // A non-retired current stream still uses its reducer clock as the barrier.
    expect(effectiveTerminalAuthoritySql).toContain(
      'v_ordering_barrier_occurred_at := v_state.last_event_occurred_at;',
    );
    expect(effectiveTerminalAuthoritySql).toContain(
      'v_ordering_barrier_event_id := v_state.last_event_id;',
    );
    // A retired stream with no terminal authority keeps the reducer-clock fallback.
    expect(effectiveTerminalAuthoritySql).toContain('if v_current_stream_retired then');
    // Pending replacement and successor retirement rules are unchanged.
    expect(effectiveTerminalAuthoritySql).toContain(
      "(v_state.membership_status in ('active', 'past_due') and v_membership_status = 'pending')",
    );
    expect(effectiveTerminalAuthoritySql).toContain('set retired_at = coalesce(retired_at, now()),');
    expect(effectiveTerminalAuthoritySql).toContain(
      'and source_subscription_id = v_state.source_subscription_id',
    );
    const retiredReturn = effectiveTerminalAuthoritySql.indexOf('if v_subscription_retired then');
    const stateRead = effectiveTerminalAuthoritySql.indexOf(
      'select * into v_state from public.plus_membership_state',
    );
    expect(retiredReturn).toBeGreaterThan(-1);
    expect(stateRead).toBeGreaterThan(-1);
    expect(retiredReturn).toBeLessThan(stateRead);
  });

  it('keeps the lock order, server-only boundary and provider-neutral vocabulary', () => {
    const userLock = effectiveTerminalAuthoritySql.indexOf(
      'hashtextextended(p_user_id::text, 164)',
    );
    const streamLock = effectiveTerminalAuthoritySql.indexOf(
      "p_source_system || ':' || p_source_customer_id || ':' || p_source_subscription_id, 164",
    );
    const firstSubscriptionLock = effectiveTerminalAuthoritySql.indexOf(
      'from public.plus_membership_subscription',
    );
    expect(userLock).toBeGreaterThan(-1);
    expect(streamLock).toBeGreaterThan(-1);
    expect(firstSubscriptionLock).toBeGreaterThan(-1);
    expect(userLock).toBeLessThan(streamLock);
    expect(streamLock).toBeLessThan(firstSubscriptionLock);
    expect(effectiveTerminalAuthoritySql).not.toContain(
      'hashtextextended(v_subscription.user_id::text, 164)',
    );
    expect(effectiveTerminalAuthoritySql).toContain(
      'revoke all on function public.record_plus_membership_event',
    );
    expect(effectiveTerminalAuthoritySql).toContain(
      'grant execute on function public.record_plus_membership_event',
    );
    for (const identifier of [
      'paypal', 'ecpay', 'stripe', 'newebpay',
      'orders', 'payments', 'refunds', 'book_entitlement', 'book_entitlements',
    ]) {
      expect(effectiveTerminalAuthoritySql).not.toMatch(new RegExp(`\\b${identifier}\\b`, 'i'));
    }
    expect(effectiveTerminalAuthoritySql).not.toMatch(
      /\/functions\/v1\/(?:checkout|[^\s/]*webhook)\b/i,
    );
  });
});

describe('#164 membership lifecycle elapsed scheduled terminal migration', () => {
  it('retires an elapsed scheduled current stream before the cross-stream successor comparison', () => {
    expect(elapsedScheduledTerminalSql).toContain(
      'create or replace function public.record_plus_membership_event',
    );
    // A durable cutoff that wall-clock time already reached retires the current
    // state stream binding even when no event has retired it yet.
    expect(elapsedScheduledTerminalSql).toContain('if not v_current_stream_retired');
    expect(elapsedScheduledTerminalSql).toContain(
      'and v_current_stream_terminal_at is not null',
    );
    expect(elapsedScheduledTerminalSql).toContain(
      'and v_current_stream_terminal_at <= now() then',
    );
    expect(elapsedScheduledTerminalSql).toContain(
      'set retired_at = coalesce(retired_at, now()),',
    );
    expect(elapsedScheduledTerminalSql).toContain('v_current_stream_retired := true;');
    // The retirement happens before both the barrier selection and the
    // successor ordering comparison, so a pre-cutoff arrival is measured
    // against the scheduled terminal rather than the reducer clock.
    const elapsedRetirement = elapsedScheduledTerminalSql.indexOf(
      'and v_current_stream_terminal_at <= now() then',
    );
    const barrierSelection = elapsedScheduledTerminalSql.indexOf(
      'v_ordering_barrier_occurred_at := v_state.last_event_occurred_at;',
    );
    const successorComparison = elapsedScheduledTerminalSql.indexOf(
      '(v_event.occurred_at, v_event.event_id) <= (v_ordering_barrier_occurred_at, v_ordering_barrier_event_id)',
    );
    expect(elapsedRetirement).toBeGreaterThan(-1);
    expect(barrierSelection).toBeGreaterThan(-1);
    expect(successorComparison).toBeGreaterThan(-1);
    expect(elapsedRetirement).toBeLessThan(barrierSelection);
    expect(barrierSelection).toBeLessThan(successorComparison);
    // The scheduled terminal becomes the barrier once the binding is retired.
    expect(elapsedScheduledTerminalSql).toContain(
      'v_ordering_barrier_occurred_at := v_current_stream_terminal_at;',
    );
    expect(elapsedScheduledTerminalSql).toContain(
      'v_ordering_barrier_event_id := v_current_stream_terminal_event_id;',
    );
  });

  it('preserves the immediate-vs-scheduled authority and noncurrent terminal handling', () => {
    // The effective earliest terminal authority is still selected from the
    // durable records; the elapsed branch only promotes terminal_at <= now().
    expect(elapsedScheduledTerminalSql).toContain(
      'and (v_current_stream_immediate_terminal_at is null',
    );
    expect(elapsedScheduledTerminalSql).toContain(
      'or v_current_stream_terminal_at <= v_current_stream_immediate_terminal_at) then',
    );
    expect(elapsedScheduledTerminalSql).toContain(
      'elsif v_current_stream_immediate_terminal_at is not null then',
    );
    // A genuinely live current stream without terminal_at keeps the reducer clock.
    expect(elapsedScheduledTerminalSql).toContain(
      'v_ordering_barrier_occurred_at := v_state.last_event_occurred_at;',
    );
    expect(elapsedScheduledTerminalSql).toContain(
      'v_ordering_barrier_event_id := v_state.last_event_id;',
    );
    // Ordering is never bypassed and noncurrent terminal evidence may only
    // retire its own binding, so access cannot change from that evidence.
    expect(elapsedScheduledTerminalSql).not.toContain('and not v_current_stream_retired)');
    expect(elapsedScheduledTerminalSql).toContain(
      'A replaced/noncurrent stream can only retire its own binding',
    );
    expect(elapsedScheduledTerminalSql).toContain('if v_terminal or v_period_end_terminal then');
  });

  it('clamps the elapsed current stream projection to the terminal cutoff', () => {
    // A period-end cancellation must not keep an active future access horizon
    // once wall-clock time has reached the durable cutoff, even without a
    // separate expiry event. The elapsed branch retires the binding and clamps
    // the published projection to the cutoff as a terminal non-member state.
    expect(elapsedScheduledTerminalSql).toContain(
      'update public.plus_membership_access',
    );
    expect(elapsedScheduledTerminalSql).toContain("set membership_status = 'expired',");
    expect(elapsedScheduledTerminalSql).toContain(
      'current_period_end = least(current_period_end, v_current_stream_terminal_at),',
    );
    // The clamp lives inside the elapsed branch, after the binding is retired
    // and before the successor ordering comparison, so a stale successor
    // leaves the clamped projection while an accepted successor overwrites it.
    const elapsedBranch = elapsedScheduledTerminalSql.indexOf(
      'and v_current_stream_terminal_at <= now() then',
    );
    const accessClamp = elapsedScheduledTerminalSql.indexOf(
      'current_period_end = least(current_period_end, v_current_stream_terminal_at),',
    );
    const branchRetiredFlag = elapsedScheduledTerminalSql.indexOf(
      'v_current_stream_retired := true;',
    );
    const successorComparison = elapsedScheduledTerminalSql.indexOf(
      '(v_event.occurred_at, v_event.event_id) <= (v_ordering_barrier_occurred_at, v_ordering_barrier_event_id)',
    );
    expect(elapsedBranch).toBeGreaterThan(-1);
    expect(accessClamp).toBeGreaterThan(-1);
    expect(branchRetiredFlag).toBeGreaterThan(-1);
    expect(successorComparison).toBeGreaterThan(-1);
    expect(elapsedBranch).toBeLessThan(accessClamp);
    expect(accessClamp).toBeLessThan(branchRetiredFlag);
    expect(branchRetiredFlag).toBeLessThan(successorComparison);
  });

  it('keeps successor retirement, no-resurrection and non-retired ordering intact', () => {
    expect(elapsedScheduledTerminalSql).toContain(
      "or p_event_type not in ('membership_started', 'membership_pending') then",
    );
    expect(elapsedScheduledTerminalSql).toContain(
      "(v_state.membership_status in ('active', 'past_due') and v_membership_status = 'pending')",
    );
    // The superseded stream is still retired durably on an accepted succession.
    expect(elapsedScheduledTerminalSql).toContain(
      'and source_subscription_id = v_state.source_subscription_id',
    );
    expect(elapsedScheduledTerminalSql).toContain('set retired_at = coalesce(retired_at, now()),');
    // Retired incoming bindings are rejected before reducer state is read, so an
    // elapsed stream can never resurrect.
    const retiredReturn = elapsedScheduledTerminalSql.indexOf('if v_subscription_retired then');
    const stateRead = elapsedScheduledTerminalSql.indexOf(
      'select * into v_state from public.plus_membership_state',
    );
    expect(retiredReturn).toBeGreaterThan(-1);
    expect(stateRead).toBeGreaterThan(-1);
    expect(retiredReturn).toBeLessThan(stateRead);
  });

  it('keeps the lock order, server-only boundary and provider-neutral vocabulary', () => {
    const userLock = elapsedScheduledTerminalSql.indexOf(
      'hashtextextended(p_user_id::text, 164)',
    );
    const streamLock = elapsedScheduledTerminalSql.indexOf(
      "p_source_system || ':' || p_source_customer_id || ':' || p_source_subscription_id, 164",
    );
    const firstSubscriptionLock = elapsedScheduledTerminalSql.indexOf(
      'from public.plus_membership_subscription',
    );
    expect(userLock).toBeGreaterThan(-1);
    expect(streamLock).toBeGreaterThan(-1);
    expect(firstSubscriptionLock).toBeGreaterThan(-1);
    expect(userLock).toBeLessThan(streamLock);
    expect(streamLock).toBeLessThan(firstSubscriptionLock);
    expect(elapsedScheduledTerminalSql).not.toContain(
      'hashtextextended(v_subscription.user_id::text, 164)',
    );
    expect(elapsedScheduledTerminalSql).toContain(
      'revoke all on function public.record_plus_membership_event',
    );
    expect(elapsedScheduledTerminalSql).toContain(
      'grant execute on function public.record_plus_membership_event',
    );
    for (const identifier of [
      'paypal', 'ecpay', 'stripe', 'newebpay',
      'orders', 'payments', 'refunds', 'book_entitlement', 'book_entitlements',
    ]) {
      expect(elapsedScheduledTerminalSql).not.toMatch(new RegExp(`\\b${identifier}\\b`, 'i'));
    }
    expect(elapsedScheduledTerminalSql).not.toMatch(
      /\/functions\/v1\/(?:checkout|[^\s/]*webhook)\b/i,
    );
  });

  it('repairs live pending succession and same-stream confirmation precedence', () => {
    // A newer membership_pending on a distinct stream may not supersede a live
    // pending current stream; only a confirmed membership_started may.
    expect(pendingSuccessionPrecedenceSql).toContain(
      'or (v_membership_status = \'pending\'\n             and v_state.membership_status = \'pending\'\n             and not v_current_stream_retired)',
    );
    expect(pendingSuccessionPrecedenceSql).toContain(
      "or p_event_type not in ('membership_started', 'membership_pending') then",
    );
    // A same-timestamp confirmed start wins the tie against a live pending
    // state without consulting the source event id.
    expect(pendingSuccessionPrecedenceSql).toContain(
      'and not (v_event.occurred_at = v_state.last_event_occurred_at\n                  and p_event_type = \'membership_started\'\n                  and v_state.membership_status = \'pending\') then',
    );
    // The pending state still cannot regress an active/past_due stream.
    expect(pendingSuccessionPrecedenceSql).toContain(
      "(v_state.membership_status in ('active', 'past_due') and v_membership_status = 'pending')",
    );
    // Retired bindings still reject before reducer state is read, so a pending
    // state can never resurrect a retired stream.
    const retiredReturn = pendingSuccessionPrecedenceSql.indexOf('if v_subscription_retired then');
    const stateRead = pendingSuccessionPrecedenceSql.indexOf(
      'select * into v_state from public.plus_membership_state',
    );
    expect(retiredReturn).toBeGreaterThan(-1);
    expect(stateRead).toBeGreaterThan(-1);
    expect(retiredReturn).toBeLessThan(stateRead);
  });

  it('keeps the pending-succession migration server-only, provider-neutral and lock-ordered', () => {
    const userLock = pendingSuccessionPrecedenceSql.indexOf(
      'hashtextextended(p_user_id::text, 164)',
    );
    const streamLock = pendingSuccessionPrecedenceSql.indexOf(
      "p_source_system || ':' || p_source_customer_id || ':' || p_source_subscription_id, 164",
    );
    const firstSubscriptionLock = pendingSuccessionPrecedenceSql.indexOf(
      'from public.plus_membership_subscription',
    );
    expect(userLock).toBeGreaterThan(-1);
    expect(streamLock).toBeGreaterThan(-1);
    expect(firstSubscriptionLock).toBeGreaterThan(-1);
    expect(userLock).toBeLessThan(streamLock);
    expect(streamLock).toBeLessThan(firstSubscriptionLock);
    expect(pendingSuccessionPrecedenceSql).toContain(
      'revoke all on function public.record_plus_membership_event',
    );
    expect(pendingSuccessionPrecedenceSql).toContain(
      'grant execute on function public.record_plus_membership_event',
    );
    for (const identifier of [
      'paypal', 'ecpay', 'stripe', 'newebpay',
      'orders', 'payments', 'refunds', 'book_entitlement', 'book_entitlements',
    ]) {
      expect(pendingSuccessionPrecedenceSql).not.toMatch(new RegExp(`\\b${identifier}\\b`, 'i'));
    }
    expect(pendingSuccessionPrecedenceSql).not.toMatch(
      /\/functions\/v1\/(?:checkout|[^\s/]*webhook)\b/i,
    );
  });

  it('adds pgTAP user cases with a corrected plan count', () => {
    expect(lifecyclePgTapSql).toContain('50000000-0000-0000-0000-000000000184');
    expect(lifecyclePgTapSql).toContain('50000000-0000-0000-0000-000000000185');
    expect(lifecyclePgTapSql).toContain('50000000-0000-0000-0000-000000000186');
    expect(lifecyclePgTapSql).toContain('50000000-0000-0000-0000-000000000187');
    expect(lifecyclePgTapSql).toContain(
      '#164 P1 elapsed scheduled terminal rejects a pre-cutoff successor delivered after the cutoff',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 P1 elapsed scheduled terminal accepts a successor strictly after the cutoff',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 P1 elapsed scheduled terminal cannot resurrect the elapsed stream',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 P1 newer pending B cannot supersede a live pending stream A',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 P1 same-timestamp confirmed start applies even with a lower source event id',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 P1 reverse delivery keeps the active confirmation',
    );
    // Each isolated file declares its exact TAP plan; the total coverage is preserved.
    expectLifecycleTapPlans();
  });
});

describe('#164 buffered successor-stream evidence migration', () => {
  it('folds durable successor evidence and gates plan admission to a new activation', () => {
    expect(bufferedStreamEvidenceSql).toContain('v_binding_preexisting boolean := false;');
    expect(bufferedStreamEvidenceSql).toContain('v_binding_preexisting := found;');
    expect(bufferedStreamEvidenceSql).toContain('v_stream_became_current boolean := false;');
    expect(bufferedStreamEvidenceSql).toContain('v_stream_became_current := true;');
    expect(bufferedStreamEvidenceSql).toContain('if v_stream_became_current then');
    // Plan availability only gates a new binding that would project active
    // access, and never terminal period-end cancellation evidence.
    expect(bufferedStreamEvidenceSql).toContain('if not v_binding_preexisting');
    expect(bufferedStreamEvidenceSql).toContain("p_event_type <> 'membership_canceled'");
    expect(bufferedStreamEvidenceSql).toContain(
      "buffered.membership_status in ('active', 'past_due')",
    );
    expect(bufferedStreamEvidenceSql).toContain("'membership_payment_failed'");
    // The displaced-pending watermark reset and the monotonic guard survive.
    expect(bufferedStreamEvidenceSql).toContain('if v_displaces_live_pending then');
    expect(bufferedStreamEvidenceSql).toContain(
      'v_watermark_occurred_at := v_state.last_event_occurred_at;',
    );
    expect(bufferedStreamEvidenceSql).toContain(
      'v_ordering_barrier_occurred_at := v_state.succession_barrier_occurred_at;',
    );
    expect(bufferedStreamEvidenceSql).toContain("return 'replayed'");
    expect(bufferedStreamEvidenceSql).toContain("return 'stale'");
  });

  it('keeps the buffered successor-stream evidence migration server-only, provider-neutral and lock-ordered', () => {
    const userLock = bufferedStreamEvidenceSql.indexOf(
      'hashtextextended(p_user_id::text, 164)',
    );
    const streamLock = bufferedStreamEvidenceSql.indexOf(
      "p_source_system || ':' || p_source_customer_id || ':' || p_source_subscription_id, 164",
    );
    const firstSubscriptionLock = bufferedStreamEvidenceSql.indexOf(
      'from public.plus_membership_subscription',
    );
    expect(userLock).toBeGreaterThan(-1);
    expect(streamLock).toBeGreaterThan(-1);
    expect(firstSubscriptionLock).toBeGreaterThan(-1);
    expect(userLock).toBeLessThan(streamLock);
    expect(streamLock).toBeLessThan(firstSubscriptionLock);
    expect(bufferedStreamEvidenceSql).toContain(
      'revoke all on function public.record_plus_membership_event',
    );
    expect(bufferedStreamEvidenceSql).toContain(
      'grant execute on function public.record_plus_membership_event',
    );
    for (const identifier of [
      'paypal', 'ecpay', 'stripe', 'newebpay',
      'orders', 'payments', 'refunds', 'book_entitlement', 'book_entitlements',
    ]) {
      expect(bufferedStreamEvidenceSql).not.toMatch(new RegExp(`\\b${identifier}\\b`, 'i'));
    }
    expect(bufferedStreamEvidenceSql).not.toMatch(
      /\/functions\/v1\/(?:checkout|[^\s/]*webhook)\b/i,
    );
  });

  it('adds pgTAP cases proving both delivery orders fold to past_due and inactive-plan cancellation records its cutoff', () => {
    for (const user of ['195', '196', '197']) {
      expect(lifecyclePgTapSql).toContain(`50000000-0000-0000-0000-000000000${user}`);
    }
    expect(lifecyclePgTapSql).toContain(
      '#164 buffered successor evidence forward delivery records C failure before its start as stale',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 buffered successor evidence forward delivery folds the durable failure into C state',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 buffered successor evidence forward delivery ends C access past_due',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 buffered successor evidence reverse delivery access is past_due',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 inactive-plan admission accepts period-end cancellation on an already-bound stream',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 inactive-plan admission leaves access not extendable',
    );
    expectLifecycleTapPlans();
  });
});

describe('#164 membership lifecycle pending confirmation watermark migration', () => {
  it('keeps the recorded ordering watermark monotonic when a confirmation wins the same-timestamp tie', () => {
    // The confirmation still takes semantic precedence over a live pending
    // state at the same occurred_at, regardless of source event id.
    expect(pendingConfirmationWatermarkSql).toContain(
      'and not (v_event.occurred_at = v_state.last_event_occurred_at\n                  and p_event_type = \'membership_started\'\n                  and v_state.membership_status = \'pending\') then',
    );
    // Ordinary chronological ordering still uses the strict event-key compare.
    expect(pendingConfirmationWatermarkSql).toContain(
      '(v_event.occurred_at, v_event.event_id) <= (v_state.last_event_occurred_at, v_state.last_event_id)',
    );
    // The confirmation is detected and cannot reduce the recorded watermark.
    expect(pendingConfirmationWatermarkSql).toContain(
      'v_confirmation_tie := v_event.occurred_at = v_state.last_event_occurred_at',
    );
    expect(pendingConfirmationWatermarkSql).toContain(
      'if v_confirmation_tie\n         and (v_state.last_event_occurred_at, v_state.last_event_id)\n             > (v_watermark_occurred_at, v_watermark_event_id) then',
    );
    expect(pendingConfirmationWatermarkSql).toContain(
      'v_watermark_occurred_at := v_state.last_event_occurred_at;',
    );
    expect(pendingConfirmationWatermarkSql).toContain(
      'v_watermark_event_id := v_state.last_event_id;',
    );
    // The state write uses the preserved watermark rather than the raw event key.
    expect(pendingConfirmationWatermarkSql).toContain(
      'last_event_occurred_at = v_watermark_occurred_at,',
    );
    expect(pendingConfirmationWatermarkSql).toContain(
      'last_event_id = v_watermark_event_id, updated_at = now();',
    );
    expect(pendingConfirmationWatermarkSql).not.toContain(
      'last_event_occurred_at = excluded.last_event_occurred_at,',
    );
  });

  it('keeps the pending-confirmation migration server-only, provider-neutral and lock-ordered', () => {
    const userLock = pendingConfirmationWatermarkSql.indexOf(
      'hashtextextended(p_user_id::text, 164)',
    );
    const streamLock = pendingConfirmationWatermarkSql.indexOf(
      "p_source_system || ':' || p_source_customer_id || ':' || p_source_subscription_id, 164",
    );
    const firstSubscriptionLock = pendingConfirmationWatermarkSql.indexOf(
      'from public.plus_membership_subscription',
    );
    expect(userLock).toBeGreaterThan(-1);
    expect(streamLock).toBeGreaterThan(-1);
    expect(firstSubscriptionLock).toBeGreaterThan(-1);
    expect(userLock).toBeLessThan(streamLock);
    expect(streamLock).toBeLessThan(firstSubscriptionLock);
    expect(pendingConfirmationWatermarkSql).toContain(
      'revoke all on function public.record_plus_membership_event',
    );
    expect(pendingConfirmationWatermarkSql).toContain(
      'grant execute on function public.record_plus_membership_event',
    );
    for (const identifier of [
      'paypal', 'ecpay', 'stripe', 'newebpay',
      'orders', 'payments', 'refunds', 'book_entitlement', 'book_entitlements',
    ]) {
      expect(pendingConfirmationWatermarkSql).not.toMatch(new RegExp(`\\b${identifier}\\b`, 'i'));
    }
    expect(pendingConfirmationWatermarkSql).not.toMatch(
      /\/functions\/v1\/(?:checkout|[^\s/]*webhook)\b/i,
    );
  });

  it('adds pgTAP cases for the monotonic confirmation watermark with a corrected plan count', () => {
    expect(lifecyclePgTapSql).toContain('50000000-0000-0000-0000-000000000188');
    expect(lifecyclePgTapSql).toContain(
      '#164 P1 confirmation watermark keeps the recorded pending event id',
    );
    expect(lifecyclePgTapSql).toContain(
      '#165 same-timestamp payment failure below observed pending still applies',
    );
    expectLifecycleTapPlans();
  });
});

describe('#164 membership lifecycle monotonic pending succession migration', () => {
  it('advances the ordering watermark for a semantically stale same-timestamp pending', () => {
    expect(monotonicPendingSuccessionSql).toContain(
      "if v_membership_status = 'pending'",
    );
    expect(monotonicPendingSuccessionSql).toContain(
      'and v_event.occurred_at = v_state.last_event_occurred_at',
    );
    expect(monotonicPendingSuccessionSql).toContain(
      'set last_event_occurred_at = v_event.occurred_at,',
    );
  });

  it('orders a confirmed successor against the live pending stream succession barrier', () => {
    expect(monotonicPendingSuccessionSql).toContain(
      'add column if not exists succession_barrier_occurred_at timestamptz',
    );
    expect(monotonicPendingSuccessionSql).toContain(
      'add column if not exists succession_barrier_event_id text',
    );
    expect(monotonicPendingSuccessionSql).toContain(
      "elsif v_state.membership_status = 'pending'",
    );
    expect(monotonicPendingSuccessionSql).toContain(
      'and v_state.succession_barrier_occurred_at is not null then',
    );
    expect(monotonicPendingSuccessionSql).toContain(
      'v_ordering_barrier_occurred_at := v_state.succession_barrier_occurred_at;',
    );
    expect(monotonicPendingSuccessionSql).toContain(
      'succession_barrier_occurred_at = v_succession_barrier_occurred_at,',
    );
    expect(monotonicPendingSuccessionSql).toContain(
      'succession_barrier_event_id = v_succession_barrier_event_id,',
    );
    // Unconfirmed pending still cannot retire a live pending or active stream.
    expect(monotonicPendingSuccessionSql).toContain('not v_current_stream_retired)');
    expect(monotonicPendingSuccessionSql).toContain(
      "or (v_state.membership_status in ('active', 'past_due') and v_membership_status = 'pending')",
    );
  });

  it('keeps the applied watermark monotonic and the equal-cutoff terminal id deterministic', () => {
    expect(monotonicPendingSuccessionSql).toContain(
      'v_watermark_occurred_at := v_state.last_event_occurred_at;',
    );
    expect(monotonicPendingSuccessionSql).toContain(
      'or (p_period_end = terminal_at and v_event.event_id < terminal_event_id)',
    );
    expect(monotonicPendingSuccessionSql).toContain(
      'last_event_occurred_at = v_watermark_occurred_at,',
    );
    expect(monotonicPendingSuccessionSql).not.toContain(
      'last_event_occurred_at = excluded.last_event_occurred_at,',
    );
  });

  it('keeps the monotonic pending succession migration server-only, provider-neutral and lock-ordered', () => {
    const userLock = monotonicPendingSuccessionSql.indexOf(
      'hashtextextended(p_user_id::text, 164)',
    );
    const streamLock = monotonicPendingSuccessionSql.indexOf(
      "p_source_system || ':' || p_source_customer_id || ':' || p_source_subscription_id, 164",
    );
    const firstSubscriptionLock = monotonicPendingSuccessionSql.indexOf(
      'from public.plus_membership_subscription',
    );
    expect(userLock).toBeGreaterThan(-1);
    expect(streamLock).toBeGreaterThan(-1);
    expect(firstSubscriptionLock).toBeGreaterThan(-1);
    expect(userLock).toBeLessThan(streamLock);
    expect(streamLock).toBeLessThan(firstSubscriptionLock);
    expect(monotonicPendingSuccessionSql).toContain(
      'revoke all on function public.record_plus_membership_event',
    );
    expect(monotonicPendingSuccessionSql).toContain(
      'grant execute on function public.record_plus_membership_event',
    );
    for (const identifier of [
      'paypal', 'ecpay', 'stripe', 'newebpay',
      'orders', 'payments', 'refunds', 'book_entitlement', 'book_entitlements',
    ]) {
      expect(monotonicPendingSuccessionSql).not.toMatch(new RegExp(`\\b${identifier}\\b`, 'i'));
    }
    expect(monotonicPendingSuccessionSql).not.toMatch(
      /\/functions\/v1\/(?:checkout|[^\s/]*webhook)\b/i,
    );
  });

  it('adds pgTAP cases for the monotonic succession repair with a corrected plan count', () => {
    expect(lifecyclePgTapSql).toContain('50000000-0000-0000-0000-000000000189');
    expect(lifecyclePgTapSql).toContain('50000000-0000-0000-0000-000000000190');
    expect(lifecyclePgTapSql).toContain('50000000-0000-0000-0000-000000000191');
    expect(lifecyclePgTapSql).toContain('50000000-0000-0000-0000-000000000192');
    expect(lifecyclePgTapSql).toContain(
      '#164 P1a reverse delivery advances the watermark to the stale pending key',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 P1b earlier confirmed start C displaces the live pending stream B',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 P2 equal cutoff selects the least durable evidence id regardless of arrival',
    );
    expectLifecycleTapPlans();
  });
});

describe('#164 displaced pending watermark migration', () => {
  it('resets the applied reducer watermark when a confirmed start displaces a live pending stream', () => {
    expect(displacedPendingWatermarkSql).toContain(
      'v_displaces_live_pending boolean := false;',
    );
    expect(displacedPendingWatermarkSql).toContain('v_displaces_live_pending := true;');
    // The reset only runs on the distinct-stream succession-barrier path, after
    // the stale check, and it reuses the confirmed start event key.
    expect(displacedPendingWatermarkSql).toContain('if v_displaces_live_pending then');
    expect(displacedPendingWatermarkSql).toContain(
      'v_watermark_occurred_at := v_event.occurred_at;',
    );
    expect(displacedPendingWatermarkSql).toContain(
      'v_watermark_event_id := v_event.event_id;',
    );
    // The same-stream stale-pending watermark advancement (P1a) is preserved.
    expect(displacedPendingWatermarkSql).toContain("if v_membership_status = 'pending'");
    expect(displacedPendingWatermarkSql).toContain(
      'set last_event_occurred_at = v_event.occurred_at,',
    );
    // The ordinary monotonic non-rewind guard is untouched.
    expect(displacedPendingWatermarkSql).toContain(
      'v_watermark_occurred_at := v_state.last_event_occurred_at;',
    );
    expect(displacedPendingWatermarkSql).toContain(
      'last_event_occurred_at = v_watermark_occurred_at,',
    );
  });

  it('keeps the displaced pending watermark migration server-only, provider-neutral and lock-ordered', () => {
    const userLock = displacedPendingWatermarkSql.indexOf(
      'hashtextextended(p_user_id::text, 164)',
    );
    const streamLock = displacedPendingWatermarkSql.indexOf(
      "p_source_system || ':' || p_source_customer_id || ':' || p_source_subscription_id, 164",
    );
    const firstSubscriptionLock = displacedPendingWatermarkSql.indexOf(
      'from public.plus_membership_subscription',
    );
    expect(userLock).toBeGreaterThan(-1);
    expect(streamLock).toBeGreaterThan(-1);
    expect(firstSubscriptionLock).toBeGreaterThan(-1);
    expect(userLock).toBeLessThan(streamLock);
    expect(streamLock).toBeLessThan(firstSubscriptionLock);
    expect(displacedPendingWatermarkSql).toContain(
      'revoke all on function public.record_plus_membership_event',
    );
    expect(displacedPendingWatermarkSql).toContain(
      'grant execute on function public.record_plus_membership_event',
    );
    for (const identifier of [
      'paypal', 'ecpay', 'stripe', 'newebpay',
      'orders', 'payments', 'refunds', 'book_entitlement', 'book_entitlements',
    ]) {
      expect(displacedPendingWatermarkSql).not.toMatch(new RegExp(`\\b${identifier}\\b`, 'i'));
    }
    expect(displacedPendingWatermarkSql).not.toMatch(
      /\/functions\/v1\/(?:checkout|[^\s/]*webhook)\b/i,
    );
  });

  it('adds pgTAP cases proving both delivery orders end past_due with an accurate plan', () => {
    expect(lifecyclePgTapSql).toContain('50000000-0000-0000-0000-000000000193');
    expect(lifecyclePgTapSql).toContain('50000000-0000-0000-0000-000000000194');
    expect(lifecyclePgTapSql).toContain(
      '#164 displaced pending watermark forward delivery applies C payment failure at t15',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 displaced pending watermark forward delivery ends past_due',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 displaced pending watermark reverse delivery applies C payment failure at t15',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 displaced pending watermark reverse delivery ends past_due',
    );
    expectLifecycleTapPlans();
  });
});

describe('#164 admission marker and terminal reconciliation migration', () => {
  it('reconciles buffered successor terminal evidence and durable plan admission', () => {
    // A stream retired by its own durable terminal evidence may still accept a
    // pre-terminal lifecycle event; the retirement itself is preserved and the
    // event must still beat the current stream's ordering barrier.
    expect(finalRepairSql).toContain('if v_subscription_retired then');
    expect(finalRepairSql).toContain('v_retired_own_terminal_at');
    expect(finalRepairSql).toContain(
      "terminal_event.event_type = 'membership_canceled'",
    );
    expect(finalRepairSql).toContain(
      '>= (v_retired_own_terminal_at, v_retired_own_terminal_event_id) then',
    );
    // The accepted stream's ordering clock resets to its own key, and the fold
    // reconciles terminal evidence as well as active/past_due evidence.
    expect(finalRepairSql).not.toContain('v_displaces_live_pending');
    expect(finalRepairSql).toContain(
      'v_watermark_occurred_at := v_event.occurred_at;',
    );
    expect(finalRepairSql).toContain(
      'v_watermark_event_id := v_event.event_id;',
    );
    expect(finalRepairSql).toContain(
      "buffered.membership_status in ('active', 'past_due', 'canceled', 'expired', 'revoked')",
    );
    expect(finalRepairSql).toContain('if v_buffered_event_type in (');
    expect(finalRepairSql).toContain("and not v_buffered_cancel_at_period_end) then");
    // Plan admission is a durable marker, not merely a preexisting binding.
    expect(finalRepairSql).toContain(
      'add column if not exists admitted_at timestamptz',
    );
    expect(finalRepairSql).toContain('add column if not exists admitted_plan_code text');
    expect(finalRepairSql).toContain('v_subscription.admitted_plan_code is distinct from p_plan_code');
    expect(finalRepairSql).toContain('admitted_plan_code = case');
    expect(finalRepairSql).toContain(
      "p_event_type in (\n           'membership_renewed', 'membership_reactivated', 'membership_restored'",
    );
    expect(finalRepairSql).toContain("v_buffered_event_type = 'membership_started'");
    // The period-end cutoff authority and the monotonic same-stream guard stay.
    expect(finalRepairSql).toContain(
      "v_period_end_terminal := p_event_type = 'membership_canceled' and p_cancel_at_period_end",
    );
    expect(finalRepairSql).toContain(
      'v_watermark_occurred_at := v_state.last_event_occurred_at;',
    );
    expect(finalRepairSql).toContain("return 'replayed'");
    expect(finalRepairSql).toContain("return 'stale'");
  });

  it('keeps the admission marker migration server-only, provider-neutral and lock-ordered', () => {
    const userLock = finalRepairSql.indexOf(
      'hashtextextended(p_user_id::text, 164)',
    );
    const streamLock = finalRepairSql.indexOf(
      "p_source_system || ':' || p_source_customer_id || ':' || p_source_subscription_id, 164",
    );
    const firstSubscriptionLock = finalRepairSql.indexOf(
      'from public.plus_membership_subscription',
    );
    expect(userLock).toBeGreaterThan(-1);
    expect(streamLock).toBeGreaterThan(-1);
    expect(firstSubscriptionLock).toBeGreaterThan(-1);
    expect(userLock).toBeLessThan(streamLock);
    expect(streamLock).toBeLessThan(firstSubscriptionLock);
    expect(finalRepairSql).toContain(
      'revoke all on function public.record_plus_membership_event',
    );
    expect(finalRepairSql).toContain(
      'grant execute on function public.record_plus_membership_event',
    );
    for (const identifier of [
      'paypal', 'ecpay', 'stripe', 'newebpay',
      'orders', 'payments', 'refunds', 'book_entitlement', 'book_entitlements',
    ]) {
      expect(finalRepairSql).not.toMatch(
        new RegExp(`\\b${identifier}\\b`, 'i'),
      );
    }
    expect(finalRepairSql).not.toMatch(
      /\/functions\/v1\/(?:checkout|[^\s/]*webhook)\b/i,
    );
  });

  it('adds pgTAP cases for both successor-terminal orders, the replacement watermark and inactive-plan admission', () => {
    for (const user of ['198', '199', '200', '201', '202', '203', '204', '205', '212', '213']) {
      expect(lifecyclePgTapSql).toContain(`50000000-0000-0000-0000-000000000${user}`);
    }
    expect(lifecyclePgTapSql).toContain(
      '#164 successor terminal forward delivery buffers the unselected C terminal before its start',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 successor terminal forward delivery folds the buffered terminal into C state',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 successor terminal reverse delivery applies the C terminal after its start',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 successor terminal forward delivery ends on its own confirmed successor',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 replacement watermark forward delivery folds the buffered failure on C ordering',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 replacement watermark reverse delivery resets the reducer clock to accepted C t15',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 replacement watermark arrival orders converge on one projection',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 terminal retires C while the stale terminal result leaves current A unchanged',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 inactive-plan admission rejects a start on a pending-created binding',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 inactive-plan admission still accepts period-end cancellation on an admitted binding',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 inactive-plan admission keeps the admitted stream clamped at the cutoff',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 inactive-plan admission enforces the period-end cutoff without an expiration event',
    );
    expectLifecycleTapPlans();
  });

  it('makes scheduled terminal authority, terminal-dominant buffered folds, and plan-specific admission structural invariants', () => {
    expect(finalRepairSql).toContain('v_retired_own_terminal_at := v_subscription.terminal_at');
    expect(finalRepairSql).toContain('v_retired_own_terminal_event_id := v_subscription.terminal_event_id');
    expect(finalRepairSql).toContain('buffered.event_type in (');
    expect(finalRepairSql).toContain("or (buffered.event_type = 'membership_canceled'");
    expect(finalRepairSql).toContain('order by (');
    expect(finalRepairSql).toContain('v_buffered_event_type in (');
    expect(finalRepairSql).toContain('admitted_plan_code = coalesce(bound.admitted_plan_code, activation.plan_code)');
    expect(finalRepairSql).toContain(
      "and (p_event_type <> 'membership_canceled' or v_period_end_terminal)",
    );
    expect(finalRepairSql).toContain('v_earliest_terminal_event_id text');
    expect(finalRepairSql).toContain('when terminal_event.event_type = \'membership_canceled\'');
    expect(finalRepairSql).toContain('or admitted_plan_code is distinct from p_plan_code');
    expect(finalRepairSql).toContain('or admitted_plan_code is distinct from v_buffered_plan_code');
    expect(lifecyclePgTapSql).toContain(
      '#164 admitted-plan transition advances the durable exact-plan marker',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 buffered-start admission delivery orders converge on the exact admitted plan',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 buffered-plan transition forward delivery advances the exact-plan marker',
    );
    expect(lifecyclePgTapSql).toContain(
      '#164 buffered-plan transition delivery orders converge on renewal admission evidence',
    );
    expect(finalRepairSql).toContain(
      'plus_membership_event_stream_occurred_at_event_id_idx',
    );
    expect(finalRepairSql).toContain(
      "'membership_started', 'membership_renewed',\n           'membership_reactivated', 'membership_restored'",
    );
    expect(finalRepairSql).toContain('returning * into v_subscription');
  });
});
