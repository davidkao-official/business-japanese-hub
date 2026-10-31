import {
  createDefaultEcpayTransport,
  parseFormUrlEncoded,
  type EcpayTransport,
} from '../../../src/lib/payments/ecpay/adapter.ts';
import { verifyPeriodNotification } from '../../../src/lib/payments/ecpay/period.ts';
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

  const outcome = await ingestPlusPeriodAuthorization(
    { env, db, log, transport, now },
    order as unknown as PlusEcpayOrder,
    auth,
  );
  return outcome === 'ok' ? textResult(200, '1|OK') : textResult(500, '0|retry');
}
