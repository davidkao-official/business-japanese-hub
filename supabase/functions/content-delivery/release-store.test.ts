import { describe, expect, it } from 'vitest'
import { createMockDb } from '../_shared/testing.ts'
import { contentKindStore, publishedReadingReleaseStore, releaseStore } from './release-store.ts'

const userId = '18200000-0000-4000-8000-000000000001'
const contentId = 'reading-store-contract-test'
const revision = 'a'.repeat(64)

describe('content-delivery release stores', () => {
  it('reads only kind metadata before routing a Reading reference', async () => {
    const database = createMockDb({
      private_content_release: { data: { content_kind: 'reading', payload: { body: 'must not be selected' } } },
      'rpc:get_member_reading_release': { data: {
        status: 'found', content_id: contentId, revision, content_kind: 'reading', payload: { body: 'published body' },
      } },
    })
    expect(await contentKindStore(database.db)(contentId, revision)).toEqual({ kind: 'found', contentKind: 'reading' })
    expect(database.callsFor('private_content_release', 'select')).toEqual([
      { table: 'private_content_release', method: 'select', args: ['content_kind'] },
    ])

    const result = await publishedReadingReleaseStore(database.db)(userId, contentId, revision)
    expect(result).toEqual({ kind: 'found', release: {
      contentId, revision, contentKind: 'reading', payload: { body: 'published body' },
    } })
    expect(database.rpcCalls('get_member_reading_release')).toEqual([{
      table: 'rpc', method: 'get_member_reading_release', args: [{
        p_user_id: userId, p_item_id: contentId, p_revision: revision,
      }],
    }])
    expect(database.callsFor('private_content_release', 'select')).toHaveLength(1)
    expect(database.callsFor('private_content_release', 'select')[0]?.args).not.toContain('payload')
  })

  it.each([
    [{ status: 'non-member' }, 'non-member'],
    [{ status: 'missing' }, 'missing'],
  ] as const)('preserves the database Reading gate result %s', async (data, kind) => {
    const database = createMockDb({ 'rpc:get_member_reading_release': { data } })
    expect(await publishedReadingReleaseStore(database.db)(userId, contentId, revision)).toEqual({ kind })
  })

  it('fails closed on RPC errors or malformed Reading release rows', async () => {
    const failed = createMockDb({ 'rpc:get_member_reading_release': { error: 'database unavailable' } })
    expect(await publishedReadingReleaseStore(failed.db)(userId, contentId, revision)).toEqual({ kind: 'unavailable' })

    const malformed = createMockDb({ 'rpc:get_member_reading_release': { data: {
      status: 'found', content_id: contentId, revision, content_kind: 'book', payload: { body: 'wrong kind' },
    } } })
    expect(await publishedReadingReleaseStore(malformed.db)(userId, contentId, revision)).toEqual({ kind: 'unavailable' })
  })

  it('keeps non-Reading content on the existing exact immutable release lookup', async () => {
    const database = createMockDb({ private_content_release: { data: {
      content_id: 'book-store-contract-test', revision, content_kind: 'book', payload: { body: 'book body' },
    } } })
    expect(await releaseStore(database.db)('book-store-contract-test', revision)).toEqual({ kind: 'found', release: {
      contentId: 'book-store-contract-test', revision, contentKind: 'book', payload: { body: 'book body' },
    } })
    expect(database.callsFor('private_content_release', 'select')).toEqual([{
      table: 'private_content_release', method: 'select', args: ['content_id,revision,content_kind,payload'],
    }])
    expect(database.callsFor('private_content_release', 'neq')).toEqual([{
      table: 'private_content_release', method: 'neq', args: ['content_kind', 'reading'],
    }])
  })

  it('never admits a Reading body through the non-Reading release store', async () => {
    const database = createMockDb({ private_content_release: { data: {
      content_id: contentId, revision, content_kind: 'reading', payload: { body: 'unpublished body' },
    } } })
    expect(await releaseStore(database.db)(contentId, revision)).toEqual({ kind: 'unavailable' })
    expect(database.callsFor('private_content_release', 'neq')).toEqual([{
      table: 'private_content_release', method: 'neq', args: ['content_kind', 'reading'],
    }])
  })
})
