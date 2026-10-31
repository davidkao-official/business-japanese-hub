/**
 * Browser-side cancellation of the Plus recurring membership.
 *
 * The server cancels with the payment provider and records the event; the paid
 * period stays usable until it ends. Anything unexpected fails closed.
 */

import { functionsBaseUrl } from './access'

export type PlusCancelResult =
  | { kind: 'canceled'; accessUntil: string | null }
  | { kind: 'no-subscription' }
  | { kind: 'failed' }

/** One authenticated cancellation for the current member. */
export async function cancelPlusMembership(
  getAccessToken: () => Promise<string | null>,
  fetchImpl: typeof fetch = fetch,
): Promise<PlusCancelResult> {
  const baseUrl = functionsBaseUrl()
  if (!baseUrl) return { kind: 'failed' }
  try {
    const token = await getAccessToken()
    if (!token) return { kind: 'failed' }

    const response = await fetchImpl(`${baseUrl}/plus-cancel`, {
      method: 'POST',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    })

    if (response.status === 404) return { kind: 'no-subscription' }
    if (!response.ok) return { kind: 'failed' }

    const body = (await response.json()) as { status?: unknown; accessUntil?: unknown }
    if (body?.status !== 'canceled') return { kind: 'failed' }
    return {
      kind: 'canceled',
      accessUntil: typeof body.accessUntil === 'string' ? body.accessUntil : null,
    }
  } catch {
    return { kind: 'failed' }
  }
}
