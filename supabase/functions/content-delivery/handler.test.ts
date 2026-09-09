import { describe, expect, it, vi } from 'vitest'
import { handleContentDelivery } from './handler.ts'
import type { DbClient } from '../_shared/db.ts'

const contentId = 'book-private-member-fixture'
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
      getRelease,
    })
    expect(result.status).toBe(503)
    expect(getRelease).not.toHaveBeenCalled()
  })

  it('does not trust a browser request to grant member delivery', async () => {
    const getRelease = vi.fn()
    const result = await handleContentDelivery(request(), {
      db: dbFor('user-1'),
      membershipAccessFor: async () => 'non-member',
      getRelease,
    })
    expect(result.status).toBe(403)
    expect(getRelease).not.toHaveBeenCalled()
  })

  it('requires a verified session before resolving a private release', async () => {
    const getRelease = vi.fn()
    const result = await handleContentDelivery(request(), {
      db: dbFor(null),
      membershipAccessFor: async () => 'active',
      getRelease,
    })
    expect(result.status).toBe(401)
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
      getRelease,
    })
    expect(result.status).toBe(400)
    expect(getRelease).not.toHaveBeenCalled()
  })

  it('returns a payload only after injected server membership authority is active', async () => {
    const result = await handleContentDelivery(request(), {
      db: dbFor('user-1'),
      membershipAccessFor: async () => 'active',
      getRelease: async () => ({
        contentId,
        revision,
        contentKind: 'book',
        payload: { example: 'private fixture only' },
      }),
    })
    expect(result.status).toBe(200)
    expect(result.body).toContain('private fixture only')
  })
})
