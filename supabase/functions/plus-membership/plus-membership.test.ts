import { describe, expect, it, vi } from 'vitest'
import type { DbClient } from '../_shared/db.ts'
import type { HandlerRequest } from '../_shared/http.ts'
import { testEnv } from '../_shared/testing.ts'
import { handlePlusMembership, plusMembershipDeps, type PlusMembershipDeps } from './handler.ts'

function request(method = 'GET', authorization?: string): HandlerRequest {
  return {
    method,
    url: 'https://example.test/plus-membership',
    headers: authorization ? { authorization } : {},
    bodyText: '',
  }
}

interface DbOptions {
  order?: Record<string, unknown> | null
  orderError?: boolean
  summary?: Record<string, unknown> | null
  summaryError?: boolean
}

function dbWith(
  payload: Record<string, unknown> | null,
  options: DbOptions & { queryError?: { message: string }; rejected?: boolean; verified?: boolean } = {},
) {
  const calls: Array<[string, unknown]> = []
  const rpc = options.rejected
    ? vi.fn().mockRejectedValue(new Error('database unavailable'))
    : vi.fn((fn: string, args: Record<string, unknown>) => {
      calls.push([fn, args.p_user_id])
      return Promise.resolve({ data: payload, error: options.queryError ?? null })
    })
  const from = vi.fn((table: string) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => Promise.resolve(
        table === 'plus_membership_ecpay_order'
          ? {
            data: options.order ?? null,
            error: options.orderError ? { message: 'database unavailable' } : null,
          }
          : {
            data: options.summary ?? null,
            error: options.summaryError ? { message: 'database unavailable' } : null,
          },
      ),
    }
    return builder
  })
  const db = {
    from,
    rpc,
    auth: {
      getUser: vi.fn().mockResolvedValue(
        options.verified === false
          ? { data: { user: null }, error: { message: 'invalid token' } }
          : { data: { user: { id: 'verified-user' } }, error: null },
      ),
    },
  } as unknown as DbClient
  return { db, calls, from }
}

const env = testEnv()

describe('Plus membership status Edge handler', () => {
  it('allows only the read method', async () => {
    const result = await handlePlusMembership(
      request('POST'),
      plusMembershipDeps(dbWith(null).db, env),
    )
    expect(result.status).toBe(405)
  })

  it('requires a verified bearer subject before reading temporal access', async () => {
    const missing = dbWith(null)
    expect((await handlePlusMembership(request(), plusMembershipDeps(missing.db, env))).status).toBe(401)

    const invalid = dbWith(null, { verified: false })
    const result = await handlePlusMembership(
      request('GET', 'Bearer invalid-token'),
      plusMembershipDeps(invalid.db, env),
    )
    expect(result.status).toBe(401)
    expect(invalid.calls).toEqual([])
  })

  it.each([
    ['active', { access_status: 'active' }],
    ['non-member', { access_status: 'non-member' }],
  ])('returns %s from the verified server temporal resolver', async (access, payload) => {
    const { db, calls } = dbWith(payload)
    const result = await handlePlusMembership(
      request('GET', 'Bearer verified-token'),
      plusMembershipDeps(db, env),
    )

    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ access, subscription: null })
    expect(result.headers?.['Cache-Control']).toBe('private, no-store')
    expect(calls).toContainEqual(['resolve_plus_membership_access', 'verified-user'])
  })

  it('fails closed with a non-cacheable response when authority is unavailable', async () => {
    const rejected = dbWith(null, { rejected: true })
    const rejectedResult = await handlePlusMembership(
      request('GET', 'Bearer verified-token'),
      plusMembershipDeps(rejected.db, env),
    )
    expect(rejectedResult.status).toBe(503)
    expect(rejectedResult.headers?.['Cache-Control']).toBe('private, no-store')
    expect(JSON.parse(rejectedResult.body)).toEqual({ error: 'membership access unavailable' })

    const queryFailure = dbWith(null, { queryError: { message: 'database unavailable' } })
    const queryFailureResult = await handlePlusMembership(
      request('GET', 'Bearer verified-token'),
      plusMembershipDeps(queryFailure.db, env),
    )
    expect(queryFailureResult.status).toBe(503)
  })

  it('adds the newest subscription and its period end without changing access', async () => {
    const { db } = dbWith(
      { access_status: 'non-member' },
      {
        order: { merchant_trade_no: 'BJHP0123456789ABCDEF', status: 'canceled' },
        summary: { period_end: '2026-12-01T00:00:00.000Z' },
      },
    )
    const result = await handlePlusMembership(
      request('GET', 'Bearer verified-token'),
      plusMembershipDeps(db, env),
    )

    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toEqual({
      access: 'non-member',
      subscription: { status: 'canceled', accessUntil: '2026-12-01T00:00:00.000Z' },
    })
  })

  it('reports a subscription whose period is not recorded yet', async () => {
    const { db } = dbWith(
      { access_status: 'non-member' },
      { order: { merchant_trade_no: 'BJHP0123456789ABCDEF', status: 'active' } },
    )
    const result = await handlePlusMembership(
      request('GET', 'Bearer verified-token'),
      plusMembershipDeps(db, env),
    )

    expect(JSON.parse(result.body)).toEqual({
      access: 'non-member',
      subscription: { status: 'active', accessUntil: null },
    })
  })

  it('returns no subscription projection when either read fails', async () => {
    for (const options of [{ orderError: true }, { summaryError: true }]) {
      const { db } = dbWith(
        { access_status: 'active' },
        {
          ...options,
          order: { merchant_trade_no: 'BJHP0123456789ABCDEF', status: 'active' },
          summary: { period_end: '2026-12-01T00:00:00.000Z' },
        },
      )
      const result = await handlePlusMembership(
        request('GET', 'Bearer verified-token'),
        plusMembershipDeps(db, env),
      )

      expect(result.status).toBe(200)
      expect(JSON.parse(result.body)).toEqual({ access: 'active', subscription: null })
    }
  })

  it('returns no subscription projection when the provider environment is unset', async () => {
    const { db, from } = dbWith(
      { access_status: 'active' },
      { order: { merchant_trade_no: 'BJHP0123456789ABCDEF', status: 'active' } },
    )
    const result = await handlePlusMembership(
      request('GET', 'Bearer verified-token'),
      plusMembershipDeps(db, testEnv({ ecpayEnv: undefined })),
    )

    expect(JSON.parse(result.body)).toEqual({ access: 'active', subscription: null })
    expect(from).not.toHaveBeenCalled()
  })

  it('keeps access when the subscription read throws', async () => {
    const deps: PlusMembershipDeps = {
      ...plusMembershipDeps(dbWith(null).db, env),
      membershipAccessFor: vi.fn(async () => 'active' as const),
      subscriptionFor: vi.fn(async () => { throw new Error('projection unavailable') }),
    }
    const result = await handlePlusMembership(request('GET', 'Bearer verified-token'), deps)

    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ access: 'active', subscription: null })
  })
})
