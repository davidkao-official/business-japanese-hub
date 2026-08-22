import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260822173000_financial_fact_immutability.sql'),
  'utf8',
);

describe('financial fact immutability migration', () => {
  it('locks Payment identity, price, provider references, and settled timestamp after capture', () => {
    expect(sql).toMatch(/payments_immutable_facts_check/);
    expect(sql).toMatch(/old\.amount_minor is distinct from new\.amount_minor/i);
    expect(sql).toMatch(/old\.provider_checkout_ref is not null/i);
    expect(sql).toMatch(/old\.provider_payment_ref is not null/i);
    expect(sql).toMatch(/old\.paid_at is not null/i);
  });

  it('locks Refund identity, full amount, provider reference, and completion timestamp', () => {
    expect(sql).toMatch(/refunds_immutable_facts_check/);
    expect(sql).toMatch(/old\.payment_id is distinct from new\.payment_id/i);
    expect(sql).toMatch(/old\.provider_refund_ref is not null/i);
    expect(sql).toMatch(/old\.completed_at is not null/i);
    expect(sql).toMatch(/old\.status = 'succeeded' and new\.status <> 'succeeded'/i);
    expect(sql).toMatch(/old\.status = 'failed' and new\.status in \('requested', 'processing'\)/i);
  });

  it('keeps both trigger functions unreachable from browser roles', () => {
    expect(sql).toMatch(/revoke all on function public\.payments_immutable_facts_check\(\) from authenticated/i);
    expect(sql).toMatch(/revoke all on function public\.refunds_immutable_facts_check\(\) from authenticated/i);
  });
});
