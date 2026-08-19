import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260819212459_payment_atomicity_and_paypal_correlation.sql',
  ),
  'utf8',
);

const SUCCESS_FN =
  'public.finalize_payment_success(uuid, text, timestamptz, text)';
const REFUND_FN =
  'public.finalize_refund_success(uuid, uuid, text, text, timestamptz)';

describe('payment atomicity and PayPal correlation migration', () => {
  it('preserves the provider checkout reference separately from the capture reference', () => {
    expect(sql).toMatch(/add column if not exists provider_checkout_ref text/);
    expect(sql).toMatch(/payments_provider_checkout_ref_uidx/);
  });

  it('atomically serializes success on the payment and order rows', () => {
    expect(sql).toMatch(/create or replace function public\.finalize_payment_success/);
    expect(sql).toMatch(/from public\.payments[\s\S]*for update/);
    expect(sql).toMatch(/from public\.orders[\s\S]*for update/);
    expect(sql).toContain('public.grant_entitlement');
    expect(sql).toMatch(/p_provider_ref\s*=>\s*null/);
    expect(sql).toContain("status = 'duplicate_success'");
  });

  it('atomically records and applies provider-confirmed refunds', () => {
    expect(sql).toMatch(/create or replace function public\.finalize_refund_success/);
    expect(sql).toMatch(/insert into public\.refunds/);
    expect(sql).toContain("status = 'refunded'");
    expect(sql).toContain("revocation_reason = 'refund'");
    expect(sql).toMatch(/v_refund\.provider <> v_payment\.provider/);
    expect(sql).toMatch(/v_refund\.amount_minor <> v_payment\.amount_minor/);
    expect(sql).toMatch(/v_refund\.currency <> v_payment\.currency/);
  });

  it('keeps both financial RPCs service-role-only', () => {
    for (const fn of [SUCCESS_FN, REFUND_FN]) {
      expect(sql).toContain(`revoke all on function ${fn} from public`);
      expect(sql).toContain(`revoke all on function ${fn} from anon`);
      expect(sql).toContain(`revoke all on function ${fn} from authenticated`);
      expect(sql).toContain(`grant execute on function ${fn} to service_role`);
    }
  });
});
