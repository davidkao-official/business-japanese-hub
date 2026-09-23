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

export type { PlusMembershipAccess }

export interface PlusMembershipDeps {
  db: DbClient
  membershipAccessFor: (userId: string) => Promise<PlusMembershipAccess>
}

function noStore(result: HandlerResult): HandlerResult {
  return { ...result, headers: { ...result.headers, 'Cache-Control': 'private, no-store' } }
}

/**
 * Returns only the product-level access state. The browser never submits or
 * mutates membership evidence; the verified bearer subject selects the
 * server-owned temporal resolver.
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
  return noStore(jsonResult(200, { access }))
}

/** Deno entry composition helper, exported here so tests stay node-only. */
export function plusMembershipDeps(db: DbClient): PlusMembershipDeps {
  return {
    db,
    membershipAccessFor: (userId) => resolvePlusMembershipAccess(db, userId),
  }
}
