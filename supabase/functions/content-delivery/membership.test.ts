import { describe, expect, it, vi } from 'vitest'
import { resolvePlusMembershipAccess } from './membership.ts'
import { handleContentDelivery } from './handler.ts'
import type { DbClient } from '../_shared/db.ts'

function dbWith(data: Record<string, unknown> | null, error: { message: string } | null = null): DbClient {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  }
  return { from: vi.fn().mockReturnValue(builder), rpc: vi.fn(), auth: { getUser: vi.fn() } } as unknown as DbClient
}

function deliveryRequest() {
  return {
    method: 'GET' as const,
    url: `https://example.test/content-delivery?contentId=book-private-member-fixture&revision=${'a'.repeat(64)}`,
    headers: { authorization: 'Bearer verified-token' },
    bodyText: '',
  }
}

function deliveryDb(row: Record<string, unknown> | null, queryFailure?: 'rejected') {
  const calls: Array<[string, unknown]> = []
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((column: string, value: unknown) => {
      calls.push([column, value])
      return builder
    }),
    maybeSingle: queryFailure === 'rejected'
      ? vi.fn().mockRejectedValue(new Error('database unavailable'))
      : vi.fn().mockResolvedValue({ data: row, error: null }),
  }
  const db = {
    from: vi.fn().mockReturnValue(builder),
    rpc: vi.fn(),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'verified-user' } }, error: null }) },
  } as unknown as DbClient
  return { db, calls }
}

describe('Plus membership projection resolver', () => {
  const now = Date.parse('2026-09-12T00:00:00.000Z')

  it('requires an active, unexpired server projection', async () => {
    await expect(resolvePlusMembershipAccess(dbWith({ membership_status: 'active', current_period_end: '2026-09-13T00:00:00.000Z' }), 'user-1', () => now)).resolves.toBe('active')
    await expect(resolvePlusMembershipAccess(dbWith({ membership_status: 'active', current_period_end: '2026-09-12T00:00:00.000Z' }), 'user-1', () => now)).resolves.toBe('non-member')
    await expect(resolvePlusMembershipAccess(dbWith({ membership_status: 'revoked', current_period_end: '2026-09-13T00:00:00.000Z' }), 'user-1', () => now)).resolves.toBe('non-member')
    await expect(resolvePlusMembershipAccess(dbWith(null), 'user-1', () => now)).resolves.toBe('non-member')
  })

  it('fails closed when the projection query fails', async () => {
    await expect(resolvePlusMembershipAccess(dbWith(null, { message: 'database unavailable' }), 'user-1', () => now)).resolves.toBe('unavailable')
    const rejected = deliveryDb(null, 'rejected')
    await expect(resolvePlusMembershipAccess(rejected.db, 'verified-user', () => now)).resolves.toBe('unavailable')
  })

  it('authorizes handler delivery only through the verified active projection', async () => {
    const active = deliveryDb({ membership_status: 'active', current_period_end: '2026-09-13T00:00:00.000Z' })
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
      membershipAccessFor: (userId) => resolvePlusMembershipAccess(active.db, userId, () => now),
      getRelease: activeRelease,
    })
    expect(delivered.status).toBe(200)
    expect(delivered.body).toContain('server-only fixture')
    expect(active.calls).toContainEqual(['user_id', 'verified-user'])

    for (const row of [
      null,
      { membership_status: 'active', current_period_end: '2026-09-12T00:00:00.000Z' },
      { membership_status: 'revoked', current_period_end: '2026-09-13T00:00:00.000Z' },
      { membership_status: 'pending', current_period_end: '2026-09-13T00:00:00.000Z' },
    ]) {
      const nonMember = deliveryDb(row)
      const getRelease = vi.fn()
      const result = await handleContentDelivery(deliveryRequest(), {
        db: nonMember.db,
        membershipAccessFor: (userId) => resolvePlusMembershipAccess(nonMember.db, userId, () => now),
        getRelease,
      })
      expect(result.status).toBe(403)
      expect(getRelease).not.toHaveBeenCalled()
      expect(nonMember.calls).toContainEqual(['user_id', 'verified-user'])
    }

    const failed = deliveryDb(null, 'rejected')
    const getRelease = vi.fn()
    const unavailable = await handleContentDelivery(deliveryRequest(), {
      db: failed.db,
      membershipAccessFor: (userId) => resolvePlusMembershipAccess(failed.db, userId, () => now),
      getRelease,
    })
    expect(unavailable.status).toBe(503)
    expect(getRelease).not.toHaveBeenCalled()
  })
})
