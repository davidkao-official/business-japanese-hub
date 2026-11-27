/**
 * Authenticated Plus membership cancellation (ECPay recurring period cancel).
 *
 * The verified bearer subject may cancel its own active ECPay subscription:
 * the server asks ECPay to stop future charges and persists its verified
 * stop evidence. Paid access continues to be derived from verified charges,
 * including delayed pre-stop renewals; no guessed terminal cutoff is written.
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
import { persistPlusCustomerCancel, readBackPlusOrder, type PlusEcpayOrder } from '../_shared/plus-ecpay-ingest.ts'

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
  let order = await db
    .from('plus_membership_ecpay_order')
    .select('merchant_trade_no,user_id,plan_code,environment,period_amount_twd,status,provider_canceled_at')
    .eq('user_id', userId)
    .eq('environment', env.ecpayEnv)
    .in('status', ['active', 'cancel_requested'])
    .maybeSingle()
  if (order.error) return noStore(jsonResult(503, { error: UNAVAILABLE }))
  if (!order.data) {
    order = await db.from('plus_membership_ecpay_order')
      .select('merchant_trade_no,user_id,plan_code,environment,period_amount_twd,status,provider_canceled_at')
      .eq('user_id', userId).eq('environment', env.ecpayEnv).eq('status', 'canceled')
      .order('updated_at', { ascending: false }).limit(1).maybeSingle()
    if (order.error) return noStore(jsonResult(503, { error: UNAVAILABLE }))
    if (!order.data?.provider_canceled_at) return noStore(jsonResult(404, { error: 'no active subscription' }))
  }

  const merchantTradeNo = String(order.data.merchant_trade_no)
  if (order.data.status === 'active') {
    const { error } = await db.rpc('set_plus_ecpay_order_status', {
      p_merchant_trade_no: merchantTradeNo,
      p_status: 'cancel_requested',
    })
    if (error) return noStore(jsonResult(503, { error: UNAVAILABLE }))
  }

  if (!order.data.provider_canceled_at) {
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
      parsed.MerchantID !== env.ecpayMerchantId ||
      parsed.MerchantTradeNo !== merchantTradeNo ||
      (rtnCode !== '1' && rtnCode !== '90100149') ||
      !checkMacValid
    ) {
      log.error({ merchantTradeNo, rtnCode }, 'ecpay plus cancel rejected')
      return noStore(jsonResult(502, { error: 'provider cancel failed' }))
    }

    if (!await persistPlusCustomerCancel(deps, merchantTradeNo, { fields: parsed, confirmedAt: deps.now() })) {
      return noStore(jsonResult(503, { error: UNAVAILABLE }))
    }
  }

  // Recover pre-stop charges before reporting the known paid window. A failed
  // read-back leaves durable recovery work; it cannot undo the provider stop.
  try {
    const read = await readBackPlusOrder(deps, order.data as unknown as PlusEcpayOrder)
    if (read.kind === 'failed' || read.retry || !['0', '2'].includes(read.execStatus)) {
      throw new Error('order read-back incomplete')
    }
    const completed = await db.rpc('complete_plus_ecpay_cancel_readback', { p_merchant_trade_no: merchantTradeNo })
    if (completed.error) throw new Error('read-back completion not persisted')
  } catch (error) {
    log.error(
      { merchantTradeNo, error: error instanceof Error ? error.message : String(error) },
      'ecpay plus cancel read-back failed; using recorded paid period',
    )
  }

  const summary = await db
    .from('plus_membership_stream_summary')
    .select('access_period_end')
    .eq('source_system', sourceSystem)
    .eq('source_subscription_id', merchantTradeNo)
    .maybeSingle()
  if (summary.error) return noStore(jsonResult(503, { error: UNAVAILABLE }))

  // This is the currently known paid-through time, not a frozen terminal fact.
  // Later verified pre-stop receipts may extend it; terminal financial events
  // remain authoritative in the existing membership resolver.
  const periodEnd = summary.data?.access_period_end ?? null

  return noStore(jsonResult(200, { status: 'canceled', accessUntil: periodEnd }))
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
