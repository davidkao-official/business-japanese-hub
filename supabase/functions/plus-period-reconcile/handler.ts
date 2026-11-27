/**
 * Scheduled read-back for Plus period charges — `POST /functions/v1/plus-period-reconcile`
 * (`verify_jwt=false`; the ONLY authorization is the shared scheduled-job secret).
 *
 * ECPay period notifications can be missed. This job queries every open Plus
 * order with QueryCreditCardPeriodInfo and feeds each successful authorization
 * through the SAME ingest path the callback uses, so receipts stay idempotent.
 * Provider stop (ExecStatus 0 terminated / 2 completed) needs no lifecycle
 * event: no renewal arrives, so access lapses at period_end by itself — the
 * order row is closed only after a verified Cancel acknowledgement.
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
import { persistPlusCustomerCancel, readBackPlusOrder, requestPlusEcpayStop, stopPlusEcpayOrder, type PlusEcpayOrder } from '../_shared/plus-ecpay-ingest.ts';

export interface PlusPeriodReconcileDeps {
  env: Env;
  db: DbClient;
  log: Logger;
  now: () => Date;
  transport: EcpayTransport;
}

export function plusPeriodReconcileDeps(env: Env, db: DbClient, log: Logger): PlusPeriodReconcileDeps {
  return { env, db, log, now: () => new Date(), transport: createDefaultEcpayTransport() };
}

interface PlusEcpayOrderRow extends PlusEcpayOrder {
  status: string;
  created_at: string;
}

const STALE_PENDING_MS = 24 * 60 * 60 * 1000;
const RECONCILE_BATCH_SIZE = 1000;
const RECONCILE_BUDGET_MS = 60_000;

export async function handlePlusPeriodReconcile(
  req: HandlerRequest,
  { env, db, log, now, transport }: PlusPeriodReconcileDeps,
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

  let checked = 0;
  let ingested = 0;
  let failed = 0;
  const startedAt = now().getTime();

  const updateStatus = async (merchantTradeNo: string, status: string): Promise<void> => {
    const result = await db.rpc('set_plus_ecpay_order_status', {
      p_merchant_trade_no: merchantTradeNo,
      p_status: status,
    });
    if (result.error) {
      failed++;
      log.error(
        { merchantTradeNo, status, error: result.error.message },
        'plus period order status update failed',
      );
    }
  };

  for (; checked < RECONCILE_BATCH_SIZE;) {
    if (now().getTime() - startedAt >= RECONCILE_BUDGET_MS) {
      log.warn({ checked }, 'plus period reconcile time budget reached; unclaimed orders remain due');
      break;
    }
    const claim = await db.rpc('claim_plus_ecpay_reconcile_order', { p_environment: ecpayEnv });
    if (claim.error) return jsonResult(500, { error: 'query failed' });
    if (!claim.data) break;
    let order = claim.data as unknown as PlusEcpayOrderRow;
    checked++;
    // Recover a user cancellation interrupted after the request was persisted.
    // Do not turn it into an evidence-free, permanently closed order.
    if (order.status === 'cancel_requested') {
      const confirmation = await requestPlusEcpayStop({ env, db, log, transport, now }, order.merchant_trade_no);
      if (!confirmation || !await persistPlusCustomerCancel({ db, log }, order.merchant_trade_no, confirmation)) {
        failed++;
        continue;
      }
      order = { ...order, status: 'canceled' };
    }
    const stalePending =
      order.status === 'pending' &&
      now().getTime() - new Date(order.created_at).getTime() > STALE_PENDING_MS;

    const read = await readBackPlusOrder({ env, db, log, transport, now }, order);
    if (read.kind === 'failed') {
      failed++;
      if (stalePending && await stopPlusEcpayOrder({ env, db, log, transport, now }, order.merchant_trade_no)) {
        await updateStatus(order.merchant_trade_no, 'ended');
      }
      continue;
    }
    // A charge that could not be ingested must keep its order open, or the next
    // run can never recover it (the order drops out of the open-status query).
    if (read.retry) {
      failed++;
      continue;
    }
    ingested += read.authorizations;

    if (order.status === 'canceled') {
      if (!['0', '2'].includes(read.execStatus)) {
        failed++;
        log.error({ merchantTradeNo: order.merchant_trade_no }, 'ecpay plus canceled order read-back is not stopped');
        continue;
      }
      const completed = await db.rpc('complete_plus_ecpay_cancel_readback', {
        p_merchant_trade_no: order.merchant_trade_no,
      });
      if (completed.error) failed++;
      continue;
    }

    if (order.status === 'pending') {
      if (
        stalePending &&
        (read.authorizations === 0 || ['0', '2', '3'].includes(read.execStatus))
      ) {
        if (await stopPlusEcpayOrder({ env, db, log, transport, now }, order.merchant_trade_no)) {
          await updateStatus(order.merchant_trade_no, 'ended');
        } else failed++;
      }
      continue;
    }

    // ExecStatus 3 is paused (2892), not an irreversible stop. Cancel it too.
    if (['0', '2', '3'].includes(read.execStatus)) {
      if (!await stopPlusEcpayOrder({ env, db, log, transport, now }, order.merchant_trade_no)) {
        failed++;
        continue;
      }
      if (order.status === 'active') await updateStatus(order.merchant_trade_no, 'ended');
    }
  }

  return jsonResult(200, { checked, ingested, failed });
}
