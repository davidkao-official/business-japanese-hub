/**
 * Internal scheduled-job handler — `POST /functions/v1/repair-reconcile`
 * (`verify_jwt=false`; the ONLY authorization is the shared scheduled-job secret,
 * decision-record §3.5 / §6).
 *
 * Layer B (repair loop): scans `verification_pending` (and stale `pending`)
 * payments and re-runs provider confirmation via the routed adapter, applying
 * the same immutable success gate and atomic finalizer as live callbacks.
 *
 * Layer C (financial reconciliation): parses ECPay FundingReconDetail and calls
 * PayPal Transaction Search, then matches immutable refs/amount/currency and
 * discovers provider-confirmed full refunds. Cron sends an explicit `mode` so
 * reporting runs daily while repair runs every ten minutes.
 */
import type {
  ProviderPaymentSnapshot,
  ProviderRefundResult,
  VerifiedProviderEvent,
} from '../../../src/lib/payments/contract.ts';
import { parseFundingReconDetailCsv } from '../../../src/lib/payments/ecpay/adapter.ts';
import { isVerifiedSuccessSnapshot } from '../../../src/lib/payments/domain.ts';
import { minorUnitFor } from '../../../src/lib/payments/money.ts';
import type { PaypalReconciliationEntry } from '../../../src/lib/payments/paypal/types.ts';
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
import { isPaypalConfigured } from '../_shared/paypal.ts';
import {
  applyVerifiedSuccess,
  confirmRefund,
  confirmProviderRefund,
  loadPaymentById,
  loadPaymentByMerchantRef,
  loadPaymentByProviderPaymentRef,
  loadRequestedRefundForPayment,
  persistOpenRefundObservation,
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
  failures: number;
}

export interface LayerCResult {
  skipped: boolean;
  reason?: string;
  entries: number;
  matched: number;
  mismatched: number;
  failures: number;
}

/** Result of resuming ambiguous PayPal refunds (§21/B3). */
export interface RefundResumeResult {
  scanned: number;
  resumed: number;
  confirmed: number;
  failures: number;
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
  const mode = scheduledMode(req.bodyText);
  if (!mode) return jsonResult(400, { error: 'invalid scheduled-job mode' });
  const shouldRepair = mode === 'all' || mode === 'repair';
  const shouldReconcile = mode === 'all' || mode === 'reconcile';
  const jobNames: Array<'repair' | 'reconcile'> = [
    ...(shouldRepair ? ['repair' as const] : []),
    ...(shouldReconcile ? ['reconcile' as const] : []),
  ];
  const runIds = new Map<'repair' | 'reconcile', string>();

  for (const jobName of jobNames) {
    let data: unknown;
    let error: { message: string } | null;
    try {
      const result = await deps.db.rpc('record_scheduled_job_started', {
        p_job_name: jobName,
      });
      data = result.data;
      error = result.error;
    } catch (err) {
      data = null;
      error = { message: err instanceof Error ? err.message : String(err) };
    }
    if (error || typeof data !== 'string' || !/^[0-9a-f-]{36}$/i.test(data)) {
      deps.log.error(
        { jobName, error: error?.message ?? 'missing run id' },
        'scheduled-job start heartbeat failed',
      );
      await recordScheduledJobResults(
        deps,
        runIds,
        false,
        'start_heartbeat_aborted',
      );
      return jsonResult(500, { error: 'scheduled-job health persistence failed' });
    }
    runIds.set(jobName, data);
  }

  const runResult = await (async (): Promise<HandlerResult> => {
  let layerB: LayerBResult = { scanned: 0, repaired: 0, granted: 0, stillUnknown: 0, failures: 0 };
  if (shouldRepair) {
    try {
      layerB = await runLayerB(deps, now);
    } catch (err) {
      deps.log.error({ error: err instanceof Error ? err.message : String(err) }, 'repair layer B failed');
      return jsonResult(500, { error: 'repair scan failed' });
    }
  }

  const reconciliationRuns: LayerCResult[] = [];
  let reconciliationFailed = false;
  if (shouldReconcile && deps.env.fundingReconCsv) {
    try {
      reconciliationRuns.push(await runLayerC(deps, deps.env.fundingReconCsv));
    } catch (err) {
      deps.log.error({ error: err instanceof Error ? err.message : String(err) }, 'reconciliation layer C failed');
      reconciliationFailed = true;
    }
  }
  if (shouldReconcile && isPaypalConfigured(deps.env) && deps.adapters.paypal.reconcile) {
    try {
      reconciliationRuns.push(await runPaypalLayerC(deps, now));
    } catch (err) {
      deps.log.error({ error: err instanceof Error ? err.message : String(err) }, 'PayPal reconciliation layer C failed');
      reconciliationFailed = true;
    }
  }
  const layerC: LayerCResult = reconciliationRuns.length > 0
    ? {
        skipped: false,
        entries: reconciliationRuns.reduce((sum, result) => sum + result.entries, 0),
        matched: reconciliationRuns.reduce((sum, result) => sum + result.matched, 0),
        mismatched: reconciliationRuns.reduce((sum, result) => sum + result.mismatched, 0),
        failures: reconciliationRuns.reduce((sum, result) => sum + result.failures, 0),
        ...(reconciliationFailed ? { reason: 'one or more reconciliation sources failed' } : {}),
      }
    : {
        skipped: true,
        entries: 0,
        matched: 0,
        mismatched: 0,
        failures: 0,
        reason: reconciliationFailed ? 'reconciliation failed' : 'no reconciliation source configured',
      };

  // Resume ambiguous PayPal refunds (requested/processing) with the same stable
  // PayPal-Request-Id so provider idempotency returns the current result (§21/B3).
  let refundResume: RefundResumeResult = { scanned: 0, resumed: 0, confirmed: 0, failures: 0 };
  let refundResumeFailed = false;
  if (shouldRepair) {
    try {
      refundResume = await runRefundResume(deps, now);
    } catch (err) {
      deps.log.error({ error: err instanceof Error ? err.message : String(err) }, 'refund resume failed');
      refundResumeFailed = true;
    }
  }

  deps.log.info({ layerB, layerC, refundResume }, 'repair-reconcile run');
  const workerFailed = layerB.failures > 0 ||
    refundResume.failures > 0 ||
    layerC.failures > 0 ||
    refundResumeFailed ||
    (shouldReconcile && (reconciliationFailed || layerC.skipped));
  return jsonResult(workerFailed ? 500 : 200, {
    repaired: layerB.repaired,
    granted: layerB.granted,
    stillUnknown: layerB.stillUnknown,
    repair_failures: layerB.failures,
    scanned: layerB.scanned,
    refunds_resumed: refundResume.resumed,
    refunds_confirmed: refundResume.confirmed,
    refund_failures: refundResume.failures,
    reconciliation: layerC,
    ...(workerFailed ? { error: 'scheduled work incomplete' } : {}),
  });
  })();

  const succeeded = runResult.status >= 200 && runResult.status < 300;
  const resultsPersisted = await recordScheduledJobResults(
    deps,
    runIds,
    succeeded,
    succeeded ? null : `worker_http_${runResult.status}`,
  );
  if (!resultsPersisted) {
    return jsonResult(500, { error: 'scheduled-job health persistence failed' });
  }
  return runResult;
}

async function recordScheduledJobResults(
  deps: RepairReconcileHandlerDeps,
  runIds: ReadonlyMap<'repair' | 'reconcile', string>,
  succeeded: boolean,
  errorCode: string | null,
): Promise<boolean> {
  let allPersisted = true;
  for (const [jobName, runId] of runIds) {
    let data: unknown;
    let error: { message: string } | null;
    try {
      const result = await deps.db.rpc('record_scheduled_job_result', {
        p_job_name: jobName,
        p_run_id: runId,
        p_succeeded: succeeded,
        p_error_code: errorCode,
      });
      data = result.data;
      error = result.error;
    } catch (err) {
      data = null;
      error = { message: err instanceof Error ? err.message : String(err) };
    }
    if (error) {
      deps.log.error({ jobName, error: error.message }, 'scheduled-job result heartbeat failed');
      allPersisted = false;
      continue;
    }
    if ((data as unknown) !== true) {
      deps.log.info({ jobName }, 'scheduled-job result superseded by a newer overlapping run');
    }
  }
  return allPersisted;
}

function scheduledMode(bodyText: string): 'repair' | 'reconcile' | 'all' | null {
  if (!bodyText.trim()) return 'all';
  try {
    const value = JSON.parse(bodyText) as { mode?: unknown };
    if (value.mode === undefined) return 'all';
    return value.mode === 'repair' || value.mode === 'reconcile' || value.mode === 'all'
      ? value.mode
      : null;
  } catch {
    return null;
  }
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
  let failures = 0;
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
        .eq('id', refundRow.id)
        .in('status', ['requested', 'processing']);
      if (agedError) {
        deps.log.error({ error: agedError.message }, 'refund aged marker update failed');
        failures += 1;
      }
      continue;
    }

    const payment = await loadPaymentById(deps.db, refundRow.payment_id);
    if (!payment || !payment.provider_payment_ref) {
      deps.log.error({ refundId: refundRow.id }, 'refund resume: payment correlation missing');
      failures += 1;
      continue;
    }

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
      failures += 1;
      continue;
    }

    if (refundResult.ok && refundResult.status === 'succeeded') {
      try {
        await confirmRefund(
          { db: deps.db, log: deps.log, now },
          refundRow.id,
          {
            providerRefundRef: refundResult.providerRefundRef,
            providerStatusCode: refundResult.rawStatusCode,
          },
        );
        confirmed += 1;
      } catch (err) {
        deps.log.error(
          { refundId: refundRow.id, error: err instanceof Error ? err.message : String(err) },
          'refund resume: confirm failed',
        );
        failures += 1;
      }
    } else {
      // Persist ambiguous/non-success provider facts for the next repair pass.
      // A confirmed success is persisted inside finalize_refund_success above.
      const recoverablePending = refundResult.ok && refundResult.status === 'pending';
      const definitivelyFailed = !refundResult.ok && refundResult.status === 'failed';
      let persistedRefund: RefundRow;
      try {
        persistedRefund = await persistOpenRefundObservation(deps.db, refundRow.id, {
          provider_refund_ref: refundResult.providerRefundRef ?? refundRow.provider_refund_ref,
          provider_status_code: refundResult.rawStatusCode ?? refundRow.provider_status_code,
          ...(recoverablePending && refundRow.status === 'requested' ? { status: 'processing' } : {}),
          ...(definitivelyFailed ? { status: 'failed' } : {}),
        });
      } catch (err) {
        deps.log.error(
          { error: err instanceof Error ? err.message : String(err) },
          'refund resume: ref persist failed',
        );
        failures += 1;
        continue;
      }
      if (persistedRefund.status === 'succeeded') confirmed += 1;
    }
    resumed += 1;
  }
  return { scanned: rows.length, resumed, confirmed, failures };
}

async function runLayerB(
  deps: RepairReconcileHandlerDeps,
  now: () => Date,
): Promise<LayerBResult> {
  const nowMs = now().getTime();
  const stalePendingBefore = new Date(nowMs - STALE_PENDING_AFTER_MS).toISOString();
  const verificationPendingBefore = new Date(nowMs - VERIFICATION_PENDING_AFTER_MS).toISOString();

  const { data, error } = await deps.db
    .from('payments')
    .select('*')
    .in('provider', ['ecpay', 'paypal'])
    .or(
      `and(status.eq.verification_pending,created_at.lte.${verificationPendingBefore}),` +
        `and(status.eq.pending,created_at.lte.${stalePendingBefore})`,
    )
    .limit(REPAIR_SCAN_LIMIT);
  if (error) throw new Error(`repair scan failed: ${error.message}`);
  const rows = (data ?? []) as unknown as PaymentRow[];
  const candidates = rows.filter((row) =>
    (row.status === 'verification_pending' && row.created_at <= verificationPendingBefore) ||
    (row.status === 'pending' && row.created_at <= stalePendingBefore)
  );

  let repaired = 0;
  let granted = 0;
  let stillUnknown = 0;
  let failures = 0;
  for (const paymentRow of candidates) {
    const provider = paymentRow.provider as 'ecpay' | 'paypal';
    const event: VerifiedProviderEvent = {
      provider,
      providerMerchantRef: paymentRow.provider_merchant_ref,
      // PayPal confirmation starts from the checkout Order id. The eventual
      // capture id belongs in provider_payment_ref only after confirmation.
      providerPaymentRef:
        provider === 'paypal'
          ? (paymentRow.provider_checkout_ref ?? undefined)
          : (paymentRow.provider_payment_ref ?? undefined),
      eventFingerprint: 'repair',
      status: 'unknown',
      amount: { amount: Number(paymentRow.amount_minor), currency: paymentRow.currency },
    };
    let snapshot: ProviderPaymentSnapshot;
    try {
      snapshot = await deps.adapters[provider].confirmPayment(event);
    } catch (err) {
      deps.log.error(
        { paymentId: paymentRow.id, error: err instanceof Error ? err.message : String(err) },
        'repair provider confirmation failed',
      );
      stillUnknown += 1;
      failures += 1;
      continue;
    }
    if (!isRepairSnapshotVerified(paymentRow, snapshot)) {
      stillUnknown += 1; // TradeStatus=0 / not-yet-approved is not terminal (§6) — leave for the next run
      continue;
    }

    try {
      const result = await applyVerifiedSuccess({
        db: deps.db,
        log: deps.log,
        now,
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
      failures += 1;
    }
  }
  return { scanned: candidates.length, repaired, granted, stillUnknown, failures };
}

/**
 * Layer B applies the same immutable amount/currency gate as live callbacks.
 * ECPay additionally requires every signed QueryTradeInfo evidence field to
 * match the local merchant reference, amount, and returned trade reference.
 */
function isRepairSnapshotVerified(payment: PaymentRow, snapshot: ProviderPaymentSnapshot): boolean {
  if (
    snapshot.provider !== payment.provider ||
    snapshot.merchantReference !== payment.provider_merchant_ref ||
    !isVerifiedSuccessSnapshot(snapshot, Number(payment.amount_minor), payment.currency)
  ) {
    return false;
  }
  if (payment.provider !== 'ecpay') return payment.provider === 'paypal';

  const query = snapshot.queryResponse;
  const localTwd = Number(payment.amount_minor) / minorUnitFor('TWD');
  return (
    payment.currency === 'TWD' &&
    Number.isSafeInteger(localTwd) &&
    query?.merchantTradeNo === payment.provider_merchant_ref &&
    typeof query.tradeNo === 'string' &&
    query.tradeNo.length > 0 &&
    snapshot.providerPaymentReference === query.tradeNo &&
    Number(query.tradeAmt) === localTwd &&
    query.tradeStatus === '1'
  );
}

async function runLayerC(deps: RepairReconcileHandlerDeps, csv: string): Promise<LayerCResult> {
  const entries = parseFundingReconDetailCsv(csv);
  let matched = 0;
  let mismatched = 0;
  let failures = 0;
  for (const entry of entries) {
    let payment: PaymentRow | null;
    try {
      payment = await loadPaymentByMerchantRef(deps.db, 'ecpay', entry.merchantTradeNo);
    } catch (err) {
      deps.log.error(
        { merchantReference: entry.merchantTradeNo, error: err instanceof Error ? err.message : String(err) },
        'reconciliation payment lookup failed',
      );
      failures += 1;
      continue;
    }
    if (!payment) continue;

    const reconTwd = Number(entry.tradeAmt);
    const refundAmountText = entry.refundAmount.trim();
    const refundTwd = refundAmountText === '' ? 0 : Number(refundAmountText);
    const referencesMatch =
      Boolean(deps.env.ecpayMerchantId) &&
      entry.merchantId === deps.env.ecpayMerchantId &&
      Boolean(payment.provider_payment_ref) &&
      entry.tradeNo === payment.provider_payment_ref &&
      entry.tradeStatus === '1';
    const malformedRefundAmount = !Number.isFinite(refundTwd) || refundTwd > 0;

    if (!referencesMatch || malformedRefundAmount) {
      await setReconciliationStatus(deps, payment.id, 'mismatch');
      mismatched += 1;
      continue;
    }

    if (refundTwd < 0) {
      // FundingReconDetail keeps the original TradeAmt positive and reports a
      // confirmed refund as a negative RefundAMT. Fail closed unless the report
      // proves a full refund of the authoritative local amount: partial or
      // malformed refunds need operator review and must not revoke access.
      const localTwd = Number(payment.amount_minor) / minorUnitFor('TWD');
      const isConfirmedFullRefund =
        payment.currency === 'TWD' &&
        Number.isSafeInteger(localTwd) &&
        Math.abs(refundTwd) === localTwd &&
        entry.refundStatus === '1';
      if (!isConfirmedFullRefund) {
        await setReconciliationStatus(deps, payment.id, 'mismatch');
        mismatched += 1;
        continue;
      }

      // Mark the canonical refund succeeded and apply the derived-state
      // transition (primary → order refunded + entitlement revoked; duplicate →
      // payment refunded only) in the locked DB finalizer. Provider-confirmed
      // out-of-band refunds are recorded even when no local request row exists.
      try {
        const refundRow = await loadRequestedRefundForPayment(deps.db, payment.id);
        const providerStatusCode = entry.refundStatus || undefined;
        if (refundRow) {
          const result = await confirmRefund(
            { db: deps.db, log: deps.log, now: deps.now ?? (() => new Date()) },
            refundRow.id,
            { providerStatusCode },
          );
          deps.log.info(
            { refundId: refundRow.id, paymentId: payment.id, entitlementRevoked: result.entitlementRevoked },
            'reconciliation discovered a confirmed refund',
          );
        } else {
          await confirmProviderRefund(
            { db: deps.db, log: deps.log, now: deps.now ?? (() => new Date()) },
            payment.id,
            undefined,
            providerStatusCode,
          );
        }
        await setReconciliationStatus(deps, payment.id, 'matched');
        matched += 1;
      } catch (err) {
        deps.log.error(
          { paymentId: payment.id, error: err instanceof Error ? err.message : String(err) },
          'reconciliation refund confirm failed',
        );
        failures += 1;
      }
      continue;
    }

    const localTwd = Number(payment.amount_minor) / minorUnitFor('TWD');
    const isMatch =
      payment.currency === 'TWD' &&
      Number.isSafeInteger(localTwd) &&
      Number.isFinite(reconTwd) &&
      reconTwd === localTwd;
    const { error: updateError } = await deps.db
      .from('payments')
      .update({ reconciliation_status: isMatch ? 'matched' : 'mismatch' })
      .eq('id', payment.id);
    if (updateError) {
      deps.log.error(
        { paymentId: payment.id, error: updateError.message },
        'reconciliation status update failed',
      );
      failures += 1;
      continue;
    }
    if (isMatch) matched += 1;
    else mismatched += 1;
  }
  deps.log.info({ entries: entries.length, matched, mismatched }, 'reconciliation (Layer C) applied');
  return { skipped: false, entries: entries.length, matched, mismatched, failures };
}

/** Daily PayPal Transaction Search matcher over a trailing three-day window. */
async function runPaypalLayerC(
  deps: RepairReconcileHandlerDeps,
  now: () => Date,
): Promise<LayerCResult> {
  const reconcile = deps.adapters.paypal.reconcile;
  if (!reconcile) {
    return {
      skipped: true,
      entries: 0,
      matched: 0,
      mismatched: 0,
      failures: 0,
      reason: 'paypal reconciliation unavailable',
    };
  }
  const toDate = now();
  const fromDate = new Date(toDate.getTime() - 2 * 24 * 60 * 60 * 1000);
  const data = await reconcile.call(deps.adapters.paypal, {
    from: fromDate.toISOString().slice(0, 10),
    to: toDate.toISOString().slice(0, 10),
  });
  if (data.provider !== 'paypal') throw new Error(`unexpected reconciliation provider: ${data.provider}`);

  let matched = 0;
  let mismatched = 0;
  for (const unknownEntry of data.entries) {
    if (!isPaypalReconciliationEntry(unknownEntry)) continue;
    const entry = unknownEntry;
    const paymentRef = entry.kind === 'refund' ? entry.referenceTransactionId : entry.transactionId;
    if (!paymentRef) continue;

    let payment: PaymentRow | null;
    try {
      payment = await loadPaymentByProviderPaymentRef(deps.db, 'paypal', paymentRef);
    } catch {
      continue;
    }
    if (!payment) continue;

    const providerCompleted = entry.kind === 'payment' ? entry.status === 'S' : ['S', 'V'].includes(entry.status);
    if (!providerCompleted) continue;
    const amountMatches =
      entry.amount.amount === Number(payment.amount_minor) && entry.amount.currency === payment.currency;
    if (!amountMatches) {
      await setReconciliationStatus(deps, payment.id, 'mismatch');
      mismatched += 1;
      continue;
    }

    if (entry.kind === 'refund') {
      await confirmProviderRefund(
        { db: deps.db, log: deps.log, now },
        payment.id,
        entry.transactionId,
        `${entry.eventCode}:${entry.status}`,
      );
    }
    await setReconciliationStatus(deps, payment.id, 'matched');
    matched += 1;
  }
  deps.log.info({ entries: data.entries.length, matched, mismatched }, 'PayPal reconciliation (Layer C) applied');
  return { skipped: false, entries: data.entries.length, matched, mismatched, failures: 0 };
}

function isPaypalReconciliationEntry(value: unknown): value is PaypalReconciliationEntry {
  if (value === null || typeof value !== 'object') return false;
  const entry = value as Partial<PaypalReconciliationEntry>;
  return (
    (entry.kind === 'payment' || entry.kind === 'refund') &&
    typeof entry.transactionId === 'string' &&
    typeof entry.eventCode === 'string' &&
    typeof entry.status === 'string' &&
    entry.amount !== undefined &&
    Number.isSafeInteger(entry.amount.amount) &&
    entry.amount.currency === 'USD' &&
    (entry.kind === 'payment' || typeof entry.referenceTransactionId === 'string')
  );
}

async function setReconciliationStatus(
  deps: RepairReconcileHandlerDeps,
  paymentId: string,
  status: 'matched' | 'mismatch',
): Promise<void> {
  const { error } = await deps.db.from('payments').update({ reconciliation_status: status }).eq('id', paymentId);
  if (error) throw new Error(`reconciliation status update failed: ${error.message}`);
}
