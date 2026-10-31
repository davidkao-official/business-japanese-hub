/**
 * Authenticated Plus membership cancellation (ECPay recurring period cancel).
 *
 * The verified bearer subject may cancel its own active ECPay subscription:
 * the server asks ECPay to stop future charges and records a period-end
 * `membership_canceled` event, so access lasts until the paid period ends.
 * The browser never supplies order identity, amounts or access state.
 */
import { authenticateBearer } from '../_shared/auth.ts'
import {
  headerValue,
  jsonResult,
  methodNotAllowed,
  unauthorized,
  type HandlerRequest,
  type HandlerResult,
} from '../_shared/http.ts'
import { isProviderEnvironmentAligned, type Env } from '../_shared/env.ts'
import type { DbClient } from '../_shared/db.ts'
import type { Logger } from '../_shared/log.ts'
import {
  createDefaultEcpayTransport,
  parseFormUrlEncoded,
  type EcpayTransport,
} from '../../../src/lib/payments/ecpay/adapter.ts'
import { buildPeriodCancelFields } from '../../../src/lib/payments/ecpay/period.ts'
import { verifyCheckMac } from '../../../src/lib/payments/ecpay/checkmac.ts'
import { ECPAY_URLS } from '../../../src/lib/payments/ecpay/urls.ts'

export interface PlusCancelDeps {
  env: Env
  db: DbClient
  log: Logger
  now: () => Date
  transport: EcpayTransport
}

function noStore(result: HandlerResult): HandlerResult {
  return { ...result, headers: { ...result.headers, 'Cache-Control': 'private, no-store' } }
}

const UNAVAILABLE = 'plus cancel unavailable'

export async function handlePlusCancel(
  req: HandlerRequest,
  deps: PlusCancelDeps,
): Promise<HandlerResult> {
  if (req.method !== 'POST') return noStore(methodNotAllowed('POST'))
  const userId = await authenticateBearer(deps.db, headerValue(req.headers, 'authorization'))
  if (!userId) return noStore(unauthorized())

  const { env, db, log } = deps
  if (
    !env.ecpayMerchantId ||
    !env.ecpayHashKey ||
    !env.ecpayHashIV ||
    !env.ecpayEnv ||
    !isProviderEnvironmentAligned(env.deploymentEnv, env.ecpayEnv, 'prod', 'stage')
  ) {
    return noStore(jsonResult(503, { error: UNAVAILABLE }))
  }

  const sourceSystem = `ecpay_aio_period:${env.ecpayEnv}`
  const order = await db
    .from('plus_membership_ecpay_order')
    .select('merchant_trade_no,status,updated_at')
    .eq('user_id', userId)
    .eq('environment', env.ecpayEnv)
    .in('status', ['active', 'cancel_requested'])
    .maybeSingle()
  if (order.error) return noStore(jsonResult(503, { error: UNAVAILABLE }))
  if (!order.data) return noStore(jsonResult(404, { error: 'no active subscription' }))

  const merchantTradeNo = String(order.data.merchant_trade_no)
  let occurredAt = String(order.data.updated_at)
  if (order.data.status === 'active') {
    const { error } = await db.rpc('set_plus_ecpay_order_status', {
      p_merchant_trade_no: merchantTradeNo,
      p_status: 'cancel_requested',
    })
    if (error) return noStore(jsonResult(503, { error: UNAVAILABLE }))

    // A retry must replay the event with the same occurred_at, so bind it to
    // the stored cancel-request moment instead of the current clock.
    const cancelRequest = await db
      .from('plus_membership_ecpay_order')
      .select('updated_at')
      .eq('merchant_trade_no', merchantTradeNo)
      .maybeSingle()
    if (cancelRequest.error || !cancelRequest.data) {
      return noStore(jsonResult(503, { error: UNAVAILABLE }))
    }
    occurredAt = String(cancelRequest.data.updated_at)
  }

  const fields = await buildPeriodCancelFields({
    merchantId: env.ecpayMerchantId,
    merchantTradeNo,
    now: deps.now(),
    hashKey: env.ecpayHashKey,
    hashIV: env.ecpayHashIV,
  })

  let response: { status: number; body: string }
  try {
    response = await deps.transport.post(
      ECPAY_URLS[env.ecpayEnv].creditCardPeriodAction,
      fields,
      15_000,
    )
  } catch {
    return noStore(jsonResult(502, { error: 'provider cancel failed' }))
  }

  const parsed = parseFormUrlEncoded(response.body)
  const rtnCode = parsed.RtnCode
  const checkMacValid = await verifyCheckMac(
    parsed,
    env.ecpayHashKey,
    env.ecpayHashIV,
    parsed.CheckMacValue,
  )
  if (
    response.status !== 200 ||
    parsed.MerchantTradeNo !== merchantTradeNo ||
    (rtnCode !== '1' && rtnCode !== '90100149') ||
    !checkMacValid
  ) {
    log.error({ merchantTradeNo, rtnCode }, 'ecpay plus cancel rejected')
    return noStore(jsonResult(502, { error: 'provider cancel failed' }))
  }

  const summary = await db
    .from('plus_membership_stream_summary')
    .select('period_start,period_end')
    .eq('source_system', sourceSystem)
    .eq('source_subscription_id', merchantTradeNo)
    .maybeSingle()
  if (summary.error) return noStore(jsonResult(503, { error: UNAVAILABLE }))

  const periodStart = summary.data?.period_start
  const periodEnd = summary.data?.period_end
  if (summary.data && periodStart && periodEnd) {
    const { error } = await db.rpc('record_plus_membership_event', {
      p_source_system: sourceSystem,
      p_source_customer_id: merchantTradeNo,
      p_source_subscription_id: merchantTradeNo,
      p_source_event_id: `${merchantTradeNo}:cancel`,
      p_user_id: userId,
      p_plan_code: 'plus_early_access_monthly',
      p_event_type: 'membership_canceled',
      p_occurred_at: occurredAt,
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_cancel_at_period_end: true,
      p_metadata: {},
    })
    if (error) return noStore(jsonResult(503, { error: UNAVAILABLE }))
  }

  const finalized = await db.rpc('set_plus_ecpay_order_status', {
    p_merchant_trade_no: merchantTradeNo,
    p_status: 'canceled',
  })
  if (finalized.error) return noStore(jsonResult(503, { error: UNAVAILABLE }))

  return noStore(jsonResult(200, { status: 'canceled', accessUntil: periodEnd ?? null }))
}

/** Deno entry composition helper, exported here so tests stay node-only. */
export function plusCancelDeps(env: Env, db: DbClient, log: Logger): PlusCancelDeps {
  return {
    env,
    db,
    log,
    now: () => new Date(),
    transport: createDefaultEcpayTransport(),
  }
}
