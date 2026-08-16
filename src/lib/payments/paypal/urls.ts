/**
 * PayPal REST API base URLs (decision-record §16 / §21).
 *
 * Sandbox and production endpoints / credentials must never be mixed.
 * `resolvePaypalEnv` returns ONE environment's base URL; an absent env value
 * fails closed to sandbox (never an ambiguous hybrid).
 */

export interface PaypalUrls {
  /** API base (OAuth + Orders v2 + webhook verification + reporting). */
  apiBase: string;
  /** Buyer-facing approval base (the approve link points here). */
  checkoutBase: string;
}

export type PaypalEnv = 'sandbox' | 'prod';

export const PAYPAL_URLS: Record<PaypalEnv, PaypalUrls> = {
  sandbox: {
    apiBase: 'https://api-m.sandbox.paypal.com',
    checkoutBase: 'https://www.sandbox.paypal.com',
  },
  prod: {
    apiBase: 'https://api-m.paypal.com',
    checkoutBase: 'https://www.paypal.com',
  },
};

/**
 * Resolve the URL set for an environment. `undefined` (env not configured) is
 * treated as sandbox — the safe, non-mixing default; production is only ever
 * selected by an explicit `'prod'`.
 */
export function resolvePaypalEnv(env: PaypalEnv | undefined): PaypalUrls {
  return env === 'prod' ? PAYPAL_URLS.prod : PAYPAL_URLS.sandbox;
}
