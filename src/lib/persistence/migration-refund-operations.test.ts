import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260822172000_refund_operations_atomicity.sql'),
  'utf8',
);

describe('refund operations atomicity migration', () => {
  it('allows only one canonical full-refund fact per Payment', () => {
    expect(sql).toMatch(/create unique index refunds_payment_uidx\s+on public\.refunds \(payment_id\)/);
  });

  it('creates refund request and audit inside one service-role-only RPC', () => {
    expect(sql).toMatch(/create or replace function public\.request_full_refund\(/);
    expect(sql).toContain("v_payment.status not in ('succeeded', 'duplicate_success')");
    expect(sql).toMatch(/insert into public\.refunds[\s\S]*?returning \* into v_refund/);
    expect(sql).toMatch(/insert into public\.admin_audit_log[\s\S]*?'refund\.requested'/);
    expect(sql).toMatch(/entity_type, entity_id[\s\S]*?'refund', v_refund\.id::text/);
  });

  it('makes finance confirmation and its audit one transaction', () => {
    expect(sql).toMatch(/create or replace function public\.finalize_refund_success_audited\(/);
    expect(sql).toContain('public.finalize_refund_success(');
    expect(sql).toMatch(/insert into public\.admin_audit_log[\s\S]*?'refund\.confirmed'/);
  });

  it('fails a primary refund transaction unless exactly one entitlement is revoked', () => {
    expect(sql).toContain('rename to finalize_refund_success_unchecked');
    expect(sql).toMatch(/select count\(\*\)[\s\S]*?status = 'revoked'/);
    expect(sql).toContain("if v_revoked_count <> 1 then");
  });

  it.each([
    ['request_full_refund', 'uuid,uuid,text'],
    ['finalize_refund_success_audited', 'uuid,uuid,text,text,timestamptz,uuid'],
  ])('keeps %s service-role-only', (name, signature) => {
    const fn = `public.${name}(${signature})`;
    expect(sql).toContain(`revoke all on function ${fn} from public`);
    expect(sql).toContain(`revoke all on function ${fn} from anon`);
    expect(sql).toContain(`revoke all on function ${fn} from authenticated`);
    expect(sql).toContain(`grant execute on function ${fn} to service_role`);
  });
});
