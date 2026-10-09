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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function flushPromises(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0)
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
    const rejectedBody = jsonResponse({ access: 'active' })
    rejectedBody.json = vi.fn().mockRejectedValue(new Error('malformed response'))
    await expect(
      fetchPlusMembershipAccess(async () => jwtFor('member-1'), 'member-1', {
        baseUrl,
        fetchImpl: vi.fn().mockResolvedValue(rejectedBody),
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

  it('times out token acquisition, cleans up its timer, and never dispatches after a late token', async () => {
    vi.useFakeTimers()
    const token = deferred<string | null>()
    const fetchImpl = vi.fn()
    try {
      const lookup = fetchPlusMembershipAccess(() => token.promise, 'member-1', {
        baseUrl: 'https://edge.test/functions/v1',
        fetchImpl,
      })
      await vi.advanceTimersByTimeAsync(10_000)
      await expect(lookup).resolves.toBe('unavailable')

      token.resolve(jwtFor('member-1'))
      await flushPromises()
      expect(fetchImpl).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses the same deadline after a slow token and aborts a stalled fetch', async () => {
    vi.useFakeTimers()
    const token = deferred<string | null>()
    const fetchResult = deferred<Response>()
    const fetchImpl = vi.fn<typeof fetch>(() => fetchResult.promise)
    try {
      const lookup = fetchPlusMembershipAccess(() => token.promise, 'member-1', {
        baseUrl: 'https://edge.test/functions/v1',
        fetchImpl,
      })
      await vi.advanceTimersByTimeAsync(7_000)
      token.resolve(jwtFor('member-1'))
      await flushPromises()
      expect(fetchImpl).toHaveBeenCalledTimes(1)

      const requestOptions = fetchImpl.mock.calls[0]?.[1] as RequestInit
      await vi.advanceTimersByTimeAsync(3_000)
      await expect(lookup).resolves.toBe('unavailable')
      expect(requestOptions.signal?.aborted).toBe(true)

      fetchResult.reject(new Error('late transport failure'))
      await flushPromises()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('times out a stalled body read and ignores a late body rejection', async () => {
    vi.useFakeTimers()
    const token = deferred<string | null>()
    const fetchResult = deferred<Response>()
    const body = deferred<unknown>()
    const response = jsonResponse({ access: 'active' })
    response.json = vi.fn(() => body.promise)
    const fetchImpl = vi.fn<typeof fetch>(() => fetchResult.promise)
    try {
      const lookup = fetchPlusMembershipAccess(() => token.promise, 'member-1', {
        baseUrl: 'https://edge.test/functions/v1',
        fetchImpl,
      })

      await vi.advanceTimersByTimeAsync(3_000)
      token.resolve(jwtFor('member-1'))
      await flushPromises()
      expect(fetchImpl).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(3_000)
      fetchResult.resolve(response)
      await flushPromises()
      expect(response.json).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(4_000)
      await expect(lookup).resolves.toBe('unavailable')
      body.reject(new Error('late body failure'))
      await flushPromises()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns unavailable when token acquisition rejects', async () => {
    await expect(
      fetchPlusMembershipAccess(() => Promise.reject(new Error('token unavailable')), 'member-1', {
        baseUrl: 'https://edge.test/functions/v1',
        fetchImpl: vi.fn(),
      }),
    ).resolves.toBe('unavailable')
  })
})
