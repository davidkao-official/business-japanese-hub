/**
 * Shared Plus period-charge ingest path.
 *
 * Both the ECPay PeriodReturnURL callback and the scheduled read-back
 * (`plus-period-reconcile`) feed every successful authorization through this
 * one function, so receipts stay idempotent on `source_event_id` and lifecycle
 * events are written exactly once.
 */
import { parseFormUrlEncoded, type EcpayTransport } from '../../../src/lib/payments/ecpay/adapter.ts';
import {
  buildPeriodCancelFields,
  buildPeriodQueryFields,
  paidPeriodFor,
  parsePeriodQueryResponse,
  type EcpayPeriodAuthorization,
} from '../../../src/lib/payments/ecpay/period.ts';
import { ECPAY_URLS } from '../../../src/lib/payments/ecpay/urls.ts';
import type { DbClient } from './db.ts';
import type { Env } from './env.ts';
import type { Logger } from './log.ts';
import { resolvePlusMembershipAccess } from './membership.ts';

export interface PlusEcpayOrder {
  merchant_trade_no: string;
  user_id: string;
  plan_code: string;
  environment: string;
  period_amount_twd: number;
}

export interface IngestDeps {
  env: Env;
  db: DbClient;
  log: Logger;
  transport: EcpayTransport;
  now: () => Date;
}

export async function ingestPlusPeriodAuthorization(
  deps: IngestDeps,
  order: PlusEcpayOrder,
  auth: EcpayPeriodAuthorization,
): Promise<'ok' | 'retry'> {
  const { env, db, log, transport, now } = deps;

  const receipt = await db.rpc('record_plus_ecpay_receipt', {
    p_source_event_id: auth.sourceEventId,
    p_merchant_trade_no: auth.merchantTradeNo,
    p_kind: 'authorization',
    p_rtn_code: auth.rtnCode,
    p_amount_twd: auth.amountTwd,
    p_gwsr: auth.gwsr,
    p_trade_no: auth.tradeNo,
    p_process_at: auth.processAt.toISOString(),
    p_total_success_times: auth.totalSuccessTimes,
    p_simulate_paid: auth.simulatePaid,
    p_facts_sha256: auth.factsSha256,
  });
  if (receipt.error) return 'retry';
  const receiptStatus: unknown = receipt.data;
  if (receiptStatus === 'conflict') {
    log.error({ sourceEventId: auth.sourceEventId }, 'ecpay plus receipt conflict');
    return 'ok';
  }
  if (receiptStatus === 'replayed') {
    const existing = await db.from('plus_membership_ecpay_receipt')
      .select('lifecycle_result')
      .eq('source_event_id', auth.sourceEventId)
      .maybeSingle();
    if (existing.error) return 'retry';
    if (existing.data?.lifecycle_result != null) return 'ok';
  }

  const amountMismatch = auth.amountTwd !== order.period_amount_twd;
  if (amountMismatch) {
    log.error({ sourceEventId: auth.sourceEventId }, 'ecpay plus amount mismatch');
  }
  if (auth.simulatePaid || auth.rtnCode !== '1' || amountMismatch) {
    const saved = await db.rpc('set_plus_ecpay_receipt_result', {
      p_source_event_id: auth.sourceEventId,
      p_result: 'not_mapped',
    });
    if (saved.error) return 'retry';
    return 'ok';
  }

  // A real charge on an order that is still `pending` means another order of
  // this user already activated the membership: this is a duplicate paid
  // subscription. Stop ECPay from charging it again and close the order row.
  const current = await db.from('plus_membership_ecpay_order')
    .select('status')
    .eq('merchant_trade_no', order.merchant_trade_no)
    .maybeSingle();
  if (current.error) return 'retry';
  if (current.data?.status === 'pending') {
    const cancelFields = await buildPeriodCancelFields({
      merchantId: env.ecpayMerchantId!,
      merchantTradeNo: order.merchant_trade_no,
      now: now(),
      hashKey: env.ecpayHashKey!,
      hashIV: env.ecpayHashIV!,
    });
    let cancelRtnCode: string | undefined;
    try {
      const response = await transport.post(
        ECPAY_URLS[env.ecpayEnv!].creditCardPeriodAction,
        cancelFields,
        15_000,
      );
      cancelRtnCode = parseFormUrlEncoded(response.body).RtnCode;
    } catch {
      return 'retry';
    }
    if (cancelRtnCode !== '1' && cancelRtnCode !== '90100149') return 'retry';

    const saved = await db.rpc('set_plus_ecpay_receipt_result', {
      p_source_event_id: auth.sourceEventId,
      p_result: 'not_mapped',
    });
    if (saved.error) return 'retry';
    const ended = await db.rpc('set_plus_ecpay_order_status', {
      p_merchant_trade_no: order.merchant_trade_no,
      p_status: 'ended',
    });
    if (ended.error) return 'retry';
    log.error(
      { merchantTradeNo: order.merchant_trade_no, sourceEventId: auth.sourceEventId },
      'duplicate plus subscription canceled at ECPay; refund this charge manually',
    );
    return 'ok';
  }

  const eventType = auth.totalSuccessTimes === 1 ? 'membership_started' : 'membership_renewed';
  const { start, end } = paidPeriodFor(auth.processAt);
  let result: unknown;
  try {
    const written = await db.rpc('record_plus_membership_event', {
      p_source_system: `ecpay_aio_period:${env.ecpayEnv}`,
      p_source_customer_id: order.merchant_trade_no,
      p_source_subscription_id: order.merchant_trade_no,
      p_source_event_id: auth.sourceEventId,
      p_user_id: order.user_id,
      p_plan_code: order.plan_code,
      p_event_type: eventType,
      p_occurred_at: auth.processAt.toISOString(),
      p_period_start: start.toISOString(),
      p_period_end: end.toISOString(),
      p_cancel_at_period_end: false,
      p_metadata: { gwsr: auth.gwsr, total_success_times: auth.totalSuccessTimes },
    });
    if (written.error) throw new Error('membership event write failed');
    result = written.data;
  } catch {
    log.error({ sourceEventId: auth.sourceEventId }, 'ecpay plus membership event write failed');
    return 'retry';
  }
  if (result !== 'applied' && result !== 'replayed' && result !== 'stale' && result !== 'conflict') {
    return 'retry';
  }
  const saved = await db.rpc('set_plus_ecpay_receipt_result', {
    p_source_event_id: auth.sourceEventId,
    p_result: result,
  });
  if (saved.error) return 'retry';

  const access = await resolvePlusMembershipAccess(db, String(order.user_id));
  log.info({ sourceEventId: auth.sourceEventId, access }, 'ecpay plus membership access resolved');
  return 'ok';
}

export type PlusReadBack =
  | { kind: 'failed' }
  | { kind: 'done'; execStatus: string; authorizations: number; retry: boolean };

/**
 * Query one Plus order at ECPay (QueryCreditCardPeriodInfo) and ingest every
 * successful authorization it reports. The scheduled read-back and the
 * first-authorization callback both use this, so a charge found here has the
 * same `source_event_id` (`<MTN>:auth:<gwsr>`) and replays instead of
 * conflicting.
 */
export async function readBackPlusOrder(
  deps: IngestDeps,
  order: PlusEcpayOrder,
): Promise<PlusReadBack> {
  const { env, log, transport, now } = deps;
  const ecpayEnv = env.ecpayEnv;
  if (!env.ecpayMerchantId || !env.ecpayHashKey || !env.ecpayHashIV || !ecpayEnv) {
    log.warn({ merchantTradeNo: order.merchant_trade_no }, 'plus period query unavailable');
    return { kind: 'failed' };
  }

  let query: Awaited<ReturnType<typeof parsePeriodQueryResponse>>;
  try {
    const fields = await buildPeriodQueryFields({
      merchantId: env.ecpayMerchantId,
      merchantTradeNo: order.merchant_trade_no,
      now: now(),
      hashKey: env.ecpayHashKey,
      hashIV: env.ecpayHashIV,
    });
    const response = await transport.post(
      ECPAY_URLS[ecpayEnv].queryCreditCardPeriodInfo,
      fields,
      15_000,
    );
    if (response.status !== 200) throw new Error(`unexpected query status ${response.status}`);
    query = await parsePeriodQueryResponse(response.body, order.merchant_trade_no);
  } catch (error) {
    log.warn(
      {
        merchantTradeNo: order.merchant_trade_no,
        error: error instanceof Error ? error.message : 'unknown error',
      },
      'plus period query failed',
    );
    return { kind: 'failed' };
  }

  let retry = false;
  for (const auth of query.authorizations) {
    const outcome = await ingestPlusPeriodAuthorization(deps, order, auth);
    if (outcome === 'retry') retry = true;
  }
  return {
    kind: 'done',
    execStatus: query.execStatus,
    authorizations: query.authorizations.length,
    retry,
  };
}
