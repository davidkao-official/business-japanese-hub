/**
 * Finance Edge Function handler — `GET/POST /functions/v1/finance`
 * (verify_jwt=true, finance role required; decision-record §14).
 *
 * Authorization is server-enforced from the `finance_roles` table (read via the
 * service-role client) — a client-claimed role is NEVER trusted.
 *
 * - `GET` → authorized read model: financial facts, callback/outbox/audit
 *   evidence, reconciliation and actionable operations summaries. Any finance
 *   role may read.
 * - `POST { action: 'request_refund', paymentId, reasonCode? }` → finance_admin
 *   only; atomically creates one full-refund fact plus its audit evidence and,
 *   where supported, dispatches the provider refund.
 */
import { fetchFinanceRole, type FinanceRole } from '../_shared/finance-role.ts';
import type { DbClient } from '../_shared/db.ts';
import type { Logger } from '../_shared/log.ts';
import type { ProviderAdapters } from '../_shared/provider.ts';
import { PaypalConfigurationUnavailableError } from '../_shared/paypal.ts';
import type { ProviderRefundResult } from '../../../src/lib/payments/contract.ts';
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
import {
  confirmRefund,
  persistOpenRefundObservation,
  type PaymentRow,
  type RefundRow,
} from '../_shared/flow.ts';

export interface FinanceHandlerDeps {
  db: DbClient;
  log: Logger;
  /** Adapters for provider-automatable refunds (PayPal); ECPay stays manual. */
  adapters: ProviderAdapters;
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
    return await buildFinanceReadModel(deps, role);
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
  paymentEvents: unknown[];
  emailOutbox: unknown[];
  auditLog: unknown[];
  scheduledJobHealth: unknown[];
  reconciliation: {
    matched: number;
    mismatched: number;
    pendingVerification: number;
    succeeded: number;
    failed: number;
  };
  operations: {
    unprocessedEvents: number;
    processingErrors: number;
    duplicatePayments: number;
    refundRequested: number;
    refundProcessing: number;
    refundFailed: number;
    emailPending: number;
    emailDead: number;
  };
}

type FinanceCounts = ReadModelResult['reconciliation'] & ReadModelResult['operations'];

const FINANCE_COUNT_KEYS = [
  'matched',
  'mismatched',
  'pendingVerification',
  'succeeded',
  'failed',
  'unprocessedEvents',
  'processingErrors',
  'duplicatePayments',
  'refundRequested',
  'refundProcessing',
  'refundFailed',
  'emailPending',
  'emailDead',
] as const satisfies readonly (keyof FinanceCounts)[];

function readFinanceCounts(value: unknown): FinanceCounts | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const result: Partial<FinanceCounts> = {};
  for (const key of FINANCE_COUNT_KEYS) {
    const count = record[key];
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) return null;
    result[key] = count;
  }
  return result as FinanceCounts;
}

const VIEWER_EMAIL_OUTBOX_COLUMNS = [
  'id', 'order_id', 'locale', 'template_key', 'status', 'attempt_count',
  'next_attempt_at', 'locked_at', 'provider_message_id', 'last_error_code',
  'created_at', 'sent_at',
].join(',');

const VIEWER_AUDIT_LOG_COLUMNS = 'id,action,entity_type,entity_id,created_at';

async function buildFinanceReadModel(
  deps: FinanceHandlerDeps,
  role: FinanceRole,
): Promise<HandlerResult> {
  const now = deps.now ?? (() => new Date());
  const [
    orders,
    payments,
    refunds,
    entitlements,
    paymentEvents,
    emailOutbox,
    auditLog,
    scheduledJobHealth,
    countResult,
  ] = await Promise.all([
    deps.db.from('orders').select('*').order('created_at', { ascending: false }).limit(200),
    deps.db.from('payments').select('*').order('created_at', { ascending: false }).limit(500),
    deps.db.from('refunds').select('*').order('requested_at', { ascending: false }).limit(200),
    deps.db.from('book_entitlement').select('*').limit(500),
    deps.db.from('payment_events').select('*').order('received_at', { ascending: false }).limit(500),
    deps.db.from('order_email_outbox')
      .select(role === 'finance_admin' ? '*' : VIEWER_EMAIL_OUTBOX_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(200),
    deps.db.from('admin_audit_log')
      .select(role === 'finance_admin' ? '*' : VIEWER_AUDIT_LOG_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(500),
    deps.db.from('scheduled_job_health').select('*').order('job_name', { ascending: true }),
    deps.db.rpc('finance_status_counts', {}),
  ]);
  for (const [name, res] of [
    ['orders', orders],
    ['payments', payments],
    ['refunds', refunds],
    ['entitlements', entitlements],
    ['payment events', paymentEvents],
    ['email outbox', emailOutbox],
    ['audit log', auditLog],
    ['scheduled job health', scheduledJobHealth],
    ['finance status counts', countResult],
  ] as const) {
    if (res.error) {
      deps.log.error({ error: res.error.message }, `${name} read failed`);
      return jsonResult(502, { error: `${name} read failed` });
    }
  }
  const paymentsData = (payments.data ?? []) as Array<Record<string, unknown>>;
  const refundsData = (refunds.data ?? []) as Array<Record<string, unknown>>;
  const paymentEventsData = (paymentEvents.data ?? []) as Array<Record<string, unknown>>;
  const emailOutboxData = (emailOutbox.data ?? []) as Array<Record<string, unknown>>;
  const counts = readFinanceCounts(countResult.data);
  if (!counts) {
    deps.log.error({}, 'finance status counts returned invalid data');
    return jsonResult(502, { error: 'finance status counts read failed' });
  }
  const model: ReadModelResult = {
    generatedAt: now().toISOString(),
    orders: (orders.data ?? []) as unknown[],
    payments: paymentsData,
    refunds: refundsData,
    entitlements: (entitlements.data ?? []) as unknown[],
    paymentEvents: paymentEventsData,
    emailOutbox: emailOutboxData,
    auditLog: (auditLog.data ?? []) as unknown[],
    scheduledJobHealth: (scheduledJobHealth.data ?? []) as unknown[],
    reconciliation: {
      matched: counts.matched,
      mismatched: counts.mismatched,
      pendingVerification: counts.pendingVerification,
      succeeded: counts.succeeded,
      failed: counts.failed,
    },
    operations: {
      unprocessedEvents: counts.unprocessedEvents,
      processingErrors: counts.processingErrors,
      duplicatePayments: counts.duplicatePayments,
      refundRequested: counts.refundRequested,
      refundProcessing: counts.refundProcessing,
      refundFailed: counts.refundFailed,
      emailPending: counts.emailPending,
      emailDead: counts.emailDead,
    },
  };
  return jsonResult(200, model);
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
  return badRequest('unsupported finance action');
}

interface RefundRequestTransaction {
  outcome: 'created' | 'existing' | 'payment_not_found' | 'not_refundable';
  refund?: RefundRow;
  payment?: PaymentRow;
  payment_status?: string;
}

async function requestManualRefund(
  deps: FinanceHandlerDeps,
  actorUid: string,
  paymentId: string,
  reasonCode: string | null,
): Promise<HandlerResult> {
  const request = await deps.db.rpc('request_full_refund', {
    p_payment_id: paymentId,
    p_actor: actorUid,
    p_reason_code: reasonCode,
  });
  if (request.error || !request.data) {
    deps.log.error(
      { error: request.error?.message ?? 'no result returned' },
      'refund request transaction failed',
    );
    return jsonResult(502, { error: 'refund request failed' });
  }
  const transaction = request.data as unknown as RefundRequestTransaction;
  if (transaction.outcome === 'payment_not_found') return notFound('payment not found');
  if (transaction.outcome === 'not_refundable') {
    return jsonResult(409, {
      error: 'payment is not refundable',
      reason: 'payment_not_refundable',
      payment_status: transaction.payment_status ?? null,
    });
  }
  const refund = transaction.refund;
  const payment = transaction.payment;
  if (!refund || !payment || (transaction.outcome !== 'created' && transaction.outcome !== 'existing')) {
    deps.log.error({}, 'refund request transaction returned invalid data');
    return jsonResult(502, { error: 'refund request failed' });
  }

  // Replays return the one canonical Refund fact and never dispatch a second
  // provider operation. Ambiguous PayPal work is resumed only by the repair loop
  // with its stable provider idempotency key.
  if (transaction.outcome === 'existing') {
    const status = refund.status;
    const httpStatus = status === 'processing' ? 202 : status === 'failed' ? 409 : 200;
    return jsonResult(httpStatus, {
      refund: { id: refund.id, status },
      status,
      ...(status === 'failed' ? { reason: 'provider_refund_rejected' } : {}),
      replayed: true,
    });
  }

  deps.log.info(
    { paymentId: payment.id, refundId: refund.id, actor: actorUid },
    'manual refund requested',
  );

  // Provider-automatable refund (PayPal, §21): execute the full refund via the
  // adapter and confirm immediately when the provider confirms it. ECPay stays
  // on the provider-portal flow; authoritative FundingReconDetail evidence,
  // never an operator assertion, later drives the local refund finalizer.
  if (
    payment.provider === 'paypal' &&
    payment.provider_payment_ref &&
    (payment.status === 'succeeded' || payment.status === 'duplicate_success')
  ) {
    let refundResult: ProviderRefundResult;
    try {
      refundResult = await deps.adapters.paypal.refund({
        paymentId: payment.id,
        providerPaymentRef: payment.provider_payment_ref,
        amount: { amount: Number(payment.amount_minor), currency: payment.currency },
        merchantReference: payment.provider_merchant_ref,
      });
    } catch (err) {
      if (err instanceof PaypalConfigurationUnavailableError) {
        deps.log.warn(
          { paymentId: payment.id, refundId: refund.id },
          'paypal refund refused: provider not configured; refund left requested',
        );
        return jsonResult(502, {
          error: 'paypal is not configured',
          reason: 'provider_configuration_unavailable',
        });
      }
      throw err;
    }
    if (refundResult.ok && refundResult.status === 'succeeded') {
      try {
        await confirmRefund(
          { db: deps.db, log: deps.log, now: deps.now ?? (() => new Date()), actor: actorUid },
          String(refund.id),
          {
            providerRefundRef: refundResult.providerRefundRef,
            providerStatusCode: refundResult.rawStatusCode,
          },
        );
      } catch (err) {
        deps.log.error(
          { refundId: refund.id, error: err instanceof Error ? err.message : String(err) },
          'paypal refund confirm failed after provider success',
        );
        return jsonResult(502, { error: 'refund confirm failed' });
      }
      return jsonResult(200, {
        refund: { id: refund.id, status: 'succeeded', provider_refund_ref: refundResult.providerRefundRef ?? null },
        payment_status: 'refunded',
        status: 'succeeded',
      });
    }

    // Ambiguous/non-success results remain recoverable facts. Persist the
    // provider reference/status before any processing transition so repair can
    // safely retry with the same idempotency key (§21/B3). Confirmed success is
    // handled above in the atomic finalization transaction.
    const definitivelyFailed = !refundResult.ok && refundResult.status === 'failed';
    const recoverablePending = refundResult.ok && refundResult.status === 'pending';
    let persistedRefund: RefundRow;
    try {
      persistedRefund = await persistOpenRefundObservation(deps.db, refund.id, {
        provider_refund_ref: refundResult.providerRefundRef ?? refund.provider_refund_ref,
        provider_status_code: refundResult.rawStatusCode ?? null,
        ...(definitivelyFailed ? { status: 'failed' } : {}),
        ...(recoverablePending ? { status: 'processing' } : {}),
      });
    } catch (err) {
      deps.log.error(
        { error: err instanceof Error ? err.message : String(err) },
        'refund provider ref persist failed',
      );
      return jsonResult(502, { error: 'refund status persistence failed' });
    }

    // A concurrent webhook/finalizer is authoritative. Report its terminal
    // result instead of allowing this stale provider call to downgrade it.
    if (persistedRefund.status === 'succeeded') {
      return jsonResult(200, {
        refund: {
          id: persistedRefund.id,
          status: 'succeeded',
          provider_refund_ref: persistedRefund.provider_refund_ref,
        },
        payment_status: 'refunded',
        status: 'succeeded',
        replayed: true,
      });
    }

    if (persistedRefund.status === 'failed') {
      deps.log.warn(
        { paymentId: payment.id, refundId: refund.id, rawStatusCode: refundResult.rawStatusCode },
        'paypal refund definitively rejected',
      );
      return jsonResult(409, {
        refund: { id: refund.id, status: 'failed' },
        status: 'failed',
        reason: 'provider_refund_rejected',
      });
    }

    if (persistedRefund.status === 'processing') {
      // Ambiguous (transport 5xx/timeout) or genuinely pending — leave it in the
      // recoverable `processing` state; the repair loop resumes it with the same
      // stable PayPal-Request-Id (§21/B3). Never a terminal failed refund here.
      return jsonResult(202, {
        refund: {
          id: persistedRefund.id,
          status: 'processing',
          provider_refund_ref: persistedRefund.provider_refund_ref,
        },
        status: 'processing',
      });
    }
    deps.log.warn(
      { paymentId: payment.id, refundId: refund.id, rawStatusCode: refundResult.rawStatusCode },
      'paypal refund request rejected; left requested for operator review',
    );
  }

  return jsonResult(201, { refund: { id: refund.id, status: refund.status }, status: refund.status });
}
