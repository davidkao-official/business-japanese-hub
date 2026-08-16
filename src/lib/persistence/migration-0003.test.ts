/**
 * Contract tests for supabase/migrations/0003_compliance_finance.sql — entitlement
 * migration (§9), extended grant_entitlement, and the compliance/finance surfaces
 * (#9 + #25).
 *
 * These parse the migration text and assert the security *intent*: the entitlement
 * shape is provider-neutral (relaxed provider CHECK, active/revoked lifecycle,
 * source order linkage), the grant write point stays service_role-only with the new
 * 8-arg signature, and every new compliance/finance table is server-only with no
 * client policy. They do not execute SQL; real enforcement is verified against a
 * deployed Supabase instance (see docs/payments/implementation-contract.md).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '0003_compliance_finance.sql'), 'utf8');

/** Policy command verbs (`all|select|insert|update|delete`) declared for a table. */
function policyCommandsFor(table: string): string[] {
  const commands: string[] = [];
  const re = new RegExp(`on public\\.${table}\\s+for (all|select|insert|update|delete)`, 'g');
  for (const match of sql.matchAll(re)) {
    commands.push(match[1]!);
  }
  return commands;
}

describe('migration 0003_compliance_finance — entitlement migration (§9)', () => {
  it('adds the provider-neutral lifecycle columns to book_entitlement', () => {
    expect(sql).toContain('add column if not exists source_order_id uuid references public.orders (id)');
    expect(sql).toContain("add column if not exists status text not null default 'active'");
    expect(sql).toContain('add column if not exists revoked_at timestamptz');
    expect(sql).toContain('add column if not exists revocation_reason text');
  });

  it('backfills existing grants to active', () => {
    expect(sql).toContain("update public.book_entitlement set status = 'active' where status is null");
  });

  it('relaxes the provider CHECK to the provider-neutral known set', () => {
    expect(sql).toContain('drop constraint if exists book_entitlement_provider_check');
    expect(sql).toContain("('manual', 'ecpay', 'newebpay', 'stripe', 'paypal')");
  });
});

describe('migration 0003_compliance_finance — grant_entitlement recreation', () => {
  const NEW_SIG = 'public.grant_entitlement(uuid, text, text, text, uuid, text, timestamptz, text)';

  it('drops the legacy 4-arg function so no stale write point survives', () => {
    expect(sql).toContain('drop function if exists public.grant_entitlement(uuid, text, text, text)');
  });

  it('declares the extended 8-arg signature with defaults', () => {
    expect(sql).toMatch(/create or replace function public\.grant_entitlement\(\s*p_user_id\s+uuid,/);
    expect(sql).toMatch(/p_source_order_id\s+uuid\s+default null/);
    expect(sql).toMatch(/p_status\s+text\s+default 'active'/);
    expect(sql).toMatch(/p_revoked_at\s+timestamptz\s+default null/);
    expect(sql).toMatch(/p_revocation_reason\s+text\s+default null/);
  });

  it('keeps EXECUTE service_role-only for the new signature', () => {
    expect(sql).toContain(`revoke all on function ${NEW_SIG} from public`);
    expect(sql).toContain(`revoke all on function ${NEW_SIG} from authenticated`);
    expect(sql).toContain(`grant execute on function ${NEW_SIG} to service_role`);
  });

  it('documents the ON CONFLICT provenance behavior', () => {
    // A non-NULL incoming provider_ref is the "legitimate refresh" signal;
    // otherwise existing provenance (provider_ref/source_order_id/granted_at) is kept.
    expect(sql).toMatch(/excluded\.provider_ref is not null/);
    expect(sql).toMatch(/book_entitlement\.granted_at/);
  });
});

describe('migration 0003_compliance_finance — compliance/finance tables (server-only)', () => {
  const SERVER_ONLY_TABLES = ['order_compliance', 'finance_roles', 'admin_audit_log', 'platform_tax_config'];

  it('enables RLS with NO client policy on each new table', () => {
    for (const table of SERVER_ONLY_TABLES) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(policyCommandsFor(table)).toEqual([]);
    }
  });

  it('revokes anon/authenticated/PUBLIC and grants only service_role', () => {
    for (const table of SERVER_ONLY_TABLES) {
      expect(sql).toContain(`revoke all on public.${table} from public`);
      expect(sql).toContain(`revoke all on public.${table} from anon`);
      expect(sql).toContain(`revoke all on public.${table} from authenticated`);
    }
    expect(sql).toContain('grant select, insert on public.order_compliance to service_role');
    expect(sql).toContain('grant select on public.finance_roles to service_role');
    expect(sql).toContain('grant select, insert on public.admin_audit_log to service_role');
    expect(sql).toContain('grant select, insert, update on public.platform_tax_config to service_role');
  });

  it('seeds Japan consumption-tax status fail-closed to unresolved (never taxable)', () => {
    expect(sql).toContain("('japan_consumption_tax_status', 'unresolved')");
    // The seed must never insert 'taxable' as the initial value.
    expect(sql).not.toMatch(/values\s*\(\s*'japan_consumption_tax_status'\s*,\s*'taxable'\s*\)/);
  });

  it('enforces the finance role vocabulary and one-record-per-order compliance', () => {
    expect(sql).toContain("check (role in ('finance_viewer', 'finance_admin'))");
    expect(sql).toContain('unique (order_id)');
    expect(sql).toContain("check (jurisdiction in ('TW', 'JP'))");
  });
});
