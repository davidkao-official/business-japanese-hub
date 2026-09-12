import type { DbClient } from '../_shared/db.ts'
import type { MembershipAccess } from './handler.ts'

export type MembershipClock = () => number

/** Resolve only the server-owned Plus projection; book ownership is unrelated. */
export async function resolvePlusMembershipAccess(
  db: DbClient,
  userId: string,
  now: MembershipClock = Date.now,
): Promise<MembershipAccess> {
  const result = await db
    .from('plus_membership_access')
    .select('membership_status,current_period_end')
    .eq('user_id', userId)
    .maybeSingle()
  if (result.error) {
    console.error('content-delivery membership projection lookup failed', result.error.message)
    return 'unavailable'
  }
  const row = result.data
  if (!row || row.membership_status !== 'active' || typeof row.current_period_end !== 'string') {
    return 'non-member'
  }
  const periodEnd = Date.parse(row.current_period_end)
  return Number.isFinite(periodEnd) && periodEnd > now() ? 'active' : 'non-member'
}
