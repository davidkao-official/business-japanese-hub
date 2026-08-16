/**
 * Server-side Supabase session verification (decision-record §3.4/§3.5).
 *
 * Extracts `Authorization: Bearer <JWT>` and verifies it against GoTrue via
 * `db.auth.getUser(token)` — the same verification the platform `verify_jwt`
 * gate performs, re-checked inside the handler so a public (verify_jwt=false)
 * function never trusts a client-claimed identity and an authenticated function
 * never relies on the platform gate alone. Returns the verified `auth.uid()`, or
 * null when the header/token is missing or invalid.
 */
import type { DbClient } from './db.ts';

export async function authenticateBearer(
  db: DbClient,
  authorization: string | undefined | null,
): Promise<string | null> {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) return null;
  const token = match[1].trim();
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}
