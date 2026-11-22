/**
 * Scheduled read-back for Plus period charges — `POST /functions/v1/plus-period-reconcile`
 * (`verify_jwt=false`; the ONLY authorization is the shared scheduled-job secret).
 *
 * ECPay period notifications can be missed. This job queries every open Plus
 * order with QueryCreditCardPeriodInfo and feeds each successful authorization
 * through the SAME ingest path the callback uses, so receipts stay idempotent.
 * Provider stop (ExecStatus 0 terminated / 2 completed) needs no lifecycle
 * event: no renewal arrives, so access lapses at period_end by itself — the
 * order row is simply closed.
 */
import { createDefaultEcpayTransport, type EcpayTransport } from '../../../src/lib/payments/ecpay/adapter.ts';
import type { DbClient } from '../_shared/db.ts';
import { isProviderEnvironmentAligned, type Env } from '../_shared/env.ts';
import {
  headerValue,
  jsonResult,
  methodNotAllowed,
  unauthorized,
  type HandlerRequest,
  type HandlerResult,
} from '../_shared/http.ts';
import type { Logger } from '../_shared/log.ts';
import { readBackPlusOrder, type PlusEcpayOrder } from '../_shared/plus-ecpay-ingest.ts';

export interface PlusPeriodReconcileDeps {
  env: Env;
  db: DbClient;
  log: Logger;
  now: () => Date;
  transport: EcpayTransport;
  monotonicNow?: () => number;
}

export function plusPeriodReconcileDeps(env: Env, db: DbClient, log: Logger): PlusPeriodReconcileDeps {
  return { env, db, log, now: () => new Date(), transport: createDefaultEcpayTransport() };
}

interface PlusEcpayOrderRow extends PlusEcpayOrder {
  status: string;
  created_at: string;
  reconcile_lease_token: string;
}

const STALE_PENDING_MS = 24 * 60 * 60 * 1000;
const MAX_ORDERS_PER_RUN = 12;
const RUN_BUDGET_MS = 40_000;
const PROVIDER_TIMEOUT_MS = 5_000;

export async function handlePlusPeriodReconcile(
  req: HandlerRequest,
  { env, db, log, now, transport, monotonicNow = () => performance.now() }: PlusPeriodReconcileDeps,
): Promise<HandlerResult> {
  if (req.method !== 'POST') return methodNotAllowed('POST');

  const secret = headerValue(req.headers, 'x-scheduled-job-secret');
  if (!env.scheduledJobSecret || secret !== env.scheduledJobSecret) {
    log.warn({}, 'plus-period-reconcile rejected: missing or incorrect scheduled-job secret');
    return unauthorized('invalid scheduled job secret');
  }

  if (
    !env.ecpayMerchantId || !env.ecpayHashKey || !env.ecpayHashIV || !env.ecpayEnv ||
    !isProviderEnvironmentAligned(env.deploymentEnv, env.ecpayEnv, 'prod', 'stage')
  ) {
    return jsonResult(503, { error: 'unavailable' });
  }
  const ecpayEnv = env.ecpayEnv;

  const deadline = monotonicNow() + RUN_BUDGET_MS;
  const remainingMs = () => Math.max(0, deadline - monotonicNow());
  // The default transport aborts the underlying fetch, including its body read.
  const boundedTransport: EcpayTransport = {
    post: (url, fields, timeoutMs) => {
      const remaining = remainingMs();
      if (remaining <= 0) return Promise.reject(new Error('reconcile budget exhausted'));
      return transport.post(url, fields, Math.min(timeoutMs, PROVIDER_TIMEOUT_MS, remaining));
    },
  };
  let checked = 0;
  let ingested = 0;
  let failed = 0;
  const at = now();

  const updateStatus = async (merchantTradeNo: string, status: string): Promise<void> => {
    const result = await db.rpc('set_plus_ecpay_order_status', {
      p_merchant_trade_no: merchantTradeNo,
      p_status: status,
    });
    if (result.error) {
      failed++;
      log.warn(
        { merchantTradeNo, status, error: result.error.message },
        'plus period order status update failed',
      );
    }
  };

  while (checked < MAX_ORDERS_PER_RUN && remainingMs() > 0) {
    // Claim just one row: unstarted work is never leased when the budget ends.
    const claim = await db.rpc('claim_plus_ecpay_reconcile_order', { p_environment: ecpayEnv });
    if (claim.error) return jsonResult(500, { error: 'query failed' });
    const rows = claim.data as unknown as PlusEcpayOrderRow[] | null;
    if (!Array.isArray(rows)) return jsonResult(500, { error: 'invalid reconcile claim' });
    if (rows.length === 0) break;
    const order = rows[0];
    if (!order.reconcile_lease_token) return jsonResult(500, { error: 'invalid reconcile lease' });
    checked++;
    try {
      if (remainingMs() <= 0) continue;
      const stalePending =
        order.status === 'pending' &&
        at.getTime() - new Date(order.created_at).getTime() > STALE_PENDING_MS;

      const read = await readBackPlusOrder({ env, db, log, transport: boundedTransport, now, remainingMs }, order);
      if (read.kind === 'failed') {
        failed++;
        // ECPay does not know a checkout abandoned before its page; a stale
        // pending order that cannot be queried is closed on that basis alone.
        if (stalePending && remainingMs() > 0) await updateStatus(order.merchant_trade_no, 'ended');
        continue;
      }
      // A charge that could not be ingested must keep its order open, or the next
      // run can never recover it (the order drops out of the open-status query).
      if (read.retry) {
        failed++;
        continue;
      }
      ingested += read.authorizations;

      if (order.status === 'pending') {
        if (
          stalePending &&
          (read.authorizations === 0 || read.execStatus === '0' || read.execStatus === '2')
        ) {
          await updateStatus(order.merchant_trade_no, 'ended');
        }
        continue;
      }

      if (read.execStatus === '0' || read.execStatus === '2') {
        if (order.status === 'active') await updateStatus(order.merchant_trade_no, 'ended');
        else if (order.status === 'cancel_requested') await updateStatus(order.merchant_trade_no, 'canceled');
      }
    } catch {
      failed++;
      log.error({ merchantTradeNo: order.merchant_trade_no }, 'plus period reconcile order failed');
    } finally {
      const released = await db.rpc('release_plus_ecpay_reconcile_order', {
        p_merchant_trade_no: order.merchant_trade_no,
        p_lease_token: order.reconcile_lease_token,
      });
      const leaseReleased: unknown = released.data;
      if (released.error || leaseReleased !== true) {
        failed++;
        log.warn({ merchantTradeNo: order.merchant_trade_no }, 'plus reconcile lease release failed');
      }
    }
  }

  if (checked === MAX_ORDERS_PER_RUN || remainingMs() <= 0) {
    log.warn({ checked, failed }, 'plus reconcile run bound reached; durable queue resumes next invocation');
  }
  return jsonResult(200, { checked, ingested, failed });
}
