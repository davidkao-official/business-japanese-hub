import { describe, expect, it, vi } from 'vitest'
import { workplaceLearnCatalog } from '../../../src/workplace-learn/catalog.ts'
import type { WorkplaceLearnCatalogEntry } from '../../../src/workplace-learn/types.ts'
import { bearerHeaders, createMockDb, handlerRequest } from '../_shared/testing.ts'
import { handleWorkplaceSaves } from './handler.ts'

const userId = '17400000-0000-4000-8000-000000000001'
const revision = 'a'.repeat(64)
const changedRevision = 'b'.repeat(64)
const freeLesson = workplaceLearnCatalog.find((entry) => entry.kind === 'lesson')!
const freeVocabulary = workplaceLearnCatalog.find((entry) => entry.kind === 'vocabulary')!
const plusLesson: WorkplaceLearnCatalogEntry = {
  ...freeLesson,
  id: 'workplace-plus-lesson-test', slug: 'plus-lesson-test', access: 'plus',
  sampleLabel: undefined, releaseReference: { contentId: 'workplace-plus-lesson-test', revision },
}

function request(method: string, body?: unknown, query = '', authorization = 'verified-token') {
  return handlerRequest(method, `https://example.test/workplace-saves${query}`,
    body === undefined ? '' : JSON.stringify(body), authorization ? bearerHeaders(authorization) : {})
}
function deps(database: ReturnType<typeof createMockDb>, access: 'active' | 'non-member' | 'unavailable' = 'active', catalog = [...workplaceLearnCatalog, plusLesson]) {
  return { db: database.db, membershipAccessFor: vi.fn().mockResolvedValue(access), catalog }
}

describe('workplace-saves handler', () => {
  it('rejects unsupported methods before membership or storage access', async () => {
    const database = createMockDb()
    const result = await handleWorkplaceSaves(request('POST'), deps(database))
    expect(result.status).toBe(405)
    expect(result.headers?.['Cache-Control']).toBe('private, no-store')
    expect(database.calls).toEqual([])
  })

  it('verifies bearer and temporal access on every operation', async () => {
    const badAuth = createMockDb({ 'auth:getUser': { data: null } })
    const denied = deps(badAuth)
    expect((await handleWorkplaceSaves(request('GET', undefined, '', ''), denied)).status).toBe(401)
    expect(denied.membershipAccessFor).not.toHaveBeenCalled()
    for (const [access, status] of [['non-member', 403], ['unavailable', 503]] as const) {
      for (const req of [request('GET'), request('PUT', { itemId: freeLesson.id, revision: null }), request('DELETE', { itemId: freeLesson.id })]) {
        const database = createMockDb({ 'auth:getUser': { data: { id: userId } } })
        expect((await handleWorkplaceSaves(req, deps(database, access))).status).toBe(status)
        expect(database.callsFor('workplace_learn_saves')).toEqual([])
        expect(database.rpcCalls('save_workplace_learn_item')).toEqual([])
        expect(database.rpcCalls('remove_workplace_learn_item')).toEqual([])
      }
    }
  })

  it('lists owner-scoped bounded preferences without bodies and derives current from DB projection', async () => {
    const savedAt = '2026-09-24T09:00:00.000Z'
    const database = createMockDb({
      'auth:getUser': { data: { id: userId } },
      workplace_learn_saves: { data: [
        { item_id: freeLesson.id, item_kind: 'lesson', revision: null, saved_at: savedAt, payload: { body: 'secret' } },
        { item_id: 'retired-workplace-item', item_kind: 'lesson', revision: changedRevision, saved_at: savedAt },
      ] },
      workplace_learn_publication: { data: [
        { item_id: freeLesson.id, item_kind: 'lesson', access_scope: 'free', revision: null, sample_classification: 'non-proprietary-teaching-sample', available: true },
        { item_id: 'retired-workplace-item', item_kind: 'lesson', access_scope: 'plus', revision: changedRevision, sample_classification: null, available: false },
      ] },
    })
    const result = await handleWorkplaceSaves(request('GET'), deps(database))
    expect(result.status).toBe(200)
    expect(result.headers?.['Cache-Control']).toBe('private, no-store')
    expect(JSON.parse(result.body)).toEqual({ items: [
      { itemId: freeLesson.id, kind: 'lesson', revision: null, savedAt, current: true },
      { itemId: 'retired-workplace-item', kind: 'lesson', revision: changedRevision, savedAt, current: false },
    ] })
    expect(result.body).not.toContain('secret')
    expect(database.callsFor('private_content_release')).toEqual([])
    expect(database.callsFor('workplace_learn_saves', 'eq')).toContainEqual({ table: 'workplace_learn_saves', method: 'eq', args: ['user_id', userId] })
    expect(database.callsFor('workplace_learn_saves', 'limit')).toContainEqual({ table: 'workplace_learn_saves', method: 'limit', args: [50] })
    expect(database.callsFor('workplace_learn_publication', 'select')[0]?.args).toEqual(['item_id,item_kind,access_scope,revision,sample_classification,available'])
  })

  it('marks current Plus items only when publication and immutable member release match exact kind and revision', async () => {
    const savedAt = '2026-09-24T09:00:00.000Z'
    const base = {
      'auth:getUser': { data: { id: userId } },
      workplace_learn_saves: { data: [{ item_id: plusLesson.id, item_kind: 'lesson', revision, saved_at: savedAt }] },
      workplace_learn_publication: { data: [{ item_id: plusLesson.id, item_kind: 'lesson', access_scope: 'plus', revision, sample_classification: null, available: true }] },
    }
    const currentDb = createMockDb({ ...base, private_content_release: { data: [{ content_id: plusLesson.id, revision, content_kind: 'workplace-lesson', access_scope: 'member', payload: { body: 'secret' } }] } })
    const current = await handleWorkplaceSaves(request('GET'), deps(currentDb))
    expect(JSON.parse(current.body).items[0]).toMatchObject({ itemId: plusLesson.id, kind: 'lesson', revision, current: true })
    expect(current.body).not.toContain('secret')
    for (const release of [
      { content_id: plusLesson.id, revision, content_kind: 'workplace-vocabulary', access_scope: 'member' },
      { content_id: plusLesson.id, revision, content_kind: 'workplace-lesson', access_scope: 'public' },
      { content_id: plusLesson.id, revision: changedRevision, content_kind: 'workplace-lesson', access_scope: 'member' },
    ]) {
      const staleDb = createMockDb({ ...base, private_content_release: { data: [release] } })
      expect(JSON.parse((await handleWorkplaceSaves(request('GET'), deps(staleDb))).body).items[0].current).toBe(false)
    }
  })

  it.each(['workplace_learn_saves', 'workplace_learn_publication', 'private_content_release'])(
    'fails closed when %s current-state lookup is unavailable', async (table) => {
      const database = createMockDb({
        'auth:getUser': { data: { id: userId } },
        workplace_learn_saves: { data: [{ item_id: plusLesson.id, item_kind: 'lesson', revision, saved_at: '2026-09-24T09:00:00.000Z' }] },
        workplace_learn_publication: { data: [{ item_id: plusLesson.id, item_kind: 'lesson', access_scope: 'plus', revision, sample_classification: null, available: true }] },
        private_content_release: { data: [{ content_id: plusLesson.id, revision, content_kind: 'workplace-lesson', access_scope: 'member' }] },
        [table]: { error: 'database unavailable' },
      })
      expect((await handleWorkplaceSaves(request('GET'), deps(database))).status).toBe(503)
    })

  it('supports single-item lookups with the same truth flags', async () => {
    const savedAt = '2026-09-24T09:00:00.000Z'
    const database = createMockDb({
      'auth:getUser': { data: { id: userId } },
      workplace_learn_saves: { data: [{ item_id: freeVocabulary.id, item_kind: 'vocabulary', revision: null, saved_at: savedAt }] },
      workplace_learn_publication: { data: [{ item_id: freeVocabulary.id, item_kind: 'vocabulary', access_scope: 'free', revision: null, sample_classification: 'non-proprietary-teaching-sample', available: true }] },
    })
    const result = await handleWorkplaceSaves(request('GET', undefined, `?itemId=${freeVocabulary.id}`), deps(database))
    expect(JSON.parse(result.body).items[0]).toMatchObject({ itemId: freeVocabulary.id, kind: 'vocabulary', current: true })
    expect(database.callsFor('workplace_learn_saves', 'limit')).toEqual([{ table: 'workplace_learn_saves', method: 'limit', args: [1] }])
  })

  it.each(['?itemId=bad%20id', '?itemId=valid&itemId=again', '?itemId=valid&extra=1', '?extra=1'])(
    'rejects malformed bounded list query %s', async (query) => {
      const database = createMockDb({ 'auth:getUser': { data: { id: userId } } })
      expect((await handleWorkplaceSaves(request('GET', undefined, query), deps(database))).status).toBe(400)
      expect(database.callsFor('workplace_learn_saves')).toEqual([])
    })

  it('saves Free items using only the body-free catalog identity and null revision', async () => {
    const savedAt = '2026-09-24T09:00:00.000Z'
    const database = createMockDb({ 'auth:getUser': { data: { id: userId } }, 'rpc:save_workplace_learn_item': { data: { status: 'saved', item_id: freeLesson.id, item_kind: 'lesson', revision: null, saved_at: savedAt } } })
    const result = await handleWorkplaceSaves(request('PUT', { itemId: freeLesson.id, revision: null }), deps(database))
    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ itemId: freeLesson.id, kind: 'lesson', revision: null, savedAt, current: true })
    expect(database.rpcCalls('save_workplace_learn_item')[0]?.args[0]).toEqual({ p_user_id: userId, p_item_id: freeLesson.id, p_item_kind: 'lesson', p_revision: null })
  })

  it('derives Plus kind and revision from catalog and maps locked projection staleness to conflict', async () => {
    const database = createMockDb({ 'auth:getUser': { data: { id: userId } }, 'rpc:save_workplace_learn_item': { data: { status: 'saved', item_id: plusLesson.id, item_kind: 'lesson', revision, saved_at: '2026-09-24T09:00:00.000Z' } } })
    const result = await handleWorkplaceSaves(request('PUT', { itemId: plusLesson.id, revision }), deps(database))
    expect(result.status).toBe(200)
    expect(database.rpcCalls('save_workplace_learn_item')[0]?.args[0]).toEqual({ p_user_id: userId, p_item_id: plusLesson.id, p_item_kind: 'lesson', p_revision: revision })
    const staleDb = createMockDb({ 'auth:getUser': { data: { id: userId } }, 'rpc:save_workplace_learn_item': { data: { status: 'stale' } } })
    expect((await handleWorkplaceSaves(request('PUT', { itemId: plusLesson.id, revision }), deps(staleDb))).status).toBe(409)
    expect(staleDb.rpcCalls('save_workplace_learn_item')).toHaveLength(1)
    const staleCatalogEntry = { ...plusLesson, releaseReference: { contentId: plusLesson.id, revision: changedRevision } }
    const staleCatalogDb = createMockDb({ 'auth:getUser': { data: { id: userId } } })
    expect((await handleWorkplaceSaves(request('PUT', { itemId: plusLesson.id, revision }), deps(staleCatalogDb, 'active', [...workplaceLearnCatalog, staleCatalogEntry]))).status).toBe(409)
    expect(staleCatalogDb.rpcCalls('save_workplace_learn_item')).toEqual([])
  })

  it('rejects unknown, wrong-revision, wrong-shape and client-authoritative fields', async () => {
    for (const body of [
      { itemId: 'unknown-workplace-id', revision: null },
      { itemId: plusLesson.id, revision: changedRevision },
      { itemId: freeLesson.id, revision },
      { itemId: freeLesson.id, revision: null, kind: 'lesson' },
      { itemId: freeLesson.id, revision: null, userId },
    ]) {
      const database = createMockDb({ 'auth:getUser': { data: { id: userId } } })
      const result = await handleWorkplaceSaves(request('PUT', body), deps(database))
      expect(result.status).toBe(body.kind || body.userId ? 400 : 409)
      expect(database.rpcCalls('save_workplace_learn_item')).toEqual([])
    }
  })

  it('allows idempotent removal by stable ID without current catalog admission', async () => {
    const database = createMockDb({ 'auth:getUser': { data: { id: userId } }, 'rpc:remove_workplace_learn_item': { data: { item_id: 'retired-workplace-id', item_kind: 'lesson', revision, server_timestamp: '2026-09-24T09:00:00.000Z' } } })
    const result = await handleWorkplaceSaves(request('DELETE', { itemId: 'retired-workplace-id' }), deps(database))
    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ itemId: 'retired-workplace-id', kind: 'lesson', revision, serverTimestamp: '2026-09-24T09:00:00.000Z' })
    expect(database.rpcCalls('remove_workplace_learn_item')[0]?.args[0]).toEqual({ p_user_id: userId, p_item_id: 'retired-workplace-id' })
  })

  it('fails closed for malformed stored rows and remove failures', async () => {
    const malformed = createMockDb({ 'auth:getUser': { data: { id: userId } }, workplace_learn_saves: { data: [{ item_id: 'bad id', item_kind: 'lesson', revision: null, saved_at: 'bad' }] } })
    expect((await handleWorkplaceSaves(request('GET'), deps(malformed))).status).toBe(503)
    const failedRemove = createMockDb({ 'auth:getUser': { data: { id: userId } }, 'rpc:remove_workplace_learn_item': { error: 'database unavailable' } })
    expect((await handleWorkplaceSaves(request('DELETE', { itemId: freeLesson.id }), deps(failedRemove))).status).toBe(503)
  })
})
