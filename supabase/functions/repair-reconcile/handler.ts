/**
 * Internal scheduled-job handler — `POST /functions/v1/repair-reconcile`
 * (verify_jwt=true but the ONLY authorization is the shared scheduled-job secret,
 * decision-record §3.5 / §6).
 *
 * Layer B (repair loop): scans `verification_pending` (and stale `pending`)
 * payments and re-runs QueryTradeInfo via the adapter, applying the SAME
 * verified-success path as the callback (idempotent — state.ts + the
 * `grant_entitlement` upsert make repeats no-ops).
 *
 * Layer C (financial reconciliation): parses a production FundingReconDetail CSV
 * (operator-provided; no stage sandbox, decision-record §6/§7) and marks
 * `payments.reconciliation_status` matched / mismatch. When no reconciliation
 * source is configured, it logs and skips.
 */
import type {
  ProviderPaymentSnapshot,
  ProviderRefundResult,
  VerifiedProviderEvent,
} from '../../../src/lib/payments/contract.ts';
import { parseFundingReconDetailCsv } from '../../../src/lib/payments/ecpay/adapter.ts';
import { minorUnitFor } from '../../../src/lib/payments/money.ts';
import type { Env } from '../_shared/env.ts';
import type { DbClient } from '../_shared/db.ts';
import type { Logger } from '../_shared/log.ts';
import {
  headerValue,
  jsonResult,
  methodNotAllowed,
  unauthorized,
  type HandlerRequest,
  type HandlerResult,
} from '../_shared/http.ts';
import type { ProviderAdapters } from '../_shared/provider.ts';
import {
  applyVerifiedSuccess,
  confirmRefund,
  loadOrder,
  loadPaymentById,
  loadPaymentByMerchantRef,
  loadRequestedRefundForPayment,
  type PaymentRow,
  type RefundRow,
} from '../_shared/flow.ts';

export interface RepairReconcileHandlerDeps {
  env: Env;
  db: DbClient;
  /** One adapter per routed provider (ecpay / paypal, §21); the repair loop routes per payment. */
  adapters: ProviderAdapters;
  log: Logger;
  now?: () => Date;
}

/** Layer B thresholds (§6): verification_pending after 10 min, stale pending after 30 min. */
export const VERIFICATION_PENDING_AFTER_MS = 10 * 60 * 1000;
export const STALE_PENDING_AFTER_MS = 30 * 60 * 1000;
export const REPAIR_SCAN_LIMIT = 50;

/**
 * PayPal refund `PayPal-Request-Id` retention window (§21/B7): a refund captured
 * payment request using the same Request-Id can be retried for up to 45 days.
 * Beyond that, automatic retry must NOT issue another monetary refund POST.
 */
export const PAYPAL_REFUND_IDEMPOTENCY_MS = 45 * 24 * 60 * 60 * 1000;

/** Marker written to `refunds.provider_status_code` for an aged, operator-review refund. */
export const AGED_REFUND_REVIEW_MARKER = 'REVIEW_REQUIRED';

export interface LayerBResult {
  scanned: number;
  repaired: number;
  granted: number;
  stillUnknown: number;
}

export interface LayerCResult {
  skipped: boolean;
  reason?: string;
  entries: number;
  matched: number;
  mismatched: number;
}

/** Result of resuming ambiguous PayPal refunds (§21/B3). */
export interface RefundResumeResult {
  scanned: number;
  resumed: number;
  confirmed: number;
}

export async function handleRepairReconcile(
  req: HandlerRequest,
  deps: RepairReconcileHandlerDeps,
): Promise<HandlerResult> {
  if (req.method !== 'POST') return methodNotAllowed('POST');

  const secret = headerValue(req.headers, 'x-scheduled-job-secret');
  if (!deps.env.scheduledJobSecret || secret !== deps.env.scheduledJobSecret) {
    deps.log.warn({}, 'repair-reconcile rejected: missing or incorrect scheduled-job secret');
    return unauthorized('invalid scheduled job secret');
  }

  const now = deps.now ?? (() => new Date());

  let layerB: LayerBResult;
  try {
    layerB = await runLayerB(deps, now);
  } catch (err) {
    deps.log.error({ error: err instanceof Error ? err.message : String(err) }, 'repair layer B failed');
    return jsonResult(500, { error: 'repair scan failed' });
  }

  let layerC: LayerCResult = { skipped: true, entries: 0, matched: 0, mismatched: 0, reason: 'no reconciliation source configured' };
  if (deps.env.fundingReconCsv) {
    try {
      layerC = await runLayerC(deps, deps.env.fundingReconCsv);
    } catch (err) {
      deps.log.error({ error: err instanceof Error ? err.message : String(err) }, 'reconciliation layer C failed');
      layerC = { skipped: true, entries: 0, matched: 0, mismatched: 0, reason: 'reconciliation failed' };
    }
  }

  // Resume ambiguous PayPal refunds (requested/processing) with the same stable
  // PayPal-Request-Id so provider idempotency returns the current result (§21/B3).
  let refundResume: RefundResumeResult = { scanned: 0, resumed: 0, confirmed: 0 };
  try {
    refundResume = await runRefundResume(deps, now);
  } catch (err) {
    deps.log.error({ error: err instanceof Error ? err.message : String(err) }, 'refund resume failed');
  }

  deps.log.info({ layerB, layerC, refundResume }, 'repair-reconcile run');
  return jsonResult(200, {
    repaired: layerB.repaired,
    granted: layerB.granted,
    stillUnknown: layerB.stillUnknown,
    scanned: layerB.scanned,
    refunds_resumed: refundResume.resumed,
    refunds_confirmed: refundResume.confirmed,
    reconciliation: layerC,
  });
}

/**
 * Resume PayPal refunds stuck in `requested` / `processing` (§21/B3, B7). For a
 * refund within PayPal's `PayPal-Request-Id` retention window (45 days), re-invoke
 * the provider refund with the SAME stable key (keyed on the local payment id), so
 * provider-side idempotency returns the current result without creating a second
 * monetary refund. A provider-confirmed `succeeded` drives `confirmRefund` —
 * refunds is the source of truth and entitlement is revoked exactly once.
 * Ambiguous results stay in a recoverable state. A refund OLDER than the
 * retention window is NEVER auto-resumed (no refund POST) — it is marked
 * `provider_status_code = REVIEW_REQUIRED` for operator/reconciliation review,
 * and the scan QUERY excludes rows already marked REVIEW_REQUIRED (NULL-safe)
 * so they neither starve `REPAIR_SCAN_LIMIT` nor get re-POSTed.
 */
async function runRefundResume(
  deps: RepairReconcileHandlerDeps,
  now: () => Date,
): Promise<RefundResumeResult> {
  const { data, error } = await deps.db
    .from('refunds')
    .select('*')
    .eq('provider', 'paypal')
    .in('status', ['requested', 'processing'])
    // §21/B7: exclude refunds already routed to operator review so they never
    // consume REPAIR_SCAN_LIMIT or get re-POSTed. NULL-safe: rows with a NULL
    // provider_status_code (normal recent refunds) remain eligible, and only
    // rows explicitly marked REVIEW_REQUIRED are filtered out.
    .or('provider_status_code.is.null,provider_status_code.neq.REVIEW_REQUIRED')
    .limit(REPAIR_SCAN_LIMIT);
  if (error) throw new Error(`refund resume scan failed: ${error.message}`);
  const rows = (data ?? []) as unknown as RefundRow[];

  let resumed = 0;
  let confirmed = 0;
  for (const refundRow of rows) {
    // §21/B7: never auto-resume a refund outside PayPal's `PayPal-Request-Id`
    // retention window (45 days). Re-POSTing with a new key could create a
    // SECOND monetary refund; with no key the retry is no longer idempotent.
    // Route the aged refund to operator/reconciliation review instead.
    const ageMs = now().getTime() - new Date(refundRow.requested_at).getTime();
    if (ageMs > PAYPAL_REFUND_IDEMPOTENCY_MS) {
      deps.log.warn(
        { refundId: refundRow.id, requestedAt: refundRow.requested_at },
        'refund aged beyond PayPal Request-Id retention; operator review required',
      );
      const { error: agedError } = await deps.db
        .from('refunds')
        .update({ provider_status_code: AGED_REFUND_REVIEW_MARKER })
        .eq('id', refundRow.id);
      if (agedError) {
        deps.log.error({ error: agedError.message }, 'refund aged marker update failed');
      }
      continue;
    }

    const payment = await loadPaymentById(deps.db, refundRow.payment_id);
    if (!payment || !payment.provider_payment_ref) continue;

    let refundResult: ProviderRefundResult;
    try {
      refundResult = await deps.adapters.paypal.refund({
        paymentId: payment.id,
        providerPaymentRef: payment.provider_payment_ref,
        amount: { amount: Number(payment.amount_minor), currency: payment.currency },
        merchantReference: payment.provider_merchant_ref,
      });
    } catch (err) {
      deps.log.error(
        { refundId: refundRow.id, error: err instanceof Error ? err.message : String(err) },
        'refund resume: provider call failed',
      );
      continue;
    }

    // Persist whatever the provider returned (ref/status) before transitioning.
    const { error: persistError } = await deps.db
      .from('refunds')
      .update({
        provider_refund_ref: refundResult.providerRefundRef ?? refundRow.provider_refund_ref,
        provider_status_code: refundResult.rawStatusCode ?? refundRow.provider_status_code,
      })
      .eq('id', refundRow.id);
    if (persistError) {
      deps.log.error({ error: persistError.message }, 'refund resume: ref persist failed');
    }

    if (refundResult.ok && refundResult.status === 'succeeded') {
      try {
        await confirmRefund({ db: deps.db, log: deps.log, now }, refundRow.id);
        confirmed += 1;
      } catch (err) {
        deps.log.error(
          { refundId: refundRow.id, error: err instanceof Error ? err.message : String(err) },
          'refund resume: confirm failed',
        );
      }
    } else if (refundResult.ok && refundResult.status === 'pending' && refundRow.status === 'requested') {
      // Still ambiguous — move to the recoverable `processing` state for the
      // next run. Never a terminal failure (§21/B3).
      const { error: processingError } = await deps.db
        .from('refunds')
        .update({ status: 'processing' })
        .eq('id', refundRow.id);
      if (processingError) {
        deps.log.error({ error: processingError.message }, 'refund resume: processing update failed');
      }
    }
    resumed += 1;
  }
  return { scanned: rows.length, resumed, confirmed };
}

async function runLayerB(
  deps: RepairReconcileHandlerDeps,
  now: () => Date,
): Promise<LayerBResult> {
  const nowMs = now().getTime();
  const staleBefore = new Date(nowMs - STALE_PENDING_AFTER_MS).toISOString();
  const pendingBefore = new Date(nowMs - VERIFICATION_PENDING_AFTER_MS).toISOString();

  const { data, error } = await deps.db
    .from('payments')
    .select('*')
    .in('provider', ['ecpay', 'paypal'])
    .in('status', ['verification_pending', 'pending'])
    .lte('created_at', staleBefore)
    .limit(REPAIR_SCAN_LIMIT);
  if (error) throw new Error(`repair scan failed: ${error.message}`);
  const rows = (data ?? []) as unknown as PaymentRow[];
  const candidates = rows.filter(
    (row) => row.status === 'verification_pending' || row.created_at <= pendingBefore,
  );

  let repaired = 0;
  let granted = 0;
  let stillUnknown = 0;
  for (const paymentRow of candidates) {
    const provider = paymentRow.provider as 'ecpay' | 'paypal';
    const event: VerifiedProviderEvent = {
      provider,
      providerMerchantRef: paymentRow.provider_merchant_ref,
      providerPaymentRef: paymentRow.provider_payment_ref ?? undefined,
      eventFingerprint: 'repair',
      status: 'unknown',
      amount: { amount: Number(paymentRow.amount_minor), currency: paymentRow.currency },
    };
    let snapshot: ProviderPaymentSnapshot;
    try {
      snapshot = await deps.adapters[provider].confirmPayment(event);
    } catch {
      stillUnknown += 1;
      continue;
    }
    if (snapshot.status !== 'succeeded') {
      stillUnknown += 1; // TradeStatus=0 / not-yet-approved is not terminal (§6) — leave for the next run
      continue;
    }

    const orderRow = await loadOrder(deps.db, paymentRow.order_id);
    if (!orderRow) {
      deps.log.warn({ paymentId: paymentRow.id }, 'repair: order row missing; skipping');
      continue;
    }
    try {
      const result = await applyVerifiedSuccess({
        db: deps.db,
        log: deps.log,
        now,
        orderRow,
        paymentRow,
        merchantReference: paymentRow.provider_merchant_ref,
        providerPaymentReference: snapshot.providerPaymentReference,
        paidAt: snapshot.paidAt,
        rawStatusCode: snapshot.rawStatusCode,
      });
      repaired += 1;
      if (result.granted) granted += 1;
    } catch (err) {
      deps.log.error(
        { paymentId: paymentRow.id, error: err instanceof Error ? err.message : String(err) },
        'repair apply failed',
      );
    }
  }
  return { scanned: candidates.length, repaired, granted, stillUnknown };
}

async function runLayerC(deps: RepairReconcileHandlerDeps, csv: string): Promise<LayerCResult> {
  const entries = parseFundingReconDetailCsv(csv);
  let matched = 0;
  let mismatched = 0;
  for (const entry of entries) {
    let payment: PaymentRow | null;
    try {
      payment = await loadPaymentByMerchantRef(deps.db, 'ecpay', entry.merchantTradeNo);
    } catch {
      continue;
    }
    if (!payment) continue;

    const reconTwd = Number(entry.tradeAmt);
    if (Number.isFinite(reconTwd) && reconTwd < 0) {
      // A NEGATIVE amount in FundingReconDetail is a confirmed REFUND (§6/§7).
      // Mark the matching refund row succeeded and apply the derived-state
      // transition (primary → order refunded + entitlement revoked; duplicate →
      // payment refunded only) via the shared confirmRefund path.
      try {
        const refundRow = await loadRequestedRefundForPayment(deps.db, payment.id);
        if (refundRow) {
          const result = await confirmRefund(
            { db: deps.db, log: deps.log, now: deps.now ?? (() => new Date()) },
            refundRow.id,
          );
          deps.log.info(
            { refundId: refundRow.id, paymentId: payment.id, entitlementRevoked: result.entitlementRevoked },
            'reconciliation discovered a confirmed refund',
          );
        }
      } catch (err) {
        deps.log.error(
          { paymentId: payment.id, error: err instanceof Error ? err.message : String(err) },
          'reconciliation refund confirm failed',
        );
      }
      continue;
    }

    const localTwd = Number(payment.amount_minor) / minorUnitFor('TWD');
    const isMatch = Number.isFinite(reconTwd) && reconTwd === localTwd;
    const { error: updateError } = await deps.db
      .from('payments')
      .update({ reconciliation_status: isMatch ? 'matched' : 'mismatch' })
      .eq('id', payment.id);
    if (updateError) {
      deps.log.error(
        { paymentId: payment.id, error: updateError.message },
        'reconciliation status update failed',
      );
      continue;
    }
    if (isMatch) matched += 1;
    else mismatched += 1;
  }
  deps.log.info({ entries: entries.length, matched, mismatched }, 'reconciliation (Layer C) applied');
  return { skipped: false, entries: entries.length, matched, mismatched };
}
