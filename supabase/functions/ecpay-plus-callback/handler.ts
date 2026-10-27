import { parseFormUrlEncoded } from '../../../src/lib/payments/ecpay/adapter.ts';
import { paidPeriodFor, verifyPeriodNotification } from '../../../src/lib/payments/ecpay/period.ts';
import type { DbClient } from '../_shared/db.ts';
import { isProviderEnvironmentAligned, type Env } from '../_shared/env.ts';
import { methodNotAllowed, textResult, type HandlerRequest, type HandlerResult } from '../_shared/http.ts';
import type { Logger } from '../_shared/log.ts';
import { resolvePlusMembershipAccess } from '../_shared/membership.ts';

export interface EcpayPlusCallbackDeps {
  env: Env;
  db: DbClient;
  log: Logger;
}

export function ecpayPlusCallbackDeps(env: Env, db: DbClient, log: Logger): EcpayPlusCallbackDeps {
  return { env, db, log };
}

export async function handleEcpayPlusCallback(
  req: HandlerRequest,
  { env, db, log }: EcpayPlusCallbackDeps,
): Promise<HandlerResult> {
  if (req.method !== 'POST') return methodNotAllowed('POST');
  if (
    !env.ecpayMerchantId || !env.ecpayHashKey || !env.ecpayHashIV || !env.ecpayEnv ||
    !isProviderEnvironmentAligned(env.deploymentEnv, env.ecpayEnv, 'prod', 'stage')
  ) {
    return textResult(503, '0|unavailable');
  }

  let auth: Awaited<ReturnType<typeof verifyPeriodNotification>>;
  try {
    const form = parseFormUrlEncoded(req.bodyText);
    auth = await verifyPeriodNotification(form, {
      merchantId: env.ecpayMerchantId,
      hashKey: env.ecpayHashKey,
      hashIV: env.ecpayHashIV,
    });
  } catch {
    log.warn({}, 'ecpay plus notification verification failed');
    return textResult(400, '0|invalid');
  }

  const { data: order, error: orderError } = await db
    .from('plus_membership_ecpay_order')
    .select('merchant_trade_no,user_id,plan_code,environment,period_amount_twd')
    .eq('merchant_trade_no', auth.merchantTradeNo)
    .maybeSingle();
  if (orderError) return textResult(500, '0|retry');
  if (!order || order.environment !== env.ecpayEnv) return textResult(400, '0|unknown order');

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
  if (receipt.error) return textResult(500, '0|retry');
  if (receipt.data === 'conflict') {
    log.error({ sourceEventId: auth.sourceEventId }, 'ecpay plus receipt conflict');
    return textResult(200, '1|OK');
  }
  if (receipt.data === 'replayed') {
    const existing = await db.from('plus_membership_ecpay_receipt')
      .select('lifecycle_result')
      .eq('source_event_id', auth.sourceEventId)
      .maybeSingle();
    if (existing.error) return textResult(500, '0|retry');
    if (existing.data?.lifecycle_result != null) return textResult(200, '1|OK');
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
    if (saved.error) return textResult(500, '0|retry');
    return textResult(200, '1|OK');
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
    return textResult(500, '0|retry');
  }
  if (result !== 'applied' && result !== 'replayed' && result !== 'stale' && result !== 'conflict') {
    return textResult(500, '0|retry');
  }
  const saved = await db.rpc('set_plus_ecpay_receipt_result', {
    p_source_event_id: auth.sourceEventId,
    p_result: result,
  });
  if (saved.error) return textResult(500, '0|retry');

  const access = await resolvePlusMembershipAccess(db, order.user_id);
  log.info({ sourceEventId: auth.sourceEventId, access }, 'ecpay plus membership access resolved');
  return textResult(200, '1|OK');
}
