/**
 * `readEnvFrom` contract tests (#21): PayPal credentials are OPTIONAL — an
 * ECPay-only deployment must boot without them, and they are parsed when
 * present. `PAYPAL_*` presence is enforced only at the provider-seam boundary
 * (`isPaypalConfigured` / the adapter factories), never here.
 */
import { describe, expect, it } from 'vitest';
import { readEnvFrom, type Env, type EnvReader } from './env.ts';

const BASE: Record<string, string> = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  ECPAY_MERCHANT_ID: '2000132',
  ECPAY_HASH_KEY: 'hash-key',
  ECPAY_HASH_IV: 'hash-iv',
  ECPAY_ENV: 'stage',
};

function readerFrom(values: Record<string, string>): EnvReader {
  return {
    get: (key: string) => values[key],
  };
}

describe('readEnvFrom — provider-scoped config seam (#21)', () => {
  it('boots an ECPay-only environment with NO PayPal variables (no throw; PayPal fields undefined)', () => {
    const env: Env = readEnvFrom(readerFrom(BASE));
    expect(env.supabaseUrl).toBe('https://test.supabase.co');
    expect(env.ecpayMerchantId).toBe('2000132');
    expect(env.paypalClientId).toBeUndefined();
    expect(env.paypalClientSecret).toBeUndefined();
    expect(env.paypalWebhookId).toBeUndefined();
  });

  it('parses PayPal variables when present', () => {
    const env: Env = readEnvFrom(
      readerFrom({ ...BASE, PAYPAL_CLIENT_ID: 'cid', PAYPAL_CLIENT_SECRET: 'csec', PAYPAL_WEBHOOK_ID: 'wh', PAYPAL_ENV: 'sandbox' }),
    );
    expect(env.paypalClientId).toBe('cid');
    expect(env.paypalClientSecret).toBe('csec');
    expect(env.paypalWebhookId).toBe('wh');
    expect(env.paypalEnv).toBe('sandbox');
  });

  it('still fails closed on a missing REQUIRED Supabase/ECPay variable even with PayPal set', () => {
    expect(() => readEnvFrom(readerFrom({ ...BASE, ECPAY_MERCHANT_ID: '' }))).toThrow(/Missing required environment variable: ECPAY_MERCHANT_ID/);
  });
});
