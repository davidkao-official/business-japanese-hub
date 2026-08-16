/**
 * Contract tests for supabase/migrations/0005_compliance_snapshot.sql — the
 * immutable consumer-jurisdiction + Japan tax-status snapshot on the Order
 * (#25 remediation).
 *
 * These parse the migration text and assert the security/compliance *intent*:
 * the Order carries a NOT NULL, CHECK-constrained jurisdiction + Japan
 * consumption-tax snapshot, and both are locked by the extended
 * `orders_immutable_fields_check` trigger so a later platform_tax_config change
 * can never rewrite a historical order's snapshot. They do not execute SQL; real
 * enforcement is verified against a deployed Supabase instance (see
 * docs/payments/implementation-contract.md).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '0005_compliance_snapshot.sql'), 'utf8');

describe('migration 0005_compliance_snapshot — order compliance snapshot', () => {
  it('adds NOT NULL jurisdiction + Japan tax-status snapshot columns to orders', () => {
    expect(sql).toContain('add column if not exists jurisdiction text');
    expect(sql).toContain('add column if not exists japan_tax_status_snapshot text');
    expect(sql).toContain('alter column jurisdiction set not null');
    expect(sql).toContain('alter column japan_tax_status_snapshot set not null');
  });

  it('enforces the jurisdiction + tax-status vocabularies with CHECK constraints', () => {
    expect(sql).toContain("check (jurisdiction in ('TW', 'JP', 'unresolved'))");
    expect(sql).toContain("check (japan_tax_status_snapshot in ('unresolved', 'taxable', 'exempt'))");
  });

  it('backfills pre-existing rows fail-closed to unresolved', () => {
    expect(sql).toContain("update public.orders set jurisdiction = 'unresolved' where jurisdiction is null");
    expect(sql).toContain(
      "update public.orders set japan_tax_status_snapshot = 'unresolved' where japan_tax_status_snapshot is null",
    );
  });

  it('locks jurisdiction + tax snapshot in the immutability trigger (no config rewrite of history)', () => {
    expect(sql).toContain('create or replace function public.orders_immutable_fields_check()');
    expect(sql).toMatch(/new\.jurisdiction <> old\.jurisdiction/);
    expect(sql).toMatch(/new\.japan_tax_status_snapshot <> old\.japan_tax_status_snapshot/);
    expect(sql).toContain('drop trigger if exists orders_immutable_fields_check on public.orders');
    expect(sql).toContain('create trigger orders_immutable_fields_check');
  });

  it('keeps the immutability trigger security definer', () => {
    expect(sql).toMatch(
      /create or replace function public\.orders_immutable_fields_check\(\)[\s\S]*?security definer/,
    );
  });
});
