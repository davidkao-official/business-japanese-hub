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

const LOOKUP_DEADLINE_MS = 10_000
const DEADLINE_REACHED = Symbol('membership lookup deadline reached')

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
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  let timer: ReturnType<typeof setTimeout> | undefined
  let resolveDeadline!: (value: typeof DEADLINE_REACHED) => void
  const deadline = new Promise<typeof DEADLINE_REACHED>((resolve) => {
    resolveDeadline = resolve
  })

  const raceDeadline = <T>(stage: Promise<T>): Promise<T | typeof DEADLINE_REACHED> =>
    Promise.race([stage, deadline])

  try {
    timer = setTimeout(() => {
      controller?.abort()
      resolveDeadline(DEADLINE_REACHED)
    }, LOOKUP_DEADLINE_MS)

    const tokenResult = await raceDeadline(Promise.resolve().then(getAccessToken))
    if (tokenResult === DEADLINE_REACHED || !tokenResult) return 'unavailable'
    if (tokenSubject(tokenResult) !== expectedUserId) return 'unavailable'

    const baseUrl = options.baseUrl === undefined ? functionsBaseUrl() : options.baseUrl
    if (!baseUrl) return 'unavailable'

    const request = options.fetchImpl ?? fetch
    const responseResult = await raceDeadline(
      Promise.resolve().then(() => request(`${baseUrl.replace(/\/+$/, '')}/plus-membership`, {
        method: 'GET',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${tokenResult}` },
        ...(controller ? { signal: controller.signal } : {}),
      })),
    )
    if (responseResult === DEADLINE_REACHED || !responseResult.ok) return 'unavailable'

    const bodyResult = await raceDeadline(Promise.resolve().then(() => responseResult.json()))
    if (bodyResult === DEADLINE_REACHED) return 'unavailable'
    const body = bodyResult as { access?: unknown }
    return parsePlusMembershipAccess(body?.access)
  } catch {
    return 'unavailable'
  } finally {
    if (timer !== undefined) clearTimeout(timer)
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
