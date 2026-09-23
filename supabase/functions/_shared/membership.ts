import type { DbClient } from './db.ts'

export type PlusMembershipAccess = 'active' | 'non-member' | 'unavailable'

/**
 * Resolve Plus access through the server-only temporal authority RPC.
 * The database samples its own clock and evaluates immutable membership
 * evidence; browser state and caller-supplied time never create paid access.
 */
export async function resolvePlusMembershipAccess(
  db: DbClient,
  userId: string,
): Promise<PlusMembershipAccess> {
  let result: Awaited<ReturnType<DbClient['rpc']>>
  try {
    result = await db.rpc('resolve_plus_membership_access', { p_user_id: userId })
  } catch (error) {
    console.error(
      'Plus membership authority lookup failed',
      error instanceof Error ? error.message : 'unknown error',
    )
    return 'unavailable'
  }

  if (result.error) {
    console.error('Plus membership authority lookup failed', result.error.message)
    return 'unavailable'
  }

  const row = result.data
  if (!row || typeof row !== 'object') return 'unavailable'

  const access = (row as Record<string, unknown>).access
  if (access === 'active' || access === 'non-member') return access

  return 'unavailable'
}
