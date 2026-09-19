import { describe, expect, it, vi } from 'vitest'
import { fetchPlusMembershipAccess } from './access'

const jwtFor = (sub: string) => `header.${btoa(JSON.stringify({ sub })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.signature`

function jsonResponse(payload: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response
}

describe('Plus membership browser reader', () => {
  it('maps only the server-returned active/non-member projection', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access: 'active' }))
      .mockResolvedValueOnce(jsonResponse({ access: 'non-member' }))

    await expect(
      fetchPlusMembershipAccess(async () => jwtFor('member-1'), 'member-1', {
        baseUrl: 'https://edge.test/functions/v1',
        fetchImpl,
      }),
    ).resolves.toBe('active')
    await expect(
      fetchPlusMembershipAccess(async () => jwtFor('member-1'), 'member-1', {
        baseUrl: 'https://edge.test/functions/v1',
        fetchImpl,
      }),
    ).resolves.toBe('non-member')

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://edge.test/functions/v1/plus-membership',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${jwtFor('member-1')}` },
      }),
    )
  })

  it('does not send a prior-session bearer for a different current owner', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ access: 'active' }))

    await expect(
      fetchPlusMembershipAccess(async () => jwtFor('member-a'), 'member-b', {
        baseUrl: 'https://edge.test/functions/v1',
        fetchImpl,
      }),
    ).resolves.toBe('unavailable')

    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('fails closed for missing tokens, HTTP failures, malformed bodies, and network errors', async () => {
    const baseUrl = 'https://edge.test/functions/v1'
    await expect(
      fetchPlusMembershipAccess(async () => null, 'member-1', {
        baseUrl,
        fetchImpl: vi.fn(),
      }),
    ).resolves.toBe('unavailable')
    await expect(
      fetchPlusMembershipAccess(async () => jwtFor('member-1'), 'member-1', {
        baseUrl,
        fetchImpl: vi.fn().mockResolvedValue(jsonResponse({ access: 'active' }, false, 503)),
      }),
    ).resolves.toBe('unavailable')
    await expect(
      fetchPlusMembershipAccess(async () => jwtFor('member-1'), 'member-1', {
        baseUrl,
        fetchImpl: vi.fn().mockResolvedValue(jsonResponse({ access: 'forged' })),
      }),
    ).resolves.toBe('unavailable')
    await expect(
      fetchPlusMembershipAccess(async () => jwtFor('member-1'), 'member-1', {
        baseUrl,
        fetchImpl: vi.fn().mockRejectedValue(new Error('network unavailable')),
      }),
    ).resolves.toBe('unavailable')
  })

  it('does not treat local storage or another client flag as access authority', async () => {
    window.localStorage.setItem('plus-membership', 'active')
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ access: 'non-member' }))

    await expect(
      fetchPlusMembershipAccess(async () => jwtFor('member-1'), 'member-1', {
        baseUrl: 'https://edge.test/functions/v1',
        fetchImpl,
      }),
    ).resolves.toBe('non-member')
  })
})
