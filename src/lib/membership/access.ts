/**
 * Browser-side reader for the server-owned Plus membership projection.
 *
 * This module intentionally exposes only the product-level access state. It
 * never writes membership data, reads local storage, or treats a client flag
 * as evidence of paid access.
 */

import { tokenSubject } from '../auth/tokenSubject'

export type PlusMembershipAccess = 'active' | 'non-member' | 'unavailable'

export interface PlusMembershipAccessRepository {
  getAccess(expectedUserId: string): Promise<PlusMembershipAccess>
}

export interface PlusMembershipAccessRequestOptions {
  baseUrl?: string | null
  fetchImpl?: typeof fetch
}

function functionsBaseUrl(): string | null {
  const explicit = import.meta.env.VITE_EDGE_FUNCTIONS_BASE_URL as string | undefined
  const supabase = import.meta.env.VITE_SUPABASE_URL as string | undefined
  return (
    (explicit || (supabase ? `${supabase.replace(/\/+$/, '')}/functions/v1` : ''))
      .replace(/\/+$/, '')
    || null
  )
}

export function parsePlusMembershipAccess(value: unknown): PlusMembershipAccess {
  if (value === 'active' || value === 'non-member') return value
  return 'unavailable'
}

/**
 * One authenticated read of the narrow server projection. Any missing token,
 * network error, non-success response, or malformed body fails closed.
 */
export async function fetchPlusMembershipAccess(
  getAccessToken: () => Promise<string | null>,
  expectedUserId: string,
  options: PlusMembershipAccessRequestOptions = {},
): Promise<PlusMembershipAccess> {
  let token: string | null = null
  try {
    token = await getAccessToken()
  } catch {
    return 'unavailable'
  }
  if (!token) return 'unavailable'
  if (tokenSubject(token) !== expectedUserId) return 'unavailable'

  const baseUrl = options.baseUrl === undefined ? functionsBaseUrl() : options.baseUrl
  if (!baseUrl) return 'unavailable'

  const request = options.fetchImpl ?? fetch
  try {
    const response = await request(`${baseUrl.replace(/\/+$/, '')}/plus-membership`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) return 'unavailable'

    const body = (await response.json()) as { access?: unknown }
    return parsePlusMembershipAccess(body?.access)
  } catch {
    return 'unavailable'
  }
}

export class HttpPlusMembershipAccessRepository implements PlusMembershipAccessRepository {
  constructor(
    private readonly getAccessToken: () => Promise<string | null>,
    private readonly options: PlusMembershipAccessRequestOptions = {},
  ) {}

  getAccess(expectedUserId: string): Promise<PlusMembershipAccess> {
    return fetchPlusMembershipAccess(this.getAccessToken, expectedUserId, this.options)
  }
}
