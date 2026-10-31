import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelPlusMembership } from './cancel'

const BASE = 'https://edge.test/functions/v1'

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response
}

beforeEach(() => {
  vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', BASE)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('Plus cancel browser client', () => {
  it('reports the access end returned by a successful cancellation', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ status: 'canceled', accessUntil: '2026-12-01T00:00:00.000Z' }))

    await expect(cancelPlusMembership(async () => 'session-token', fetchImpl)).resolves.toEqual({
      kind: 'canceled',
      accessUntil: '2026-12-01T00:00:00.000Z',
    })
    expect(fetchImpl).toHaveBeenCalledWith(`${BASE}/plus-cancel`, {
      method: 'POST',
      cache: 'no-store',
      headers: { Authorization: 'Bearer session-token' },
    })
  })

  it('reports a missing subscription on 404', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'no active subscription' }, 404))
    await expect(cancelPlusMembership(async () => 'session-token', fetchImpl)).resolves.toEqual({
      kind: 'no-subscription',
    })
  })

  it('fails closed on a provider error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'provider cancel failed' }, 502))
    await expect(cancelPlusMembership(async () => 'session-token', fetchImpl)).resolves.toEqual({
      kind: 'failed',
    })
  })

  it('fails closed on a network error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'))
    await expect(cancelPlusMembership(async () => 'session-token', fetchImpl)).resolves.toEqual({
      kind: 'failed',
    })
  })
})
