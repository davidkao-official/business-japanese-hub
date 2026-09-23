import type { DbClient } from './db.ts'

export type PlusMembershipAccess = 'active' | 'non-member' | 'unavailable'

/**
 * Resolve temporal Plus access only through the server-owned database RPC.
 * Book ownership, snapshots, and browser-supplied state are unrelated to this
 * decision; the RPC samples database time and selects the authoritative stream.
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
      'Plus membership temporal access lookup failed',
      error instanceof Error ? error.message : 'unknown error',
    )
    return 'unavailable'
  }
  if (result.error) {
    console.error('Plus membership temporal access lookup failed', result.error.message)
    return 'unavailable'
  }
  if (result.data?.access_status === 'active') return 'active'
  if (result.data?.access_status === 'non-member') return 'non-member'
  console.error('Plus membership temporal access lookup returned an invalid result')
  return 'unavailable'
}
