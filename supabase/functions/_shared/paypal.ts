/** Server-only PayPal adapter wiring shared by checkout/webhook/refund boundaries. */
import { PaypalPaymentProviderAdapter } from '../../../src/lib/payments/paypal/adapter.ts';
import type { Env } from './env.ts';

/**
 * Build the USD adapter only when the complete credential set exists. Partial
 * configuration fails closed to `null`; secrets never leave this boundary.
 */
export function createPaypalAdapter(env: Env): PaypalPaymentProviderAdapter | null {
  if (!env.paypalClientId || !env.paypalClientSecret || !env.paypalWebhookId) return null;
  return new PaypalPaymentProviderAdapter({
    clientId: env.paypalClientId,
    clientSecret: env.paypalClientSecret,
    webhookId: env.paypalWebhookId,
    env: env.paypalEnv === 'prod' ? 'prod' : 'sandbox',
  });
}
