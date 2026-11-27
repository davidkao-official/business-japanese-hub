/** Read-only, provider-neutral Plus temporal access decision. */
import { authenticateBearer } from '../_shared/auth.ts'
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
import type { Env } from '../_shared/env.ts'

export type { PlusMembershipAccess }

export type PlusSubscriptionStatus = 'active' | 'cancel_requested' | 'canceled'

/** Panel-only projection of the newest ECPay recurring order for the user. */
export interface PlusSubscription {
  status: PlusSubscriptionStatus
  accessUntil: string | null
}

export interface PlusMembershipDeps {
  db: DbClient
  env: Env
  membershipAccessFor: (userId: string) => Promise<PlusMembershipAccess>
  /** `null` means no order; `undefined` means the read failed. */
  subscriptionFor: (userId: string) => Promise<PlusSubscription | null | undefined>
}

function noStore(result: HandlerResult): HandlerResult {
  return { ...result, headers: { ...result.headers, 'Cache-Control': 'private, no-store' } }
}

/**
 * Returns the product-level access state plus the newest subscription status
 * for the cancellation panel. The browser never submits or mutates membership
 * evidence; the verified bearer subject selects the server-owned resolvers.
 */
export async function handlePlusMembership(
  req: HandlerRequest,
  deps: PlusMembershipDeps,
): Promise<HandlerResult> {
  if (req.method !== 'GET') return noStore(methodNotAllowed('GET'))
  const userId = await authenticateBearer(deps.db, headerValue(req.headers, 'authorization'))
  if (!userId) return noStore(unauthorized())

  const access = await deps.membershipAccessFor(userId)
  if (access === 'unavailable') {
    return noStore(jsonResult(503, { error: 'membership access unavailable' }))
  }

  // The panel projection is additive: a failed read must never change the
  // access decision, and omitting the field keeps the client on its previous
  // access-only behaviour.
  let subscription: PlusSubscription | null | undefined
  try {
    subscription = await deps.subscriptionFor(userId)
  } catch {
    subscription = undefined
  }
  return noStore(jsonResult(200, subscription === undefined ? { access } : { access, subscription }))
}

/**
 * Newest ECPay recurring order for the user in the current provider
 * environment, with the period end recorded by the same subscription summary
 * the cancel handler uses. `null` means no order; `undefined` means the
 * projection could not be read.
 */
async function resolvePlusSubscription(
  db: DbClient,
  env: Env,
  userId: string,
): Promise<PlusSubscription | null | undefined> {
  const ecpayEnv = env.ecpayEnv
  if (!ecpayEnv) return undefined

  const order = await db
    .from('plus_membership_ecpay_order')
    .select('merchant_trade_no,status')
    .eq('user_id', userId)
    .eq('environment', ecpayEnv)
    .in('status', ['active', 'cancel_requested', 'canceled'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (order.error) return undefined
  if (!order.data) return null

  const status = order.data.status
  if (status !== 'active' && status !== 'cancel_requested' && status !== 'canceled') return undefined

  const summary = await db
    .from('plus_membership_stream_summary')
    .select('period_end')
    .eq('source_system', `ecpay_aio_period:${ecpayEnv}`)
    .eq('source_subscription_id', String(order.data.merchant_trade_no))
    .maybeSingle()
  if (summary.error) return undefined

  const periodEnd = summary.data?.period_end
  return {
    status,
    accessUntil: typeof periodEnd === 'string' ? periodEnd : null,
  }
}

/** Deno entry composition helper, exported here so tests stay node-only. */
export function plusMembershipDeps(db: DbClient, env: Env): PlusMembershipDeps {
  return {
    db,
    env,
    membershipAccessFor: (userId) => resolvePlusMembershipAccess(db, userId),
    subscriptionFor: (userId) => resolvePlusSubscription(db, env, userId),
  }
}
