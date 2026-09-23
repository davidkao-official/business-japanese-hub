import type { DbClient } from './db.ts'

export type PlusMembershipAccess = 'active' | 'non-member' | 'unavailable'
export type MembershipClock = () => number

/**
 * Resolve only the server-owned Plus projection. Book ownership and browser
 * supplied state are intentionally unrelated to this decision.
 */
export async function resolvePlusMembershipAccess(
  db: DbClient,
  userId: string,
  now: MembershipClock = Date.now,
): Promise<PlusMembershipAccess> {
  let result: Awaited<ReturnType<ReturnType<DbClient['from']>['maybeSingle']>>
  try {
    result = await db
      .from('plus_membership_access')
      .select('membership_status,current_period_start,current_period_end')
      .eq('user_id', userId)
      .maybeSingle()
  } catch (error) {
    console.error(
      'Plus membership projection lookup failed',
      error instanceof Error ? error.message : 'unknown error',
    )
    return 'unavailable'
  }
  if (result.error) {
    console.error('Plus membership projection lookup failed', result.error.message)
    return 'unavailable'
  }
  const row = result.data
  if (
    !row
    || row.membership_status !== 'active'
    || typeof row.current_period_start !== 'string'
    || typeof row.current_period_end !== 'string'
  ) {
    return 'non-member'
  }
  const periodStart = Date.parse(row.current_period_start)
  const periodEnd = Date.parse(row.current_period_end)
  const nowMs = now()
  return Number.isFinite(periodStart) && Number.isFinite(periodEnd)
    && periodStart <= nowMs && nowMs < periodEnd
    ? 'active'
    : 'non-member'
}
