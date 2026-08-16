/**
 * PayPal approval browser-return handler — `GET /functions/v1/paypal-browser-return`
 * (verify_jwt=false).
 *
 * Browser navigation ONLY (decision-record §3.2 analog for PayPal, §21): PayPal
 * redirects the browser here after approval (query params `token` = order id /
 * `PayerID`). This endpoint NEVER modifies Order / Payment / Entitlement — the
 * authoritative state comes only from the server webhook + capture confirmation.
 * It maps the PayPal order id (stored at checkout as `provider_payment_ref`) to
 * the local order and 303-redirects to the SPA result page, which polls the
 * server order status.
 */
import type { Env } from '../_shared/env.ts';
import type { DbClient } from '../_shared/db.ts';
import type { Logger } from '../_shared/log.ts';
import {
  methodNotAllowed,
  redirectResult,
  type HandlerRequest,
  type HandlerResult,
} from '../_shared/http.ts';
import { loadPaymentByProviderPaymentRef } from '../_shared/flow.ts';

export interface PaypalBrowserReturnHandlerDeps {
  env: Env;
  db: DbClient;
  log: Logger;
}

export async function handlePaypalBrowserReturn(
  req: HandlerRequest,
  deps: PaypalBrowserReturnHandlerDeps,
): Promise<HandlerResult> {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed('GET, POST');

  const url = new URL(req.url);
  // PayPal appends `token` (the order id) and `PayerID` on the approval return.
  const orderToken = url.searchParams.get('token');

  deps.log.info(
    { orderToken: orderToken ?? null, cancelled: url.searchParams.get('cancel') !== null },
    'paypal browser return received (diagnostics only; no state mutation)',
  );

  // Map the PayPal order id → local order id (read-only). Unknown → still redirect.
  let orderId: string | null = null;
  if (orderToken) {
    try {
      const payment = await loadPaymentByProviderPaymentRef(deps.db, 'paypal', orderToken);
      orderId = payment?.order_id ?? null;
    } catch {
      orderId = null;
    }
  }

  const target = `/purchase/result${orderId ? `?order=${encodeURIComponent(orderId)}` : ''}`;
  return redirectResult(target, 303);
}
