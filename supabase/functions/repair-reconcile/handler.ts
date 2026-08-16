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
  PaymentProviderAdapter,
  ProviderPaymentSnapshot,
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
import {
  applyVerifiedSuccess,
  confirmRefund,
  loadOrder,
  loadPaymentByMerchantRef,
  loadRequestedRefundForPayment,
  type PaymentRow,
} from '../_shared/flow.ts';

export interface RepairReconcileHandlerDeps {
  env: Env;
  db: DbClient;
  adapter: PaymentProviderAdapter;
  log: Logger;
  now?: () => Date;
}

/** Layer B thresholds (§6): verification_pending after 10 min, stale pending after 30 min. */
export const VERIFICATION_PENDING_AFTER_MS = 10 * 60 * 1000;
export const STALE_PENDING_AFTER_MS = 30 * 60 * 1000;
export const REPAIR_SCAN_LIMIT = 50;

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

  deps.log.info({ layerB, layerC }, 'repair-reconcile run');
  return jsonResult(200, {
    repaired: layerB.repaired,
    granted: layerB.granted,
    stillUnknown: layerB.stillUnknown,
    scanned: layerB.scanned,
    reconciliation: layerC,
  });
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
    .eq('provider', 'ecpay')
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
    const event: VerifiedProviderEvent = {
      provider: 'ecpay',
      providerMerchantRef: paymentRow.provider_merchant_ref,
      providerPaymentRef: paymentRow.provider_payment_ref ?? undefined,
      eventFingerprint: 'repair',
      status: 'unknown',
      amount: { amount: Number(paymentRow.amount_minor), currency: paymentRow.currency },
    };
    let snapshot: ProviderPaymentSnapshot;
    try {
      snapshot = await deps.adapter.confirmPayment(event);
    } catch {
      stillUnknown += 1;
      continue;
    }
    if (snapshot.status !== 'succeeded') {
      stillUnknown += 1; // TradeStatus=0 is not terminal (§6) — leave for the next run
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
