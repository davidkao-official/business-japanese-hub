import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260822170000_entitlement_lifecycle_hardening.sql'),
  'utf8',
);

describe('active entitlement RLS hardening', () => {
  it('replaces the owner policy with an active-only ownership policy', () => {
    expect(sql).toContain('drop policy if exists "book_entitlement_own_select"');
    expect(sql).toMatch(
      /for select to authenticated\s+using \(auth\.uid\(\) = user_id and status = 'active'\)/,
    );
  });

  it('does not add any entitlement write policy', () => {
    expect(sql).not.toMatch(/for (insert|update|delete|all) to (anon|authenticated)/);
  });

  it('rebinds entitlement provenance when a refunded book is purchased again', () => {
    expect(sql).toMatch(
      /source_order_id\s*=\s*case when excluded\.provider = 'manual'[\s\S]*?then excluded\.source_order_id[\s\S]*?when excluded\.source_order_id is not null[\s\S]*?then excluded\.source_order_id/,
    );
    expect(sql).toMatch(
      /granted_at\s*=\s*case when excluded\.provider = 'manual'\s+or excluded\.provider_ref is not null\s+or excluded\.source_order_id is not null/,
    );
  });

  it('keeps the entitlement write point service-role-only', () => {
    const fn = 'public.grant_entitlement(uuid, text, text, text, uuid, text, timestamptz, text)';
    expect(sql).toContain(`revoke all on function ${fn} from public`);
    expect(sql).toContain(`revoke all on function ${fn} from anon`);
    expect(sql).toContain(`revoke all on function ${fn} from authenticated`);
    expect(sql).toContain(`grant execute on function ${fn} to service_role`);
  });
});
