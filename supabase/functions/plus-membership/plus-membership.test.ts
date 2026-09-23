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
  access: 'active' | 'non-member' | null,
  options: {
    queryError?: { message: string }
    rejected?: boolean
    verified?: boolean
  } = {},
) {
  const rpc = options.rejected
    ? vi.fn().mockRejectedValue(new Error('database unavailable'))
    : vi.fn().mockResolvedValue({
        data: access ? { access } : null,
        error: options.queryError ?? null,
      })

  const db = {
    from: vi.fn(),
    rpc,
    auth: {
      getUser: vi.fn().mockResolvedValue(
        options.verified === false
          ? { data: { user: null }, error: { message: 'invalid token' } }
          : { data: { user: { id: 'verified-user' } }, error: null },
      ),
    },
  } as unknown as DbClient

  return { db, rpc }
}

describe('Plus membership status Edge handler', () => {
  it('allows only the read method', async () => {
    const result = await handlePlusMembership(request('POST'), plusMembershipDeps(dbWith(null).db))
    expect(result.status).toBe(405)
  })

  it('requires a verified bearer subject before reading temporal authority', async () => {
    const missing = dbWith(null)
    expect((await handlePlusMembership(request(), plusMembershipDeps(missing.db))).status).toBe(401)
    expect(missing.rpc).not.toHaveBeenCalled()

    const invalid = dbWith(null, { verified: false })
    const result = await handlePlusMembership(
      request('GET', 'Bearer invalid-token'),
      plusMembershipDeps(invalid.db),
    )
    expect(result.status).toBe(401)
    expect(invalid.rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['active', 'active'],
    ['non-member', 'non-member'],
  ] as const)('returns %s from DB temporal authority', async (access, rpcAccess) => {
    const { db, rpc } = dbWith(rpcAccess)
    const result = await handlePlusMembership(
      request('GET', 'Bearer verified-token'),
      plusMembershipDeps(db),
    )

    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ access })
    expect(result.headers?.['Cache-Control']).toBe('private, no-store')
    expect(rpc).toHaveBeenCalledWith('resolve_plus_membership_access', {
      p_user_id: 'verified-user',
    })
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

    const malformed = dbWith(null)
    const malformedResult = await handlePlusMembership(
      request('GET', 'Bearer verified-token'),
      plusMembershipDeps(malformed.db),
    )
    expect(malformedResult.status).toBe(503)
  })
})
