import { describe, expect, it, vi } from 'vitest'
import { handleContentDelivery } from './handler.ts'
import type { DbClient } from '../_shared/db.ts'

const contentId = 'book-private-member-fixture'
const readingContentId = 'reading-private-member-fixture'
const revision = 'a'.repeat(64)

function dbFor(userId: string | null): DbClient {
  return {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue(
        userId === null
          ? { data: { user: null }, error: { message: 'invalid token' } }
          : { data: { user: { id: userId, email: null, email_confirmed_at: null } }, error: null },
      ),
    },
  } as unknown as DbClient
}

function request(
  authorization = 'Bearer valid-token',
  reference: { contentId: string; revision: string } = { contentId, revision },
) {
  return {
    method: 'GET',
    url: `https://example.test/content-delivery?contentId=${encodeURIComponent(reference.contentId)}&revision=${reference.revision}`,
    headers: { authorization },
    bodyText: '',
  }
}

describe('content delivery', () => {
  it('fails closed before querying content when #107 membership access is unavailable', async () => {
    const getRelease = vi.fn()
    const result = await handleContentDelivery(request(), {
      db: dbFor('user-1'),
      membershipAccessFor: async () => 'unavailable',
      getContentKind: async () => ({ kind: 'found', contentKind: 'book' }),
      getPublishedReadingRelease: vi.fn(),
      getRelease,
    })
    expect(result.status).toBe(503)
    expect(result.headers?.['Cache-Control']).toBe('private, no-store')
    expect(getRelease).not.toHaveBeenCalled()
  })

  it('does not trust a browser request to grant member delivery', async () => {
    const getRelease = vi.fn()
    const result = await handleContentDelivery(request(), {
      db: dbFor('user-1'),
      membershipAccessFor: async () => 'non-member',
      getContentKind: async () => ({ kind: 'found', contentKind: 'book' }),
      getPublishedReadingRelease: vi.fn(),
      getRelease,
    })
    expect(result.status).toBe(403)
    expect(result.headers?.['Cache-Control']).toBe('private, no-store')
    expect(getRelease).not.toHaveBeenCalled()
  })

  it('requires a verified session before resolving a private release', async () => {
    const getRelease = vi.fn()
    const result = await handleContentDelivery(request(), {
      db: dbFor(null),
      membershipAccessFor: async () => 'active',
      getContentKind: vi.fn(),
      getPublishedReadingRelease: vi.fn(),
      getRelease,
    })
    expect(result.status).toBe(401)
    expect(result.headers?.['Cache-Control']).toBe('private, no-store')
    expect(getRelease).not.toHaveBeenCalled()
  })

  it('rejects an unaddressable content id before authentication or release lookup', async () => {
    const getRelease = vi.fn()
    const result = await handleContentDelivery(request('Bearer valid-token', {
      contentId: 'book/private',
      revision,
    }), {
      db: dbFor('user-1'),
      membershipAccessFor: async () => 'active',
      getContentKind: vi.fn(),
      getPublishedReadingRelease: vi.fn(),
      getRelease,
    })
    expect(result.status).toBe(400)
    expect(getRelease).not.toHaveBeenCalled()
  })

  it('returns a payload only after injected server membership authority is active', async () => {
    const result = await handleContentDelivery(request(), {
      db: dbFor('user-1'),
      membershipAccessFor: async () => 'active',
      getContentKind: async () => ({ kind: 'found', contentKind: 'book' }),
      getPublishedReadingRelease: vi.fn(),
      getRelease: async () => ({
        kind: 'found',
        release: {
          contentId,
          revision,
          contentKind: 'book',
          payload: { example: 'private fixture only' },
        },
      }),
    })
    expect(result.status).toBe(200)
    expect(result.headers?.['Cache-Control']).toBe('private, no-store')
    expect(result.body).toContain('private fixture only')
  })

  it('fails closed when the server release store is unavailable', async () => {
    const result = await handleContentDelivery(request(), {
      db: dbFor('user-1'),
      membershipAccessFor: async () => 'active',
      getContentKind: async () => ({ kind: 'found', contentKind: 'book' }),
      getPublishedReadingRelease: vi.fn(),
      getRelease: async () => ({ kind: 'unavailable' }),
    })
    expect(result.status).toBe(503)
    expect(result.body).not.toContain('database')
  })

  it('rejects a release whose kind differs from the metadata used to choose its delivery path', async () => {
    const result = await handleContentDelivery(request(), {
      db: dbFor('user-1'),
      membershipAccessFor: async () => 'active',
      getContentKind: async () => ({ kind: 'found', contentKind: 'book' }),
      getPublishedReadingRelease: vi.fn(),
      getRelease: async () => ({ kind: 'found', release: {
        contentId,
        revision,
        contentKind: 'reading',
        payload: { body: 'must not be disclosed' },
      } }),
    })
    expect(result.status).toBe(503)
    expect(result.body).not.toContain('must not be disclosed')
  })

  it('uses one membership-plus-publication lookup for Reading and never falls back to unrestricted release fetch', async () => {
    const getRelease = vi.fn()
    const getPublishedReadingRelease = vi.fn().mockResolvedValue({ kind: 'found', release: {
      contentId: readingContentId,
      revision,
      contentKind: 'reading',
      payload: { example: 'published reading body' },
    } })
    const result = await handleContentDelivery(request('Bearer valid-token', {
      contentId: readingContentId, revision,
    }), {
      db: dbFor('user-1'),
      membershipAccessFor: vi.fn(),
      getContentKind: async () => ({ kind: 'found', contentKind: 'reading' }),
      getPublishedReadingRelease,
      getRelease,
    })
    expect(result.status).toBe(200)
    expect(result.body).toContain('published reading body')
    expect(getPublishedReadingRelease).toHaveBeenCalledWith('user-1', readingContentId, revision)
    expect(getRelease).not.toHaveBeenCalled()
  })

  it.each(['non-member', 'missing', 'unavailable'] as const)(
    'does not expose Reading content when the atomic publication lookup is %s', async (kind) => {
      const getRelease = vi.fn()
      const result = await handleContentDelivery(request('Bearer valid-token', {
        contentId: readingContentId, revision,
      }), {
        db: dbFor('user-1'),
        membershipAccessFor: vi.fn(),
        getContentKind: async () => ({ kind: 'found', contentKind: 'reading' }),
        getPublishedReadingRelease: async () => ({ kind }),
        getRelease,
      })
      expect(result.status).toBe(kind === 'non-member' ? 403 : kind === 'missing' ? 404 : 503)
      expect(result.body).not.toContain('private body')
      expect(getRelease).not.toHaveBeenCalled()
    },
  )

  it('fails closed when the atomic Reading membership/publication database RPC throws', async () => {
    const getRelease = vi.fn()
    const result = await handleContentDelivery(request('Bearer valid-token', {
      contentId: readingContentId, revision,
    }), {
      db: dbFor('user-1'),
      membershipAccessFor: vi.fn(),
      getContentKind: async () => ({ kind: 'found', contentKind: 'reading' }),
      getPublishedReadingRelease: async () => { throw new Error('database unavailable') },
      getRelease,
    })
    expect(result.status).toBe(503)
    expect(result.headers?.['Cache-Control']).toBe('private, no-store')
    expect(getRelease).not.toHaveBeenCalled()
  })
})
