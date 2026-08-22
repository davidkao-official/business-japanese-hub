/**
 * PayPal adapter factory for the Edge Functions (§3.5 / §21).
 *
 * The adapter is built from `Env` at the Deno boundary and injected into the
 * pure handlers (tests inject fakes). Secrets never cross the handler/log
 * boundary.
 *
 * CONFIG SEAM (#21): PayPal credentials are OPTIONAL in `Env` — an ECPay-only
 * deployment must keep serving TWD without them. `createPaypalAdapterSafely`
 * returns a real adapter when configured, or a fail-closed stub whose every
 * method throws `PaypalConfigurationUnavailableError` otherwise. The checkout
 * seam refuses USD before creating any Order/Payment row when PayPal is not
 * configured; the PayPal webhook fails closed (503) without its config.
 */
import { PaypalPaymentProviderAdapter } from '../../../src/lib/payments/paypal/adapter.ts';
import type { PaymentProviderAdapter } from '../../../src/lib/payments/contract.ts';
import { isProviderEnvironmentAligned, type Env } from './env.ts';

/** Thrown when a PayPal operation is requested but required config is absent. */
export class PaypalConfigurationUnavailableError extends Error {
  constructor() {
    super('PayPal is not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET / PAYPAL_WEBHOOK_ID)');
    this.name = 'PaypalConfigurationUnavailableError';
  }
}

/** True when all required PayPal server-side config is present. */
export function isPaypalConfigured(env: Env): boolean {
  return Boolean(
    env.paypalClientId &&
      env.paypalClientSecret &&
      env.paypalWebhookId &&
      isProviderEnvironmentAligned(env.deploymentEnv, env.paypalEnv, 'prod', 'sandbox'),
  );
}

/**
 * Build a real PayPal adapter. Throws `PaypalConfigurationUnavailableError` when
 * the required config is absent — callers that require a real adapter use this;
 * callers that must boot without PayPal use `createPaypalAdapterSafely`.
 */
export function createPaypalAdapter(env: Env): PaypalPaymentProviderAdapter {
  if (!isPaypalConfigured(env)) {
    throw new PaypalConfigurationUnavailableError();
  }
  return new PaypalPaymentProviderAdapter({
    clientId: env.paypalClientId as string,
    clientSecret: env.paypalClientSecret as string,
    webhookId: env.paypalWebhookId as string,
    env: env.paypalEnv,
  });
}

/**
 * A fail-closed stub for ECPay-only deployments: every adapter method throws
 * `PaypalConfigurationUnavailableError`. Keeps `ProviderAdapters` type-complete
 * so `createProviderAdapters` never throws at cold start.
 */
export function createUnavailablePaypalAdapter(): PaymentProviderAdapter {
  const fail = (): never => {
    throw new PaypalConfigurationUnavailableError();
  };
  return {
    createCheckout: async () => fail(),
    verifyCallback: async () => fail(),
    confirmPayment: async () => fail(),
    refund: async () => fail(),
    reconcile: async () => fail(),
  };
}

/** Real adapter when configured; fail-closed stub otherwise (never throws at build). */
export function createPaypalAdapterSafely(env: Env): PaymentProviderAdapter {
  return isPaypalConfigured(env) ? createPaypalAdapter(env) : createUnavailablePaypalAdapter();
}
