import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWorkplaceSave, fetchWorkplaceSaves, removeWorkplaceSave, saveWorkplaceItem } from './savesClient'

const userId = 'workplace-user'
const itemId = 'workplace-learn-sample-status-update'
const revision = 'a'.repeat(64)
const savedAt = '2026-09-24T09:00:00.000Z'

function token(subject = userId) {
  const payload = btoa(JSON.stringify({ sub: subject })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `header.${payload}.signature`
}
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
function save(overrides: Record<string, unknown> = {}) {
  return { itemId, kind: 'lesson', revision: null, savedAt, current: true, ...overrides }
}

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('Workplace saves browser client', () => {
  it('binds fetch, save and removal to bearer subject and exact endpoint payloads', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.example/functions/v1')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ items: [save()] }))
      .mockResolvedValueOnce(response(save({ revision })))
      .mockResolvedValueOnce(response({ itemId, kind: 'lesson', revision: null, serverTimestamp: savedAt }))
      .mockResolvedValueOnce(response({ items: [save()] }))
    vi.stubGlobal('fetch', fetchMock)
    const getToken = async () => token()

    expect(await fetchWorkplaceSave(itemId, getToken, userId)).toEqual({ kind: 'ok', save: save() })
    expect(await saveWorkplaceItem(itemId, revision, getToken, userId)).toEqual({ kind: 'ok', save: save({ revision }) })
    expect(await removeWorkplaceSave(itemId, getToken, userId)).toEqual({ kind: 'ok' })
    expect(await fetchWorkplaceSaves(getToken, userId)).toEqual({ kind: 'ok', items: [save()] })
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`https://edge.example/functions/v1/workplace-saves?itemId=${itemId}`)
    const [, getInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(getInit.cache).toBe('no-store')
    expect(new Headers(getInit.headers).get('Authorization')).toBe(`Bearer ${token()}`)
    expect(JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string)).toEqual({ itemId, revision })
    expect(JSON.parse((fetchMock.mock.calls[2] as [string, RequestInit])[1].body as string)).toEqual({ itemId })
    expect(fetchMock.mock.calls[3]?.[0]).toBe('https://edge.example/functions/v1/workplace-saves')
  })

  it('rejects a wrong token subject and malformed or body-bearing API envelopes', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.example/functions/v1')
    const fetchMock = vi.fn().mockResolvedValue(response({ items: [save({ body: 'private' })] }))
    vi.stubGlobal('fetch', fetchMock)
    const getToken = async () => token()
    expect(await fetchWorkplaceSave(itemId, async () => token('someone-else'), userId)).toEqual({ kind: 'unavailable' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await fetchWorkplaceSave(itemId, getToken, userId)).toEqual({ kind: 'unavailable' })
    expect(await fetchWorkplaceSaves(getToken, userId)).toEqual({ kind: 'unavailable' })
  })

  it('requires exact bounded save rows and retains current false as a removable stale preference', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.example/functions/v1')
    const stale = save({ current: false })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ items: [stale] }))
      .mockResolvedValueOnce(response({ items: Array.from({ length: 51 }, (_, index) => save({ itemId: `workplace-${index}` })) }))
      .mockResolvedValueOnce(response({ items: [save(), save()] }))
    vi.stubGlobal('fetch', fetchMock)
    const getToken = async () => token()
    expect(await fetchWorkplaceSaves(getToken, userId)).toEqual({ kind: 'ok', items: [stale] })
    expect(await fetchWorkplaceSaves(getToken, userId)).toEqual({ kind: 'unavailable' })
    expect(await fetchWorkplaceSaves(getToken, userId)).toEqual({ kind: 'unavailable' })
  })

  it('maps authorization/stale statuses and rejects a malformed mutation receipt', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.example/functions/v1')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({}, 401))
      .mockResolvedValueOnce(response({}, 403))
      .mockResolvedValueOnce(response({}, 409))
      .mockResolvedValueOnce(response(save({ unexpected: true })))
    vi.stubGlobal('fetch', fetchMock)
    const getToken = async () => token()
    expect(await fetchWorkplaceSave(itemId, getToken, userId)).toEqual({ kind: 'signed-out' })
    expect(await saveWorkplaceItem(itemId, revision, getToken, userId)).toEqual({ kind: 'forbidden' })
    expect(await saveWorkplaceItem(itemId, revision, getToken, userId)).toEqual({ kind: 'stale' })
    expect(await saveWorkplaceItem(itemId, revision, getToken, userId)).toEqual({ kind: 'unavailable' })
  })
})
