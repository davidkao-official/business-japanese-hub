import { describe, expect, it, vi } from 'vitest'
import type { DbClient } from '../_shared/db.ts'
import type { HandlerRequest } from '../_shared/http.ts'
import { handlePlusMembership, plusMembershipDeps } from './handler.ts'

function request(method = 'GET', authorization?: string): HandlerRequest {
  return {
    method,
    url: 'https://example.test/plus-membership',
    headers: authorization ? { authorization } : {},
    bodyText: '',
  }
}

function dbWith(
  row: Record<string, unknown> | null,
  options: { queryError?: { message: string }; rejected?: boolean; verified?: boolean } = {},
) {
  const calls: Array<[string, unknown]> = []
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((column: string, value: unknown) => {
      calls.push([column, value])
      return builder
    }),
    maybeSingle: options.rejected
      ? vi.fn().mockRejectedValue(new Error('database unavailable'))
      : vi.fn().mockResolvedValue({ data: row, error: options.queryError ?? null }),
  }
  const db = {
    from: vi.fn().mockReturnValue(builder),
    rpc: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue(
        options.verified === false
          ? { data: { user: null }, error: { message: 'invalid token' } }
          : { data: { user: { id: 'verified-user' } }, error: null },
      ),
    },
  } as unknown as DbClient
  return { db, calls }
}

describe('Plus membership status Edge handler', () => {
  it('allows only the read method', async () => {
    const result = await handlePlusMembership(request('POST'), plusMembershipDeps(dbWith(null).db))
    expect(result.status).toBe(405)
  })

  it('requires a verified bearer subject before reading the projection', async () => {
    const missing = dbWith(null)
    expect((await handlePlusMembership(request(), plusMembershipDeps(missing.db))).status).toBe(401)

    const invalid = dbWith(null, { verified: false })
    const result = await handlePlusMembership(
      request('GET', 'Bearer invalid-token'),
      plusMembershipDeps(invalid.db),
    )
    expect(result.status).toBe(401)
    expect(invalid.calls).toEqual([])
  })

  it.each([
    ['active', { membership_status: 'active', current_period_end: '2099-01-01T00:00:00.000Z' }],
    ['non-member', { membership_status: 'active', current_period_end: '2000-01-01T00:00:00.000Z' }],
    ['non-member', null],
  ])('returns %s from the verified server projection', async (access, row) => {
    const { db, calls } = dbWith(row)
    const result = await handlePlusMembership(
      request('GET', 'Bearer verified-token'),
      plusMembershipDeps(db),
    )

    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ access })
    expect(result.headers?.['Cache-Control']).toBe('private, no-store')
    expect(calls).toContainEqual(['user_id', 'verified-user'])
  })

  it('fails closed with a non-cacheable response when authority is unavailable', async () => {
    const rejected = dbWith(null, { rejected: true })
    const rejectedResult = await handlePlusMembership(
      request('GET', 'Bearer verified-token'),
      plusMembershipDeps(rejected.db),
    )
    expect(rejectedResult.status).toBe(503)
    expect(rejectedResult.headers?.['Cache-Control']).toBe('private, no-store')
    expect(JSON.parse(rejectedResult.body)).toEqual({ error: 'membership access unavailable' })

    const queryFailure = dbWith(null, { queryError: { message: 'database unavailable' } })
    const queryFailureResult = await handlePlusMembership(
      request('GET', 'Bearer verified-token'),
      plusMembershipDeps(queryFailure.db),
    )
    expect(queryFailureResult.status).toBe(503)
  })
})
