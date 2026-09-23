import { describe, expect, it, vi } from 'vitest'
import { sampleReadingItem } from '../../../src/reading/fixtures/sample-reading.ts'
import { toReadingCatalogEntry } from '../../../src/reading/validate.ts'
import { bearerHeaders, createMockDb, handlerRequest } from '../_shared/testing.ts'
import { handleReadingSaves } from './handler.ts'

const userId = '10000000-0000-4000-8000-000000000001'
const anotherUserId = '10000000-0000-4000-8000-000000000002'
const revision = 'a'.repeat(64)
const changedRevision = 'b'.repeat(64)
const plusEntry = toReadingCatalogEntry({
  ...sampleReadingItem,
  id: 'reading-plus-quarterly-report',
  slug: 'quarterly-report',
  access: 'plus',
  sampleLabel: undefined,
}, { contentId: 'reading-plus-quarterly-report', revision })

function request(method: string, body?: unknown, authorization = 'verified-token') {
  return handlerRequest(
    method,
    'https://example.test/reading-saves',
    body === undefined ? '' : JSON.stringify(body),
    authorization ? bearerHeaders(authorization) : {},
  )
}

function deps(
  database: ReturnType<typeof createMockDb>,
  access: 'active' | 'non-member' | 'unavailable' = 'active',
  catalog = [toReadingCatalogEntry(sampleReadingItem), plusEntry],
) {
  return {
    db: database.db,
    membershipAccessFor: vi.fn().mockResolvedValue(access),
    catalog,
  }
}

describe('reading-saves handler', () => {
  it('rejects methods outside GET, PUT and DELETE', async () => {
    const database = createMockDb()
    const membership = deps(database)
    const result = await handleReadingSaves(request('POST'), membership)
    expect(result.status).toBe(405)
    expect(membership.membershipAccessFor).not.toHaveBeenCalled()
    expect(result.headers?.['Cache-Control']).toBe('private, no-store')
  })

  it('verifies the bearer before membership or save access', async () => {
    const database = createMockDb({ 'auth:getUser': { data: null } })
    const membership = deps(database)
    const result = await handleReadingSaves(request('GET', undefined, ''), membership)
    expect(result.status).toBe(401)
    expect(membership.membershipAccessFor).not.toHaveBeenCalled()
    expect(database.callsFor('reading_saves')).toEqual([])
  })

  it.each([
    ['non-member', 403],
    ['unavailable', 503],
  ] as const)('fails closed for %s on every method', async (access, status) => {
    for (const req of [request('GET'), request('PUT', { itemId: sampleReadingItem.id, revision: null }), request('DELETE', { itemId: 'retired-reading-item' })]) {
      const database = createMockDb({ 'auth:getUser': { data: { id: userId } } })
      const result = await handleReadingSaves(req, deps(database, access))
      expect(result.status).toBe(status)
      expect(database.callsFor('reading_saves')).toEqual([])
      expect(database.rpcCalls('save_reading_item')).toEqual([])
      expect(database.rpcCalls('remove_reading_item')).toEqual([])
    }
  })

  it('lists only bounded owner-scoped identifiers, revisions and timestamps', async () => {
    const savedAt = '2026-09-24T09:00:00.000Z'
    const database = createMockDb({
      'auth:getUser': { data: { id: userId } },
      reading_saves: { data: [{ item_id: 'retired-reading-item', revision, saved_at: savedAt, title: 'private title', payload: { body: 'private body' } }] },
    })
    const result = await handleReadingSaves(request('GET'), deps(database))
    const body = JSON.parse(result.body) as { items: unknown[] }
    expect(result.status).toBe(200)
    expect(result.headers?.['Cache-Control']).toBe('private, no-store')
    expect(body).toEqual({ items: [{ itemId: 'retired-reading-item', revision, savedAt }] })
    expect(result.body).not.toContain('private title')
    expect(result.body).not.toContain('private body')
    expect(database.callsFor('reading_saves', 'eq')).toContainEqual({ table: 'reading_saves', method: 'eq', args: ['user_id', userId] })
    expect(database.callsFor('reading_saves', 'limit')).toContainEqual({ table: 'reading_saves', method: 'limit', args: [50] })
    expect(database.callsFor('reading_saves', 'select')[0]?.args).toEqual(['item_id,revision,saved_at'])
  })

  it('saves the current original Free sample with a null release revision', async () => {
    const savedAt = '2026-09-24T09:00:00.000Z'
    const database = createMockDb({
      'auth:getUser': { data: { id: userId } },
      'rpc:save_reading_item': { data: { item_id: sampleReadingItem.id, revision: null, saved_at: savedAt } },
    })
    const result = await handleReadingSaves(request('PUT', { itemId: sampleReadingItem.id, revision: null }), deps(database))
    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ itemId: sampleReadingItem.id, revision: null, savedAt })
    expect(database.rpcCalls('save_reading_item')).toEqual([{
      table: 'rpc', method: 'save_reading_item', args: [{ p_user_id: userId, p_item_id: sampleReadingItem.id, p_revision: null }],
    }])
  })

  it('requires an exact current catalog revision and member Reading release metadata for Plus', async () => {
    const savedAt = '2026-09-24T09:00:00.000Z'
    const database = createMockDb({
      'auth:getUser': { data: { id: userId } },
      private_content_release: { data: { content_id: plusEntry.id, revision, content_kind: 'reading', access_scope: 'member', payload: { private: 'not selected' } } },
      'rpc:save_reading_item': { data: { item_id: plusEntry.id, revision, saved_at: savedAt } },
    })
    const result = await handleReadingSaves(request('PUT', { itemId: plusEntry.id, revision }), deps(database))
    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ itemId: plusEntry.id, revision, savedAt })
    expect(database.callsFor('private_content_release', 'select')[0]?.args).toEqual(['content_id,revision,content_kind,access_scope'])
    expect(database.callsFor('private_content_release', 'eq')).toContainEqual({ table: 'private_content_release', method: 'eq', args: ['revision', revision] })
    expect(database.rpcCalls('save_reading_item')[0]?.args[0]).toEqual({ p_user_id: userId, p_item_id: plusEntry.id, p_revision: revision })

    const staleDb = createMockDb({ 'auth:getUser': { data: { id: userId } } })
    const stale = await handleReadingSaves(request('PUT', { itemId: plusEntry.id, revision: changedRevision }), deps(staleDb))
    expect(stale.status).toBe(409)
    expect(staleDb.callsFor('private_content_release')).toEqual([])
    expect(staleDb.rpcCalls('save_reading_item')).toEqual([])
  })

  it.each(['book', 'public'] as const)('rejects a release with wrong content kind or access scope (%s)', async (kind) => {
    const database = createMockDb({
      'auth:getUser': { data: { id: userId } },
      private_content_release: { data: {
        content_id: plusEntry.id, revision, content_kind: kind === 'book' ? 'book' : 'reading',
        access_scope: kind === 'public' ? 'public' : 'member',
      } },
    })
    const result = await handleReadingSaves(request('PUT', { itemId: plusEntry.id, revision }), deps(database))
    expect(result.status).toBe(409)
    expect(database.rpcCalls('save_reading_item')).toEqual([])
  })

  it('fails closed when the release lookup is unavailable', async () => {
    const database = createMockDb({
      'auth:getUser': { data: { id: userId } },
      private_content_release: { error: 'database unavailable' },
    })
    const result = await handleReadingSaves(request('PUT', { itemId: plusEntry.id, revision }), deps(database))
    expect(result.status).toBe(503)
    expect(database.rpcCalls('save_reading_item')).toEqual([])
  })

  it('rejects stale Free revisions, unknown IDs, and client-supplied fields', async () => {
    for (const body of [
      { itemId: sampleReadingItem.id, revision },
      { itemId: 'unknown-reading-item', revision: null },
      { itemId: sampleReadingItem.id, revision: null, userId: anotherUserId },
    ]) {
      const database = createMockDb({ 'auth:getUser': { data: { id: userId } } })
      const result = await handleReadingSaves(request('PUT', body), deps(database))
      expect(result.status).toBe(body.userId ? 400 : 409)
      expect(database.rpcCalls('save_reading_item')).toEqual([])
    }
  })

  it('removes a retired item by bounded ID and returns only the deletion receipt', async () => {
    const serverTimestamp = '2026-09-24T09:00:00.000Z'
    const database = createMockDb({
      'auth:getUser': { data: { id: userId } },
      'rpc:remove_reading_item': { data: { item_id: 'retired-reading-item', revision, server_timestamp: serverTimestamp } },
    })
    const result = await handleReadingSaves(request('DELETE', { itemId: 'retired-reading-item' }), deps(database))
    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ itemId: 'retired-reading-item', revision, serverTimestamp })
    expect(database.rpcCalls('remove_reading_item')[0]?.args[0]).toEqual({ p_user_id: userId, p_item_id: 'retired-reading-item' })
  })

  it('fails closed on invalid stored rows and database failures', async () => {
    const malformed = createMockDb({
      'auth:getUser': { data: { id: userId } },
      reading_saves: { data: [{ item_id: 'bad id', revision: null, saved_at: 'not-a-date' }] },
    })
    expect((await handleReadingSaves(request('GET'), deps(malformed))).status).toBe(503)

    const unavailable = createMockDb({ 'auth:getUser': { data: { id: userId } }, reading_saves: { error: 'database unavailable' } })
    expect((await handleReadingSaves(request('GET'), deps(unavailable))).status).toBe(503)
  })
})
