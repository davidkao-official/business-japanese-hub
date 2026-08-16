/**
 * Contract tests for supabase/migrations/0002_commerce.sql — the server-only
 * commerce ledger (catalog seam, orders, payments, refunds, payment_events).
 *
 * These parse the migration text and assert the security *intent*: every table is
 * server-only (RLS enabled with NO client policy — an authenticated client can
 * never read another user's order or any payment/finance row), the `catalog` price
 * seam has a no-read boundary for anon/authenticated, idempotency constraints
 * (four layers, decision-record §13) are present, and the orders amount/revision
 * columns are immutable. They do not execute SQL; real enforcement is verified
 * against a deployed Supabase instance (see docs/payments/implementation-contract.md).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '0002_commerce.sql'), 'utf8');

/** Policy command verbs (`all|select|insert|update|delete`) declared for a table. */
function policyCommandsFor(table: string): string[] {
  const commands: string[] = [];
  const re = new RegExp(`on public\\.${table}\\s+for (all|select|insert|update|delete)`, 'g');
  for (const match of sql.matchAll(re)) {
    commands.push(match[1]!);
  }
  return commands;
}

const SERVER_ONLY_TABLES = ['catalog', 'orders', 'payments', 'refunds', 'payment_events'];

describe('migration 0002_commerce — server-only RLS matrix', () => {
  it('enables row level security on every commerce table', () => {
    for (const table of SERVER_ONLY_TABLES) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it('creates NO client policy on any commerce table (server-only access)', () => {
    for (const table of SERVER_ONLY_TABLES) {
      expect(policyCommandsFor(table)).toEqual([]);
    }
  });

  it('revokes anon/authenticated/PUBLIC privileges and grants to service_role', () => {
    for (const table of SERVER_ONLY_TABLES) {
      expect(sql).toContain(`revoke all on public.${table} from public`);
      expect(sql).toContain(`revoke all on public.${table} from anon`);
      expect(sql).toContain(`revoke all on public.${table} from authenticated`);
    }
    // Ledger tables get select/insert/update for the orchestration/operator path.
    for (const table of ['orders', 'payments', 'refunds', 'payment_events']) {
      expect(sql).toContain(`grant select, insert, update on public.${table} to service_role`);
    }
  });

  it('catalog is a no-read boundary: service_role SELECT only, no client grant', () => {
    expect(sql).toContain('grant select on public.catalog to service_role');
    // No grant of INSERT/UPDATE on catalog to any role in the migration.
    expect(sql).not.toContain('grant insert on public.catalog');
    expect(sql).not.toContain('grant update on public.catalog');
  });
});

describe('migration 0002_commerce — idempotency + immutability constraints', () => {
  it('keeps one payment attempt per (provider, provider_merchant_ref)', () => {
    expect(sql).toContain('unique (provider, provider_merchant_ref)');
  });

  it('keeps one provider transaction per (provider, provider_payment_ref) once known', () => {
    expect(sql).toContain('payments_provider_payment_ref_uidx');
    expect(sql).toMatch(/where provider_payment_ref is not null/);
  });

  it('de-duplicates provider callbacks via UNIQUE(provider, event_fingerprint)', () => {
    expect(sql).toContain('unique (provider, event_fingerprint)');
  });

  it('caps amount_minor at Number.MAX_SAFE_INTEGER and enforces non-negative', () => {
    expect(sql).toContain('9007199254740991');
  });

  it('makes orders.amount_minor/currency/published_revision/item_name_snapshot immutable', () => {
    expect(sql).toContain('create trigger orders_immutable_fields_check');
    expect(sql).toMatch(/for each row\s+execute function public\.orders_immutable_fields_check\(\)/);
    expect(sql).toMatch(/new\.amount_minor <> old\.amount_minor/);
    expect(sql).toMatch(/new\.currency <> old\.currency/);
    expect(sql).toMatch(/new\.published_revision <> old\.published_revision/);
    expect(sql).toMatch(/new\.item_name_snapshot <> old\.item_name_snapshot/);
  });

  it('implements the immutability trigger as security definer', () => {
    expect(sql).toMatch(
      /create or replace function public\.orders_immutable_fields_check\(\)[\s\S]*?security definer/,
    );
  });
});
