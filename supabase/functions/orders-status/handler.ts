/**
 * Order-status handler — `GET /functions/v1/orders-status/:orderId/status`
 * (verify_jwt=true; decision-record §3.4/§3.5).
 *
 * Returns ONLY the local authoritative order/payment state. Authorization is the
 * ownership check `order.user_id === auth.uid()` — the opaque order id is NOT
 * authorization. The JWT is verified server-side via `auth.getUser`; the
 * platform `verify_jwt` gate is defense in depth, not the only check.
 */
import type {
  JapanConsumptionTaxStatus,
  Jurisdiction,
  OrderStatusResponse,
  PaymentProvider,
} from '../../../src/lib/payments/contract.ts';
import type { DbClient } from '../_shared/db.ts';
import type { Logger } from '../_shared/log.ts';
import {
  forbidden,
  headerValue,
  jsonResult,
  methodNotAllowed,
  notFound,
  pathnameOf,
  unauthorized,
  type HandlerRequest,
  type HandlerResult,
} from '../_shared/http.ts';
import { authenticateBearer } from '../_shared/auth.ts';
import { loadLatestPaymentForOrder, loadOrder, type OrderRow, type PaymentRow } from '../_shared/flow.ts';

export interface OrderStatusHandlerDeps {
  db: DbClient;
  log: Logger;
}

const ORDER_STATUS_PATH = /\/orders-status\/([^/]+)\/status$/;

export async function handleOrderStatus(
  req: HandlerRequest,
  deps: OrderStatusHandlerDeps,
): Promise<HandlerResult> {
  if (req.method !== 'GET') return methodNotAllowed('GET');

  const match = ORDER_STATUS_PATH.exec(pathnameOf(req.url));
  const orderId = match ? decodeURIComponent(match[1]) : null;
  if (!orderId) return notFound('order id missing in path');

  const uid = await authenticateBearer(deps.db, headerValue(req.headers, 'authorization'));
  if (!uid) return unauthorized();

  let order: OrderRow | null;
  try {
    order = await loadOrder(deps.db, orderId);
  } catch (err) {
    deps.log.error({ error: err instanceof Error ? err.message : String(err) }, 'order lookup failed');
    return jsonResult(502, { error: 'order lookup failed' });
  }
  if (!order) return notFound('order not found');
  // Opaque id is NOT authorization — the owner must match the verified session.
  if (order.user_id !== uid) return forbidden('not your order');

  let payment: PaymentRow | null = null;
  try {
    payment = await loadLatestPaymentForOrder(deps.db, orderId);
  } catch (err) {
    deps.log.error({ error: err instanceof Error ? err.message : String(err) }, 'payment lookup failed');
    return jsonResult(502, { error: 'payment lookup failed' });
  }

  // The receipt's tax/jurisdiction display comes ONLY from this immutable
  // order snapshot (never the live platform_tax_config / client / currency).
  // Missing/unknown/corrupted values fail closed to 'unresolved' so the
  // response never violates the OrderStatusResponse contract.
  const jurisdiction: Jurisdiction =
    order.jurisdiction === 'TW' || order.jurisdiction === 'JP' ? order.jurisdiction : 'unresolved';
  const japanConsumptionTaxStatus: JapanConsumptionTaxStatus =
    order.japan_tax_status_snapshot === 'taxable' || order.japan_tax_status_snapshot === 'exempt'
      ? order.japan_tax_status_snapshot
      : 'unresolved';

  const response: OrderStatusResponse = {
    orderId: order.id,
    status: order.status,
    paymentStatus: payment?.status ?? null,
    bookId: order.book_id,
    itemName: order.item_name_snapshot,
    amount: { amount: Number(order.amount_minor), currency: order.currency },
    paidAt: order.paid_at,
    paymentProvider:
      payment?.provider === 'ecpay' || payment?.provider === 'paypal'
        ? (payment.provider as PaymentProvider)
        : null,
    paymentMethod:
      payment?.method === 'credit' || payment?.method === 'paypal'
        ? payment.method
        : null,
    deliveryMethod: 'library',
    deliveryStatus:
      order.status === 'paid' ? 'available' : order.status === 'refunded' ? 'revoked' : 'pending',
    compliance: { jurisdiction, japanConsumptionTaxStatus },
  };
  return jsonResult(200, response);
}
