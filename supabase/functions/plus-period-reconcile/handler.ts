/**
 * Scheduled read-back for Plus period charges — `POST /functions/v1/plus-period-reconcile`
 * (`verify_jwt=false`; the ONLY authorization is the shared scheduled-job secret).
 *
 * ECPay period notifications can be missed. This job queries every open Plus
 * order with QueryCreditCardPeriodInfo and feeds each successful authorization
 * through the SAME ingest path the callback uses, so receipts stay idempotent.
 * A requested cancellation records its lifecycle event before closing the order.
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
}

export function plusPeriodReconcileDeps(env: Env, db: DbClient, log: Logger): PlusPeriodReconcileDeps {
  return { env, db, log, now: () => new Date(), transport: createDefaultEcpayTransport() };
}

interface PlusEcpayOrderRow extends PlusEcpayOrder {
  status: string;
  created_at: string;
  updated_at: string;
}

const OPEN_STATUSES = ['pending', 'active', 'cancel_requested'];
const STALE_PENDING_MS = 24 * 60 * 60 * 1000;
const RECONCILE_BATCH_SIZE = 1000;

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

  const { data, error } = await db
    .from('plus_membership_ecpay_order')
    .select('merchant_trade_no,user_id,plan_code,environment,period_amount_twd,status,created_at,updated_at')
    .eq('environment', ecpayEnv)
    .in('status', OPEN_STATUSES)
    .order('created_at', { ascending: true })
    .limit(RECONCILE_BATCH_SIZE);
  if (error) return jsonResult(500, { error: 'query failed' });

  const orders = (data ?? []) as unknown as PlusEcpayOrderRow[];
  if (orders.length === RECONCILE_BATCH_SIZE) {
    log.warn(
      { count: RECONCILE_BATCH_SIZE },
      'plus period reconcile batch is full; later orders wait for the next run',
    );
  }
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

  for (const order of orders) {
    checked++;
    const stalePending =
      order.status === 'pending' &&
      at.getTime() - new Date(order.created_at).getTime() > STALE_PENDING_MS;

    const read = await readBackPlusOrder({ env, db, log, transport, now }, order);
    if (read.kind === 'failed') {
      failed++;
      // ECPay does not know a checkout abandoned before its page; a stale
      // pending order that cannot be queried is closed on that basis alone.
      if (stalePending) await updateStatus(order.merchant_trade_no, 'ended');
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
      else if (order.status === 'cancel_requested') {
        const sourceSystem = `ecpay_aio_period:${ecpayEnv}`;
        const summary = await db.from('plus_membership_stream_summary')
          .select('period_start,period_end')
          .eq('source_system', sourceSystem)
          .eq('source_subscription_id', order.merchant_trade_no)
          .maybeSingle();
        if (summary.error || !summary.data?.period_start || !summary.data?.period_end) {
          failed++;
          continue;
        }
        const recorded = await db.rpc('record_plus_membership_event', {
          p_source_system: sourceSystem,
          p_source_customer_id: order.merchant_trade_no,
          p_source_subscription_id: order.merchant_trade_no,
          p_source_event_id: `${order.merchant_trade_no}:cancel`,
          p_user_id: order.user_id,
          p_plan_code: 'plus_early_access_monthly',
          p_event_type: 'membership_canceled',
          p_occurred_at: order.updated_at,
          p_period_start: summary.data.period_start,
          p_period_end: summary.data.period_end,
          p_cancel_at_period_end: true,
          p_metadata: {},
        });
        if (recorded.error) {
          failed++;
          continue;
        }
        await updateStatus(order.merchant_trade_no, 'canceled');
      }
    }
  }

  return jsonResult(200, { checked, ingested, failed });
}
