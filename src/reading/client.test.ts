import { afterEach, describe, expect, it, vi } from 'vitest'
import { sampleReadingItem } from './fixtures/sample-reading'
import { toReadingCatalogEntry } from './validate'
import { fetchReadingPayload, READING_REQUEST_TIMEOUT_MS } from './client'
import type { ReadingRuntimeItem } from './types'

const userId = 'member-1'
const revision = 'b'.repeat(64)
const tokenFor = (subject: string) => `header.${btoa(JSON.stringify({ sub: subject })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.signature`

const runtimeItem: ReadingRuntimeItem = {
  ...sampleReadingItem,
  access: 'plus',
  releasedAt: '2026-09-20',
}
delete runtimeItem.sampleLabel
const entry = toReadingCatalogEntry(runtimeItem, { contentId: runtimeItem.id, revision })

function deliveryBody(item: unknown = runtimeItem) {
  return {
    content: {
      contentId: entry.id,
      revision,
      contentKind: 'reading',
      payload: { reading: item },
    },
  }
}

function response(status: number, body?: unknown) {
  return { status, ok: status >= 200 && status < 300, json: vi.fn().mockResolvedValue(body) }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('Reading private payload client', () => {
  it('fetches the exact member release without browser caching and validates catalog identity', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.test/functions/v1/')
    const reorderedSource = {
      label: runtimeItem.source.label,
      type: runtimeItem.source.type,
    }
    const fetchMock = vi.fn().mockResolvedValue(response(200, deliveryBody({ ...runtimeItem, source: reorderedSource })))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchReadingPayload(entry, async () => tokenFor(userId), userId)).resolves.toEqual({ kind: 'ok', item: runtimeItem })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`https://edge.test/functions/v1/content-delivery?contentId=${encodeURIComponent(entry.id)}&revision=${revision}`)
    expect(request).toMatchObject({ method: 'GET', cache: 'no-store', headers: { Authorization: `Bearer ${tokenFor(userId)}` } })
    expect(request.signal).toBeInstanceOf(AbortSignal)
  })

  it('does not fetch when the token is absent or belongs to a different user', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.test/functions/v1')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchReadingPayload(entry, async () => null, userId)).resolves.toEqual({ kind: 'signed-out' })
    await expect(fetchReadingPayload(entry, async () => tokenFor('member-2'), userId)).resolves.toEqual({ kind: 'unavailable' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    [401, 'signed-out'],
    [403, 'forbidden'],
    [404, 'missing'],
    [500, 'unavailable'],
  ] as const)('maps HTTP %i to %s', async (status, kind) => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.test/functions/v1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(status)))
    await expect(fetchReadingPayload(entry, async () => tokenFor(userId), userId)).resolves.toEqual({ kind })
  })

  it('fails closed before fetch for malformed catalog references', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchReadingPayload({ ...entry, releaseReference: { contentId: 'other-id', revision } }, async () => tokenFor(userId), userId)).resolves.toEqual({ kind: 'missing' })
    await expect(fetchReadingPayload({ ...entry, releaseReference: { contentId: entry.id, revision: 'stale' } }, async () => tokenFor(userId), userId)).resolves.toEqual({ kind: 'missing' })
    await expect(fetchReadingPayload({ ...entry, access: 'free' }, async () => tokenFor(userId), userId)).resolves.toEqual({ kind: 'missing' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['wrong content kind', { content: { ...deliveryBody().content, contentKind: 'book' } }],
    ['stale content id', { content: { ...deliveryBody().content, contentId: 'stale-id' } }],
    ['stale revision', { content: { ...deliveryBody().content, revision: 'c'.repeat(64) } }],
    ['extra envelope field', { ...deliveryBody(), debug: true }],
    ['malformed payload shape', { content: { ...deliveryBody().content, payload: { reading: runtimeItem, reviewer: { id: 'editor' } } } }],
    ['missing reading item', { content: { ...deliveryBody().content, payload: {} } }],
    ['leaked reviewer record', deliveryBody({ ...runtimeItem, reviewer: { id: 'editor' } })],
    ['leaked rights record', deliveryBody({ ...runtimeItem, rights: { basis: 'original' } })],
    ['unsafe source URL', deliveryBody({ ...runtimeItem, source: { ...runtimeItem.source, url: 'javascript:alert(1)' } })],
    ['markup in explanation', deliveryBody({ ...runtimeItem, explanationZhTW: '<script>unsafe</script>' })],
    ['catalog slug mismatch', deliveryBody({ ...runtimeItem, slug: 'stale-slug' })],
    ['catalog source mismatch', deliveryBody({ ...runtimeItem, source: { ...runtimeItem.source, label: 'different source' } })],
    ['catalog date mismatch', deliveryBody({ ...runtimeItem, releasedAt: '2026-09-21' })],
  ])('rejects %s', async (_label, body) => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.test/functions/v1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, body)))
    await expect(fetchReadingPayload(entry, async () => tokenFor(userId), userId)).resolves.toEqual({ kind: 'unavailable' })
  })

  it('returns unavailable when the caller cancels while access-token restoration is pending', async () => {
    const controller = new AbortController()
    const pendingToken = new Promise<string | null>(() => undefined)
    const result = fetchReadingPayload(entry, () => pendingToken, userId, controller.signal)
    controller.abort()
    await expect(result).resolves.toEqual({ kind: 'unavailable' })
  })

  it('aborts an in-flight request when the caller cancels', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.test/functions/v1')
    const caller = new AbortController()
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<never>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    vi.stubGlobal('fetch', fetchMock)
    const result = fetchReadingPayload(entry, async () => tokenFor(userId), userId, caller.signal)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    caller.abort()
    await expect(result).resolves.toEqual({ kind: 'unavailable' })
  })

  it('bounds a stalled request with a deadline', async () => {
    vi.useFakeTimers()
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.test/functions/v1')
    const fetchMock = vi.fn(() => new Promise<never>(() => undefined))
    vi.stubGlobal('fetch', fetchMock)
    const result = fetchReadingPayload(entry, async () => tokenFor(userId), userId)
    await vi.advanceTimersByTimeAsync(READING_REQUEST_TIMEOUT_MS)
    await expect(result).resolves.toEqual({ kind: 'unavailable' })
  })
})
