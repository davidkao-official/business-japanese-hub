import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260822175000_finance_status_counts.sql'),
  'utf8',
);

describe('finance status counts migration', () => {
  it('counts every actionable status from the complete ledgers', () => {
    expect(sql).toMatch(/create or replace function public\.finance_status_counts\(\)/i);
    expect(sql).toMatch(/from public\.payment_events where processing_result is null/i);
    expect(sql).toMatch(/from public\.refunds where status = 'failed'/i);
    expect(sql).toMatch(/from public\.order_email_outbox where status in \('pending', 'retry'\)/i);
    expect(sql).not.toMatch(/\blimit\b/i);
  });

  it('keeps exact financial counts server-only', () => {
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/revoke all on function public\.finance_status_counts\(\) from authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.finance_status_counts\(\) to service_role/i);
  });
});
