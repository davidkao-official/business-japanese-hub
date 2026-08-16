/**
 * PayPal adapter factory for the Edge Functions (§3.5 / §21).
 *
 * The adapter is built from `Env` at the Deno boundary and injected into the
 * pure handlers (tests inject fakes). Secrets never cross the handler/log
 * boundary.
 */
import { PaypalPaymentProviderAdapter } from '../../../src/lib/payments/paypal/adapter.ts';
import type { Env } from './env.ts';

export function createPaypalAdapter(env: Env): PaypalPaymentProviderAdapter {
  return new PaypalPaymentProviderAdapter({
    clientId: env.paypalClientId,
    clientSecret: env.paypalClientSecret,
    webhookId: env.paypalWebhookId,
    env: env.paypalEnv,
  });
}
