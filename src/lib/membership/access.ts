/**
 * Browser-side reader for the server-owned Plus membership projection.
 *
 * This module intentionally exposes only the product-level access state. It
 * never writes membership data, reads local storage, or treats a client flag
 * as evidence of paid access.
 */

import { tokenSubject } from '../auth/tokenSubject'

export type PlusMembershipAccess = 'active' | 'non-member' | 'unavailable'

export type PlusSubscriptionStatus = 'active' | 'cancel_requested' | 'canceled'

/** Panel-only projection of the newest recurring subscription. */
export interface PlusSubscription {
  status: PlusSubscriptionStatus
  accessUntil: string | null
}

/**
 * `undefined` means the server did not send the field (an older deployment),
 * `null` means the server could not project a subscription.
 */
export type PlusSubscriptionProjection = PlusSubscription | null | undefined

export interface PlusMembershipStatus {
  access: PlusMembershipAccess
  subscription: PlusSubscriptionProjection
}

export interface PlusMembershipAccessRepository {
  getAccess(expectedUserId: string): Promise<PlusMembershipStatus>
}

export interface PlusMembershipAccessRequestOptions {
  baseUrl?: string | null
  fetchImpl?: typeof fetch
}

const LOOKUP_DEADLINE_MS = 10_000
const DEADLINE_REACHED = Symbol('membership lookup deadline reached')

export function functionsBaseUrl(): string | null {
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
 * A missing field is `undefined` (unknown), an explicit `null` is a failed
 * projection, and a malformed value is treated as unknown so the panel falls
 * back to its access-only behaviour.
 */
export function parsePlusSubscription(value: unknown): PlusSubscriptionProjection {
  if (value === null) return null
  if (!value || typeof value !== 'object') return undefined
  const { status, accessUntil } = value as { status?: unknown; accessUntil?: unknown }
  if (status !== 'active' && status !== 'cancel_requested' && status !== 'canceled') {
    return undefined
  }
  if (accessUntil !== null && typeof accessUntil !== 'string') return undefined
  return { status, accessUntil }
}

const UNAVAILABLE: PlusMembershipStatus = { access: 'unavailable', subscription: undefined }

/**
 * One authenticated read of the narrow server projection. Any missing token,
 * network error, non-success response, or malformed body fails closed.
 */
export async function fetchPlusMembershipAccess(
  getAccessToken: () => Promise<string | null>,
  expectedUserId: string,
  options: PlusMembershipAccessRequestOptions = {},
): Promise<PlusMembershipStatus> {
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
    if (tokenResult === DEADLINE_REACHED || !tokenResult) return UNAVAILABLE
    if (tokenSubject(tokenResult) !== expectedUserId) return UNAVAILABLE

    const baseUrl = options.baseUrl === undefined ? functionsBaseUrl() : options.baseUrl
    if (!baseUrl) return UNAVAILABLE

    const request = options.fetchImpl ?? fetch
    const responseResult = await raceDeadline(
      Promise.resolve().then(() => request(`${baseUrl.replace(/\/+$/, '')}/plus-membership`, {
        method: 'GET',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${tokenResult}` },
        ...(controller ? { signal: controller.signal } : {}),
      })),
    )
    if (responseResult === DEADLINE_REACHED || !responseResult.ok) return UNAVAILABLE

    const bodyResult = await raceDeadline(Promise.resolve().then(() => responseResult.json()))
    if (bodyResult === DEADLINE_REACHED) return UNAVAILABLE
    const body = bodyResult as { access?: unknown; subscription?: unknown }
    return {
      access: parsePlusMembershipAccess(body?.access),
      subscription: parsePlusSubscription(body?.subscription),
    }
  } catch {
    return UNAVAILABLE
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export class HttpPlusMembershipAccessRepository implements PlusMembershipAccessRepository {
  constructor(
    private readonly getAccessToken: () => Promise<string | null>,
    private readonly options: PlusMembershipAccessRequestOptions = {},
  ) {}

  getAccess(expectedUserId: string): Promise<PlusMembershipStatus> {
    return fetchPlusMembershipAccess(this.getAccessToken, expectedUserId, this.options)
  }
}
