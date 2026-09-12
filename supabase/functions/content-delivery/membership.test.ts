import { describe, expect, it, vi } from 'vitest'
import { resolvePlusMembershipAccess } from './membership.ts'
import type { DbClient } from '../_shared/db.ts'

function dbWith(data: Record<string, unknown> | null, error: { message: string } | null = null): DbClient {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  }
  return { from: vi.fn().mockReturnValue(builder), rpc: vi.fn(), auth: { getUser: vi.fn() } } as unknown as DbClient
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
  })
})
