import {
  createDefaultEcpayTransport,
  parseFormUrlEncoded,
  type EcpayTransport,
} from '../../../src/lib/payments/ecpay/adapter.ts';
import { verifyCheckMac } from '../../../src/lib/payments/ecpay/checkmac.ts';
import { parseTaipeiDateTime, periodAuthorizationFacts, verifyPeriodNotification, type EcpayPeriodAuthorization } from '../../../src/lib/payments/ecpay/period.ts';
import type { DbClient } from '../_shared/db.ts';
import { isProviderEnvironmentAligned, type Env } from '../_shared/env.ts';
import { methodNotAllowed, textResult, type HandlerRequest, type HandlerResult } from '../_shared/http.ts';
import type { Logger } from '../_shared/log.ts';
import {
  ingestPlusPeriodAuthorization,
  type PlusEcpayOrder,
} from '../_shared/plus-ecpay-ingest.ts';

export interface EcpayPlusCallbackDeps {
  env: Env;
  db: DbClient;
  log: Logger;
  transport: EcpayTransport;
  now: () => Date;
}

export function ecpayPlusCallbackDeps(env: Env, db: DbClient, log: Logger): EcpayPlusCallbackDeps {
  return { env, db, log, transport: createDefaultEcpayTransport(), now: () => new Date() };
}

export async function handleEcpayPlusCallback(
  req: HandlerRequest,
  { env, db, log, transport, now }: EcpayPlusCallbackDeps,
): Promise<HandlerResult> {
  if (req.method !== 'POST') return methodNotAllowed('POST');
  if (
    !env.ecpayMerchantId || !env.ecpayHashKey || !env.ecpayHashIV || !env.ecpayEnv ||
    !isProviderEnvironmentAligned(env.deploymentEnv, env.ecpayEnv, 'prod', 'stage')
  ) {
    return textResult(503, '0|unavailable');
  }

  const form = parseFormUrlEncoded(req.bodyText);
  const lookupOrder = (merchantTradeNo: string) => db
    .from('plus_membership_ecpay_order')
    .select('merchant_trade_no,user_id,plan_code,environment,period_amount_twd')
    .eq('merchant_trade_no', merchantTradeNo)
    .maybeSingle();

  // 2nd+ charges arrive at PeriodReturnURL in the period format.
  if (form.PeriodType) {
    let auth: Awaited<ReturnType<typeof verifyPeriodNotification>>;
    try {
      auth = await verifyPeriodNotification(form, {
        merchantId: env.ecpayMerchantId,
        hashKey: env.ecpayHashKey,
        hashIV: env.ecpayHashIV,
      });
    } catch {
      log.warn({}, 'ecpay plus notification verification failed');
      return textResult(400, '0|invalid');
    }

    const { data: order, error: orderError } = await lookupOrder(auth.merchantTradeNo);
    if (orderError) return textResult(500, '0|retry');
    if (!order || order.environment !== env.ecpayEnv) return textResult(400, '0|unknown order');

    const outcome = await ingestPlusPeriodAuthorization(
      { env, db, log, transport, now },
      order as unknown as PlusEcpayOrder,
      auth,
    );
    return outcome === 'ok' ? textResult(200, '1|OK') : textResult(500, '0|retry');
  }

  // ReturnURL is the signed server notification, not a browser redirect.
  // Its TradeNo binds the first charge even before it appears in ExecLog.
  const macValid = await verifyCheckMac(
    form,
    env.ecpayHashKey,
    env.ecpayHashIV,
    form.CheckMacValue,
  );
  if (!macValid || form.MerchantID !== env.ecpayMerchantId) {
    log.warn({}, 'ecpay plus notification verification failed');
    return textResult(400, '0|invalid');
  }

  const { data: order, error: orderError } = await lookupOrder(form.MerchantTradeNo ?? '');
  if (orderError) return textResult(500, '0|retry');
  if (!order || order.environment !== env.ecpayEnv) return textResult(400, '0|unknown order');

  if (form.RtnCode !== '1' || form.SimulatePaid === '1') return textResult(200, '1|OK');

  let auth: EcpayPeriodAuthorization;
  try {
    if (!form.TradeNo || !/^\d+$/.test(form.TradeAmt ?? '') || Number(form.TradeAmt) <= 0) {
      throw new Error('missing first authorization fields');
    }
    const facts = {
      merchantTradeNo: String(order.merchant_trade_no), rtnCode: '1',
      amountTwd: Number(form.TradeAmt), gwsr: '',
      processAt: parseTaipeiDateTime(form.PaymentDate),
    };
    auth = {
      ...facts, tradeNo: form.TradeNo, totalSuccessTimes: 1, simulatePaid: false,
      sourceEventId: `${facts.merchantTradeNo}:first:${form.TradeNo}`,
      factsSha256: await periodAuthorizationFacts(facts),
    };
  } catch {
    return textResult(400, '0|invalid');
  }
  const outcome = await ingestPlusPeriodAuthorization(
    { env, db, log, transport, now }, order as unknown as PlusEcpayOrder, auth,
  );
  return outcome === 'ok' ? textResult(200, '1|OK') : textResult(500, '0|retry');
}
