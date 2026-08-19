import { describe, expect, it } from 'vitest';
import {
  EcpayConfigurationUnavailableError,
  createEcpayAdapterSafely,
  isEcpayConfigured,
} from './ecpay.ts';
import { testEnv } from './testing.ts';

describe('ECPay provider-scoped configuration', () => {
  it('returns a fail-closed adapter without throwing at cold start', async () => {
    const env = testEnv({ ecpayMerchantId: undefined, ecpayHashKey: undefined, ecpayHashIV: undefined });
    expect(isEcpayConfigured(env)).toBe(false);
    const adapter = createEcpayAdapterSafely(env);
    await expect(adapter.reconcile({ from: '2026-08-15', to: '2026-08-16' })).rejects.toBeInstanceOf(
      EcpayConfigurationUnavailableError,
    );
  });
});
