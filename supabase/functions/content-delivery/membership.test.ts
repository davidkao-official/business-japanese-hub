import { describe, expect, it, vi } from 'vitest'
import { resolvePlusMembershipAccess } from './membership.ts'
import { handleContentDelivery } from './handler.ts'
import type { DbClient } from '../_shared/db.ts'

type Access = 'active' | 'non-member'

function deliveryRequest() {
  return {
    method: 'GET' as const,
    url: `https://example.test/content-delivery?contentId=book-private-member-fixture&revision=${'a'.repeat(64)}`,
    headers: { authorization: 'Bearer verified-token' },
    bodyText: '',
  }
}

function deliveryDb(
  access: Access | null,
  options: { rejected?: boolean; queryError?: { message: string } } = {},
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
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'verified-user' } },
        error: null,
      }),
    },
  } as unknown as DbClient

  return { db, rpc }
}

describe('Plus temporal membership resolver', () => {
  it('accepts only the bounded DB-authority vocabulary', async () => {
    const active = deliveryDb('active')
    await expect(resolvePlusMembershipAccess(active.db, 'user-1')).resolves.toBe('active')
    expect(active.rpc).toHaveBeenCalledWith('resolve_plus_membership_access', {
      p_user_id: 'user-1',
    })

    const nonMember = deliveryDb('non-member')
    await expect(resolvePlusMembershipAccess(nonMember.db, 'user-1')).resolves.toBe('non-member')
  })

  it('fails closed when the DB authority is unavailable or malformed', async () => {
    await expect(resolvePlusMembershipAccess(
      deliveryDb(null, { queryError: { message: 'database unavailable' } }).db,
      'user-1',
    )).resolves.toBe('unavailable')

    await expect(resolvePlusMembershipAccess(
      deliveryDb(null, { rejected: true }).db,
      'user-1',
    )).resolves.toBe('unavailable')

    const malformed = deliveryDb(null)
    await expect(resolvePlusMembershipAccess(malformed.db, 'user-1')).resolves.toBe('unavailable')
  })

  it('authorizes handler delivery only through verified temporal access', async () => {
    const active = deliveryDb('active')
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
    expect(active.rpc).toHaveBeenCalledWith('resolve_plus_membership_access', {
      p_user_id: 'verified-user',
    })

    const nonMember = deliveryDb('non-member')
    const getRelease = vi.fn()
    const denied = await handleContentDelivery(deliveryRequest(), {
      db: nonMember.db,
      membershipAccessFor: (userId) => resolvePlusMembershipAccess(nonMember.db, userId),
      getRelease,
    })
    expect(denied.status).toBe(403)
    expect(getRelease).not.toHaveBeenCalled()

    const failed = deliveryDb(null, { rejected: true })
    const unavailableRelease = vi.fn()
    const unavailable = await handleContentDelivery(deliveryRequest(), {
      db: failed.db,
      membershipAccessFor: (userId) => resolvePlusMembershipAccess(failed.db, userId),
      getRelease: unavailableRelease,
    })
    expect(unavailable.status).toBe(503)
    expect(unavailableRelease).not.toHaveBeenCalled()
  })
})
