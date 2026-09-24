import { afterEach, describe, expect, it, vi } from 'vitest'
import { sampleWorkplaceLearnItem, sampleWorkplaceVocabularyItem } from './sample'
import { fetchWorkplaceLearnPayload } from './client'
import { toWorkplaceLearnCatalogEntry } from './validate'
import type { WorkplaceLearnRuntimeItem } from './types'

const userId = 'member-1'
const revision = 'b'.repeat(64)
const tokenFor = (subject: string) => `header.${btoa(JSON.stringify({ sub: subject })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.signature`
const runtimeItem: WorkplaceLearnRuntimeItem = { ...sampleWorkplaceLearnItem, access: 'plus', sampleLabel: undefined }
const entry = toWorkplaceLearnCatalogEntry(runtimeItem, { contentId: runtimeItem.id, revision })

function body(item: unknown = runtimeItem, kind = 'workplace-lesson') {
  return { content: { contentId: entry.id, revision, contentKind: kind, payload: { workplaceLearn: item } } }
}

function response(status: number, value?: unknown) {
  return { status, ok: status >= 200 && status < 300, json: vi.fn().mockResolvedValue(value) }
}

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('Workplace Learn Plus content client', () => {
  it('fetches a catalogued lesson using the exact release identity and validates runtime/catalog fields', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.test/functions/v1/')
    const fetchMock = vi.fn().mockResolvedValue(response(200, body()))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchWorkplaceLearnPayload(entry, async () => tokenFor(userId), userId)).resolves.toEqual({ kind: 'ok', item: runtimeItem })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`https://edge.test/functions/v1/content-delivery?contentId=${encodeURIComponent(entry.id)}&revision=${revision}`)
    expect(init).toMatchObject({ method: 'GET', cache: 'no-store', headers: { Authorization: `Bearer ${tokenFor(userId)}` } })
  })

  it('validates vocabulary release kind and wrapper too', async () => {
    const vocabulary: WorkplaceLearnRuntimeItem = { ...sampleWorkplaceVocabularyItem, access: 'plus', sampleLabel: undefined }
    const vocabularyEntry = toWorkplaceLearnCatalogEntry(vocabulary, { contentId: vocabulary.id, revision })
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.test/functions/v1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, {
      content: { contentId: vocabulary.id, revision, contentKind: 'workplace-vocabulary', payload: { workplaceLearn: vocabulary } },
    })))
    await expect(fetchWorkplaceLearnPayload(vocabularyEntry, async () => tokenFor(userId), userId)).resolves.toEqual({ kind: 'ok', item: vocabulary })
  })

  it('does not fetch for missing or mismatched identity tokens and rejects malformed references', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.test/functions/v1')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchWorkplaceLearnPayload(entry, async () => null, userId)).resolves.toEqual({ kind: 'signed-out' })
    await expect(fetchWorkplaceLearnPayload(entry, async () => tokenFor('member-2'), userId)).resolves.toEqual({ kind: 'unavailable' })
    await expect(fetchWorkplaceLearnPayload({ ...entry, releaseReference: { contentId: 'other', revision } }, async () => tokenFor(userId), userId)).resolves.toEqual({ kind: 'missing' })
    await expect(fetchWorkplaceLearnPayload({ ...entry, releaseReference: { contentId: entry.id, revision: 'stale' } }, async () => tokenFor(userId), userId)).resolves.toEqual({ kind: 'missing' })
    await expect(fetchWorkplaceLearnPayload({ ...entry, slug: 'x'.repeat(81) }, async () => tokenFor(userId), userId)).resolves.toEqual({ kind: 'missing' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['wrong content kind', body(runtimeItem, 'reading')],
    ['wrong identity', { content: { ...body().content, contentId: 'other' } }],
    ['wrong revision', { content: { ...body().content, revision: 'c'.repeat(64) } }],
    ['extra envelope field', { ...body(), debug: true }],
    ['unexpected wrapper key', { content: { ...body().content, payload: { workplaceLearn: runtimeItem, rights: {} } } }],
    ['wrong item kind', body({ ...runtimeItem, kind: 'vocabulary' }, 'workplace-vocabulary')],
    ['draft authoring fields', body({ ...runtimeItem, publication: { status: 'draft' } })],
    ['catalog slug mismatch', body({ ...runtimeItem, slug: 'other-slug' })],
    ['markup injection', body({ ...runtimeItem, whatToSayJapanese: '<script>x</script>' })],
  ])('fails closed on %s', async (_label, value) => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.test/functions/v1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, value)))
    await expect(fetchWorkplaceLearnPayload(entry, async () => tokenFor(userId), userId)).resolves.toEqual({ kind: 'unavailable' })
  })

  it.each([[401, 'signed-out'], [403, 'forbidden'], [404, 'missing'], [500, 'unavailable']] as const)('maps HTTP %i to %s', async (status, kind) => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.test/functions/v1')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(status)))
    await expect(fetchWorkplaceLearnPayload(entry, async () => tokenFor(userId), userId)).resolves.toEqual({ kind })
  })
})
