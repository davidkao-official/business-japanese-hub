import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchReadingSave, fetchReadingSaves, removeReadingSave, saveReadingItem } from './savesClient'

const userId = 'reader-1'
const itemId = 'reading:one'
const revision = 'a'.repeat(64)
const savedAt = '2026-09-20T12:00:00.000Z'

function token(subject = userId) {
  const payload = btoa(JSON.stringify({ sub: subject })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `header.${payload}.signature`
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('reading saves browser client', () => {
  it('binds exact-item lookup and mutations to the current verified-token subject', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.example/functions/v1')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ items: [{ itemId, revision: null, savedAt }] }))
      .mockResolvedValueOnce(response({ itemId, revision, savedAt }))
      .mockResolvedValueOnce(response({ itemId, revision: null, serverTimestamp: savedAt }))
    vi.stubGlobal('fetch', fetchMock)
    const getToken = async () => token()

    expect(await fetchReadingSave(itemId, getToken, userId)).toEqual({ kind: 'ok', save: { itemId, revision: null, savedAt } })
    expect(await saveReadingItem(itemId, revision, getToken, userId)).toEqual({ kind: 'ok' })
    expect(await removeReadingSave(itemId, getToken, userId)).toEqual({ kind: 'ok' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const [getUrl, getInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(getUrl).toBe(`https://edge.example/functions/v1/reading-saves?itemId=${encodeURIComponent(itemId)}`)
    expect(getInit.cache).toBe('no-store')
    expect(new Headers(getInit.headers).get('Authorization')).toBe(`Bearer ${token()}`)
    expect(JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string)).toEqual({ itemId, revision })
    expect(JSON.parse((fetchMock.mock.calls[2] as [string, RequestInit])[1].body as string)).toEqual({ itemId })
  })

  it('rejects wrong subjects and malformed bounded responses without exposing a save', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.example/functions/v1')
    const fetchMock = vi.fn().mockResolvedValue(response({ items: [{ itemId, revision, savedAt, body: 'not allowed' }] }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchReadingSave(itemId, async () => token('another-user'), userId)).toEqual({ kind: 'unavailable' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await fetchReadingSave(itemId, async () => token(), userId)).toEqual({ kind: 'unavailable' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await saveReadingItem(itemId, 'not-a-sha', async () => token(), userId)).toEqual({ kind: 'stale' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('maps server authorization and stale statuses to bounded client states', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.example/functions/v1')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({}, 401))
      .mockResolvedValueOnce(response({}, 403))
      .mockResolvedValueOnce(response({}, 409))
    vi.stubGlobal('fetch', fetchMock)
    const getToken = async () => token()
    expect(await fetchReadingSave(itemId, getToken, userId)).toEqual({ kind: 'signed-out' })
    expect(await saveReadingItem(itemId, revision, getToken, userId)).toEqual({ kind: 'forbidden' })
    expect(await saveReadingItem(itemId, revision, getToken, userId)).toEqual({ kind: 'stale' })
  })

  it('loads the owner-bound recent list without a query and enforces its 50-row bound', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.example/functions/v1')
    const items = Array.from({ length: 50 }, (_, index) => ({ itemId: `reading-${index}`, revision: null, savedAt }))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ items }))
      .mockResolvedValueOnce(response({ items: [...items, { itemId: 'reading-extra', revision: null, savedAt }] }))
      .mockResolvedValueOnce(response({ items: [{ itemId: 'invalid/id', revision: null, savedAt }] }))
    vi.stubGlobal('fetch', fetchMock)
    const getToken = async () => token()

    const result = await fetchReadingSaves(getToken, userId)
    expect(result).toEqual({ kind: 'ok', items })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://edge.example/functions/v1/reading-saves')
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).cache).toBe('no-store')
    expect(await fetchReadingSaves(getToken, userId)).toEqual({ kind: 'unavailable' })
    expect(await fetchReadingSaves(getToken, userId)).toEqual({ kind: 'unavailable' })
  })
})
