import {
  createDefaultEcpayTransport,
  parseFormUrlEncoded,
  type EcpayTransport,
} from '../../../src/lib/payments/ecpay/adapter.ts';
import { verifyCheckMac } from '../../../src/lib/payments/ecpay/checkmac.ts';
import { verifyPeriodNotification } from '../../../src/lib/payments/ecpay/period.ts';
import type { DbClient } from '../_shared/db.ts';
import { isProviderEnvironmentAligned, type Env } from '../_shared/env.ts';
import { methodNotAllowed, textResult, type HandlerRequest, type HandlerResult } from '../_shared/http.ts';
import type { Logger } from '../_shared/log.ts';
import {
  ingestPlusPeriodAuthorization,
  readBackPlusOrder,
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

  // The FIRST authorization arrives at ReturnURL in the generic AIO payment
  // format (no PeriodType / gwsr / ProcessDate): read the charge back from
  // ECPay so its identity matches the reconcile job's ExecLog event.
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

  const read = await readBackPlusOrder(
    { env, db, log, transport, now },
    order as unknown as PlusEcpayOrder,
  );
  if (read.kind === 'failed' || read.retry || read.authorizations === 0) {
    return textResult(500, '0|retry');
  }
  return textResult(200, '1|OK');
}
