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
import { buildPeriodQueryFields, parsePeriodQueryResponse } from '../../../src/lib/payments/ecpay/period.ts';
import { ECPAY_URLS } from '../../../src/lib/payments/ecpay/urls.ts';
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
import { ingestPlusPeriodAuthorization, type PlusEcpayOrder } from '../_shared/plus-ecpay-ingest.ts';

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

const OPEN_STATUSES = ['pending', 'active', 'cancel_requested'];
const STALE_PENDING_MS = 24 * 60 * 60 * 1000;

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
  const merchantId = env.ecpayMerchantId;
  const hashKey = env.ecpayHashKey;
  const hashIV = env.ecpayHashIV;
  const ecpayEnv = env.ecpayEnv;

  const { data, error } = await db
    .from('plus_membership_ecpay_order')
    .select('merchant_trade_no,user_id,plan_code,environment,period_amount_twd,status,created_at')
    .eq('environment', ecpayEnv)
    .in('status', OPEN_STATUSES)
    .limit(200);
  if (error) return jsonResult(500, { error: 'query failed' });

  const orders = (data ?? []) as PlusEcpayOrderRow[];
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
    let execStatus: string;
    let authorizations: Awaited<ReturnType<typeof parsePeriodQueryResponse>>['authorizations'];
    try {
      const fields = await buildPeriodQueryFields({
        merchantId,
        merchantTradeNo: order.merchant_trade_no,
        now: now(),
        hashKey,
        hashIV,
      });
      const response = await transport.post(
        ECPAY_URLS[ecpayEnv].queryCreditCardPeriodInfo,
        fields,
        15_000,
      );
      if (response.status !== 200) throw new Error(`unexpected query status ${response.status}`);
      const query = await parsePeriodQueryResponse(response.body, order.merchant_trade_no);
      execStatus = query.execStatus;
      authorizations = query.authorizations;
    } catch (error) {
      failed++;
      log.warn(
        {
          merchantTradeNo: order.merchant_trade_no,
          error: error instanceof Error ? error.message : 'unknown error',
        },
        'plus period query failed',
      );
      continue;
    }

    let retryable = false;
    for (const auth of authorizations) {
      const outcome = await ingestPlusPeriodAuthorization({ env, db, log }, order, auth);
      if (outcome === 'retry') {
        failed++;
        retryable = true;
      } else {
        ingested++;
      }
    }
    // A charge that could not be ingested must keep its order open, or the next
    // run can never recover it (the order drops out of the open-status query).
    if (retryable) continue;

    if (execStatus === '0' || execStatus === '2') {
      if (order.status === 'active') await updateStatus(order.merchant_trade_no, 'ended');
      else if (order.status === 'cancel_requested') await updateStatus(order.merchant_trade_no, 'canceled');
    }
    if (
      order.status === 'pending' &&
      authorizations.length === 0 &&
      at.getTime() - new Date(order.created_at).getTime() > STALE_PENDING_MS
    ) {
      await updateStatus(order.merchant_trade_no, 'ended');
    }
  }

  return jsonResult(200, { checked, ingested, failed });
}
