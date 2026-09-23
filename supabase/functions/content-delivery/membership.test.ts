import { describe, expect, it, vi } from 'vitest'
import { resolvePlusMembershipAccess } from './membership.ts'
import { handleContentDelivery } from './handler.ts'
import type { DbClient } from '../_shared/db.ts'

function dbWith(
  data: Record<string, unknown> | null,
  error: { message: string } | null = null,
  rejected = false,
) {
  const rpc = rejected
    ? vi.fn().mockRejectedValue(new Error('database unavailable'))
    : vi.fn().mockResolvedValue({ data, error })
  const db = {
    from: vi.fn(),
    rpc,
    auth: { getUser: vi.fn() },
  } as unknown as DbClient
  return { db, rpc }
}

function deliveryRequest() {
  return {
    method: 'GET' as const,
    url: `https://example.test/content-delivery?contentId=book-private-member-fixture&revision=${'a'.repeat(64)}`,
    headers: { authorization: 'Bearer verified-token' },
    bodyText: '',
  }
}

function deliveryDb(access: Record<string, unknown> | null, queryFailure = false) {
  const rpc = queryFailure
    ? vi.fn().mockRejectedValue(new Error('database unavailable'))
    : vi.fn().mockResolvedValue({ data: access, error: null })
  const db = {
    from: vi.fn(),
    rpc,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'verified-user' } }, error: null }) },
  } as unknown as DbClient
  return { db, rpc }
}

describe('Plus membership temporal access resolver', () => {
  it('uses only the server-side temporal resolver RPC', async () => {
    const { db, rpc } = dbWith({ access_status: 'active' })
    await expect(resolvePlusMembershipAccess(db, 'user-1')).resolves.toBe('active')
    expect(rpc).toHaveBeenCalledExactlyOnceWith('resolve_plus_membership_access', { p_user_id: 'user-1' })
    expect(db.from).not.toHaveBeenCalled()
  })

  it.each([
    [{ access_status: 'active' }, 'active'],
    [{ access_status: 'non-member' }, 'non-member'],
  ])('maps the server decision %j to %s', async (payload, expected) => {
    await expect(resolvePlusMembershipAccess(dbWith(payload).db, 'user-1')).resolves.toBe(expected)
  })

  it('treats malformed results and RPC failures as unavailable', async () => {
    await expect(resolvePlusMembershipAccess(dbWith(null).db, 'user-1')).resolves.toBe('unavailable')
    await expect(resolvePlusMembershipAccess(dbWith({ access_status: 'pending' }).db, 'user-1')).resolves.toBe('unavailable')
    await expect(resolvePlusMembershipAccess(dbWith({}, { message: 'database unavailable' }).db, 'user-1')).resolves.toBe('unavailable')
    await expect(resolvePlusMembershipAccess(dbWith(null, null, true).db, 'user-1')).resolves.toBe('unavailable')
  })

  it('authorizes delivery only through the verified temporal RPC decision', async () => {
    const active = deliveryDb({ access_status: 'active' })
    const activeRelease = vi.fn().mockResolvedValue({
      kind: 'found',
      release: {
        contentId: 'book-private-member-fixture',
        revision: 'a'.repeat(64),
        contentKind: 'fixture',
        payload: { example: 'server-only fixture' },
      },
    })
    const delivered = await handleContentDelivery(deliveryRequest(), {
      db: active.db,
      membershipAccessFor: (userId) => resolvePlusMembershipAccess(active.db, userId),
      getRelease: activeRelease,
    })
    expect(delivered.status).toBe(200)
    expect(delivered.body).toContain('server-only fixture')
    expect(active.rpc).toHaveBeenCalledWith('resolve_plus_membership_access', { p_user_id: 'verified-user' })

    for (const payload of [{ access_status: 'non-member' }, { access_status: 'unknown' }]) {
      const nonMember = deliveryDb(payload)
      const getRelease = vi.fn()
      const result = await handleContentDelivery(deliveryRequest(), {
        db: nonMember.db,
        membershipAccessFor: (userId) => resolvePlusMembershipAccess(nonMember.db, userId),
        getRelease,
      })
      expect(result.status).toBe(payload?.access_status === 'unknown' ? 503 : 403)
      expect(getRelease).not.toHaveBeenCalled()
    }

    const failed = deliveryDb(null, true)
    const getRelease = vi.fn()
    const unavailable = await handleContentDelivery(deliveryRequest(), {
      db: failed.db,
      membershipAccessFor: (userId) => resolvePlusMembershipAccess(failed.db, userId),
      getRelease,
    })
    expect(unavailable.status).toBe(503)
    expect(getRelease).not.toHaveBeenCalled()
  })
})
