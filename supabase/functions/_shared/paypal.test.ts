import { describe, expect, it } from 'vitest';
import {
  PaypalConfigurationUnavailableError,
  createPaypalAdapterSafely,
  isPaypalConfigured,
} from './paypal.ts';
import { testEnv } from './testing.ts';

describe('PayPal provider-scoped configuration', () => {
  it('rejects sandbox credentials in production and any unresolved deployment identity', async () => {
    const productionSandbox = testEnv({ deploymentEnv: 'production', paypalEnv: 'sandbox' });
    const unresolved = testEnv({ deploymentEnv: undefined, paypalEnv: 'prod' });

    expect(isPaypalConfigured(productionSandbox)).toBe(false);
    expect(isPaypalConfigured(unresolved)).toBe(false);
    await expect(
      createPaypalAdapterSafely(productionSandbox).reconcile({ from: '2026-08-15', to: '2026-08-16' }),
    ).rejects.toBeInstanceOf(PaypalConfigurationUnavailableError);
  });

  it('accepts only a provider environment aligned with the deployment', () => {
    expect(isPaypalConfigured(testEnv({ deploymentEnv: 'production', paypalEnv: 'prod' }))).toBe(true);
    expect(isPaypalConfigured(testEnv({ deploymentEnv: 'staging', paypalEnv: 'sandbox' }))).toBe(true);
  });
});
