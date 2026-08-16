/**
 * Server-enforced finance-role authorization (decision-record §14).
 *
 * The role comes ONLY from the `finance_roles` DB table read via the
 * service-role client — a client-claimed role is never trusted. A user may hold
 * up to two rows (PK `(user_id, role)`); `finance_admin` dominates.
 */
import type { DbClient } from './db.ts';

export type FinanceRole = 'finance_viewer' | 'finance_admin';

/** Highest privilege held by the user, or null when they hold no finance role. */
export async function fetchFinanceRole(db: DbClient, userId: string): Promise<FinanceRole | null> {
  const { data, error } = await db
    .from('finance_roles')
    .select('role')
    .eq('user_id', userId)
    .limit(2);
  if (error || !Array.isArray(data)) return null;
  const roles = data
    .map((row) => row?.role)
    .filter((role): role is string => typeof role === 'string');
  if (roles.includes('finance_admin')) return 'finance_admin';
  if (roles.includes('finance_viewer')) return 'finance_viewer';
  return null;
}
