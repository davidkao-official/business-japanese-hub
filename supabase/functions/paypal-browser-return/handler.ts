/**
 * PayPal browser-return endpoint — GET, navigation only.
 *
 * The local order id was embedded by the server in the PayPal return/cancel URL.
 * This endpoint NEVER mutates payment/order/entitlement state and never treats
 * query parameters as payment truth. The SPA result page polls the authenticated
 * local orders-status endpoint for authoritative state.
 */
import { methodNotAllowed, redirectResult, type HandlerRequest, type HandlerResult } from '../_shared/http.ts';

export function handlePaypalBrowserReturn(req: HandlerRequest): HandlerResult {
  if (req.method !== 'GET') return methodNotAllowed('GET');

  let orderId: string | null = null;
  try {
    orderId = new URL(req.url).searchParams.get('order');
  } catch {
    orderId = null;
  }
  const target = `/purchase/result${orderId ? `?order=${encodeURIComponent(orderId)}` : ''}`;
  return redirectResult(target, 303);
}
