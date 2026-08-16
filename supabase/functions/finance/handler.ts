/**
 * Finance Edge Function handler — `GET/POST /functions/v1/finance`
 * (verify_jwt=true, finance role required; decision-record §14).
 *
 * Authorization is server-enforced from the `finance_roles` table (read via the
 * service-role client) — a client-claimed role is NEVER trusted.
 *
 * - `GET` → authorized read model: orders, payments, refunds, entitlement
 *   outcomes, reconciliation summary. Any finance role may read.
 * - `POST { action: 'request_refund', paymentId, reasonCode? }` → finance_admin
 *   only; MVP manual-refund flow: writes a `refunds` row (status 'requested',
 *   full amount) + an `admin_audit_log` entry.
 */
import { fetchFinanceRole } from '../_shared/finance-role.ts';
import type { DbClient } from '../_shared/db.ts';
import type { Logger } from '../_shared/log.ts';
import {
  badRequest,
  forbidden,
  headerValue,
  jsonResult,
  methodNotAllowed,
  notFound,
  unauthorized,
  type HandlerRequest,
  type HandlerResult,
} from '../_shared/http.ts';
import { authenticateBearer } from '../_shared/auth.ts';
import { confirmRefund, loadPaymentById, type PaymentRow } from '../_shared/flow.ts';

export interface FinanceHandlerDeps {
  db: DbClient;
  log: Logger;
  now?: () => Date;
}

export async function handleFinance(
  req: HandlerRequest,
  deps: FinanceHandlerDeps,
): Promise<HandlerResult> {
  const uid = await authenticateBearer(deps.db, headerValue(req.headers, 'authorization'));
  if (!uid) return unauthorized();

  const role = await fetchFinanceRole(deps.db, uid);
  if (!role) return forbidden('finance role required');

  if (req.method === 'GET') {
    return await buildFinanceReadModel(deps);
  }
  if (req.method === 'POST') {
    if (role !== 'finance_admin') return forbidden('finance_admin role required');
    return await handleFinanceAction(req, deps, uid);
  }
  return methodNotAllowed('GET, POST');
}

/* ------------------------------------------------------------------------- *
 * GET — authorized read model (§14)
 * ------------------------------------------------------------------------- */

interface ReadModelResult {
  generatedAt: string;
  orders: unknown[];
  payments: unknown[];
  refunds: unknown[];
  entitlements: unknown[];
  reconciliation: {
    matched: number;
    mismatched: number;
    pendingVerification: number;
    succeeded: number;
    failed: number;
  };
}

async function buildFinanceReadModel(deps: FinanceHandlerDeps): Promise<HandlerResult> {
  const now = deps.now ?? (() => new Date());
  const [orders, payments, refunds, entitlements] = await Promise.all([
    deps.db.from('orders').select('*').order('created_at', { ascending: false }).limit(200),
    deps.db.from('payments').select('*').order('created_at', { ascending: false }).limit(500),
    deps.db.from('refunds').select('*').order('requested_at', { ascending: false }).limit(200),
    deps.db.from('book_entitlement').select('*').limit(500),
  ]);
  for (const [name, res] of [
    ['orders', orders],
    ['payments', payments],
    ['refunds', refunds],
    ['entitlements', entitlements],
  ] as const) {
    if (res.error) {
      deps.log.error({ error: res.error.message }, `${name} read failed`);
      return jsonResult(502, { error: `${name} read failed` });
    }
  }
  const paymentsData = (payments.data ?? []) as Array<Record<string, unknown>>;
  const model: ReadModelResult = {
    generatedAt: now().toISOString(),
    orders: (orders.data ?? []) as unknown[],
    payments: paymentsData,
    refunds: (refunds.data ?? []) as unknown[],
    entitlements: (entitlements.data ?? []) as unknown[],
    reconciliation: summarizeReconciliation(paymentsData),
  };
  return jsonResult(200, model);
}

function summarizeReconciliation(payments: Array<Record<string, unknown>>): ReadModelResult['reconciliation'] {
  let matched = 0;
  let mismatched = 0;
  let pendingVerification = 0;
  let succeeded = 0;
  let failed = 0;
  for (const p of payments) {
    if (p?.reconciliation_status === 'matched') matched += 1;
    if (p?.reconciliation_status === 'mismatch') mismatched += 1;
    if (p?.status === 'verification_pending') pendingVerification += 1;
    if (p?.status === 'succeeded') succeeded += 1;
    if (p?.status === 'failed') failed += 1;
  }
  return { matched, mismatched, pendingVerification, succeeded, failed };
}

/* ------------------------------------------------------------------------- *
 * POST — finance_admin operational actions (§14, MVP manual refund)
 * ------------------------------------------------------------------------- */

async function handleFinanceAction(
  req: HandlerRequest,
  deps: FinanceHandlerDeps,
  actorUid: string,
): Promise<HandlerResult> {
  let body: unknown;
  try {
    body = JSON.parse(req.bodyText);
  } catch {
    return badRequest('invalid JSON body');
  }
  const raw = (body ?? {}) as Record<string, unknown>;
  if (raw.action === 'request_refund') {
    if (typeof raw.paymentId !== 'string' || raw.paymentId.length === 0) {
      return badRequest('paymentId is required');
    }
    const reasonCode = typeof raw.reasonCode === 'string' ? raw.reasonCode : null;
    return await requestManualRefund(deps, actorUid, raw.paymentId, reasonCode);
  }
  if (raw.action === 'confirm_refund') {
    if (typeof raw.refundId !== 'string' || raw.refundId.length === 0) {
      return badRequest('refundId is required');
    }
    return await confirmManualRefund(deps, actorUid, raw.refundId);
  }
  return badRequest('unsupported finance action');
}

/**
 * finance_admin confirms a manual refund (the operator executed it in the ECPay
 * portal). Marks `refunds.status = succeeded` and applies the §7 derived-state
 * transition (primary → order refunded + entitlement revoked; duplicate_success
 * → payment refunded only, ownership preserved).
 */
async function confirmManualRefund(
  deps: FinanceHandlerDeps,
  actorUid: string,
  refundId: string,
): Promise<HandlerResult> {
  const now = deps.now ?? (() => new Date());
  try {
    const result = await confirmRefund(
      { db: deps.db, log: deps.log, now, actor: actorUid },
      refundId,
    );
    deps.log.info(
      { refundId, paymentStatus: result.paymentStatus, orderStatus: result.orderStatus, entitlementRevoked: result.entitlementRevoked },
      'manual refund confirmed',
    );
    return jsonResult(200, {
      refund: { id: refundId, status: result.refundStatus },
      payment_status: result.paymentStatus,
      order_status: result.orderStatus,
      entitlement_revoked: result.entitlementRevoked,
      already_confirmed: result.alreadyConfirmed,
    });
  } catch (err) {
    deps.log.error(
      { refundId, error: err instanceof Error ? err.message : String(err) },
      'refund confirm failed',
    );
    return jsonResult(502, { error: 'refund confirm failed' });
  }
}

async function requestManualRefund(
  deps: FinanceHandlerDeps,
  actorUid: string,
  paymentId: string,
  reasonCode: string | null,
): Promise<HandlerResult> {
  let payment: PaymentRow | null;
  try {
    payment = await loadPaymentById(deps.db, paymentId);
  } catch (err) {
    deps.log.error({ error: err instanceof Error ? err.message : String(err) }, 'payment lookup failed');
    return jsonResult(502, { error: 'payment lookup failed' });
  }
  if (!payment) return notFound('payment not found');

  // MVP full refund only (§7): the refund amount equals the payment's full amount.
  const refundInsert = await deps.db
    .from('refunds')
    .insert({
      payment_id: payment.id,
      provider: payment.provider,
      amount_minor: Number(payment.amount_minor),
      currency: payment.currency,
      status: 'requested',
      reason_code: reasonCode,
      requested_by: actorUid,
    })
    .select('id')
    .single();
  if (refundInsert.error || !refundInsert.data) {
    deps.log.error(
      { error: refundInsert.error?.message ?? 'no row returned' },
      'refund insert failed',
    );
    return jsonResult(502, { error: 'refund insert failed' });
  }

  const auditInsert = await deps.db.from('admin_audit_log').insert({
    actor: actorUid,
    action: 'refund.requested',
    entity_type: 'refund',
    entity_id: payment.id,
    after_state: {
      status: 'requested',
      reason_code: reasonCode,
      payment_id: payment.id,
      refund_id: refundInsert.data.id,
    },
  });
  if (auditInsert.error) {
    deps.log.error({ error: auditInsert.error.message }, 'admin_audit_log insert failed');
    return jsonResult(502, { error: 'audit log insert failed' });
  }

  deps.log.info(
    { paymentId: payment.id, refundId: refundInsert.data.id, actor: actorUid },
    'manual refund requested',
  );
  return jsonResult(201, { refund: refundInsert.data, status: 'requested' });
}
