import { authenticateBearer } from '../_shared/auth.ts'
import {
  edgeFunctionUrl,
  isProviderEnvironmentAligned,
  type Env,
} from '../_shared/env.ts'
import {
  headerValue,
  jsonResult,
  methodNotAllowed,
  unauthorized,
  type HandlerRequest,
  type HandlerResult,
} from '../_shared/http.ts'
import {
  resolvePlusMembershipAccess,
  type PlusMembershipAccess,
} from '../_shared/membership.ts'
import type { DbClient } from '../_shared/db.ts'
import { buildPeriodCheckoutFields } from '../../../src/lib/payments/ecpay/period.ts'
import { ECPAY_URLS } from '../../../src/lib/payments/ecpay/urls.ts'

export const PLUS_CHECKOUT_PLAN_CODE = 'plus_early_access_monthly'

export interface PlusCheckoutDeps {
  env: Env
  db: DbClient
  now: () => Date
  membershipAccessFor: (userId: string) => Promise<PlusMembershipAccess>
}

function noStore(result: HandlerResult): HandlerResult {
  return { ...result, headers: { ...result.headers, 'Cache-Control': 'private, no-store' } }
}

/** True only when every provider secret and the Owner gate admit Plus checkout. */
type OpenCheckoutEnv = Env & {
  plusConsentRevision: string
  ecpayMerchantId: string
  ecpayHashKey: string
  ecpayHashIV: string
  ecpayEnv: NonNullable<Env['ecpayEnv']>
  publicSiteUrl: string
}

function checkoutOpen(env: Env): env is OpenCheckoutEnv {
  return Boolean(
    env.plusCheckoutAdmitted && env.plusConsentRevision && env.ecpayMerchantId &&
    env.ecpayHashKey && env.ecpayHashIV && env.ecpayEnv && env.publicSiteUrl &&
    isProviderEnvironmentAligned(env.deploymentEnv, env.ecpayEnv, 'prod', 'stage'),
  )
}

function consentRevisionFrom(bodyText: string): unknown {
  try {
    return (JSON.parse(bodyText) as { consentRevision?: unknown } | null)?.consentRevision
  } catch {
    return undefined
  }
}

export async function handlePlusCheckout(
  req: HandlerRequest,
  deps: PlusCheckoutDeps,
): Promise<HandlerResult> {
  if (req.method === 'GET') {
    const open = checkoutOpen(deps.env)
    return noStore(jsonResult(200, { open, consentRevision: open ? deps.env.plusConsentRevision : null }))
  }
  if (req.method !== 'POST') return noStore(methodNotAllowed('POST'))

  const userId = await authenticateBearer(deps.db, headerValue(req.headers, 'authorization'))
  if (!userId) return noStore(unauthorized())

  const { env } = deps
  if (!checkoutOpen(env)) {
    return noStore(jsonResult(503, { error: 'plus checkout closed' }))
  }
  // The order binds the consent revision the user actually agreed to (#112).
  if (consentRevisionFrom(req.bodyText) !== env.plusConsentRevision) {
    return noStore(jsonResult(400, { error: 'consent required' }))
  }

  const access = await deps.membershipAccessFor(userId)
  if (access === 'active') return noStore(jsonResult(409, { error: 'already a member' }))
  if (access === 'unavailable') {
    return noStore(jsonResult(503, { error: 'membership access unavailable' }))
  }

  let result
  try {
    result = await deps.db.rpc('create_plus_ecpay_order', {
      p_user_id: userId,
      p_plan_code: PLUS_CHECKOUT_PLAN_CODE,
      p_environment: env.ecpayEnv,
      p_consent_revision: env.plusConsentRevision,
    })
  } catch {
    return noStore(jsonResult(503, { error: 'plus checkout unavailable' }))
  }
  if (result.error) {
    if (result.error.message.includes('already active')) {
      return noStore(jsonResult(409, { error: 'already a member' }))
    }
    return noStore(jsonResult(503, { error: 'plus checkout unavailable' }))
  }
  const row = Array.isArray(result.data) ? result.data[0] : result.data
  if (!row) return noStore(jsonResult(503, { error: 'plus checkout unavailable' }))

  const fields = await buildPeriodCheckoutFields({
    merchantId: env.ecpayMerchantId,
    merchantTradeNo: String(row.merchant_trade_no),
    now: deps.now(),
    periodAmountTwd: Number(row.period_amount_twd),
    execTimes: Number(row.exec_times),
    itemName: 'Business Japanese Hub Plus 月額プラン',
    returnUrl: edgeFunctionUrl(env, 'ecpay-plus-callback'),
    periodReturnUrl: edgeFunctionUrl(env, 'ecpay-plus-callback'),
    clientBackUrl: `${env.publicSiteUrl.replace(/\/+$/, '')}/plus?checkout=returned`,
    language: 'JPN',
    hashKey: env.ecpayHashKey,
    hashIV: env.ecpayHashIV,
  })
  return noStore(jsonResult(200, { action: ECPAY_URLS[env.ecpayEnv].checkout, fields }))
}

export function plusCheckoutDeps(env: Env, db: DbClient): PlusCheckoutDeps {
  return {
    env,
    db,
    now: () => new Date(),
    membershipAccessFor: (id) => resolvePlusMembershipAccess(db, id),
  }
}
