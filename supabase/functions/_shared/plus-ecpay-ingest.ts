/**
 * Shared Plus period-charge ingest path.
 *
 * Both the ECPay PeriodReturnURL callback and the scheduled read-back
 * (`plus-period-reconcile`) feed every successful authorization through this
 * one function, so receipts stay idempotent on `source_event_id` and lifecycle
 * events are written exactly once.
 */
import { paidPeriodFor, type EcpayPeriodAuthorization } from '../../../src/lib/payments/ecpay/period.ts';
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

export async function ingestPlusPeriodAuthorization(
  deps: { env: Env; db: DbClient; log: Logger },
  order: PlusEcpayOrder,
  auth: EcpayPeriodAuthorization,
): Promise<'ok' | 'retry'> {
  const { env, db, log } = deps;

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
