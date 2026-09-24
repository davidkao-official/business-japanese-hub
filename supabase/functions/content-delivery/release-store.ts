import type { DbClient } from '../_shared/db.ts'
import type { ContentKindLookup, ReadingReleaseLookup, ReleaseLookup } from './handler.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Reads only immutable kind metadata before choosing a delivery path. */
export function contentKindStore(db: DbClient): (contentId: string, revision: string) => Promise<ContentKindLookup> {
  return async (contentId, revision) => {
    const { data, error } = await db
      .from('private_content_release')
      .select('content_kind')
      .eq('content_id', contentId)
      .eq('revision', revision)
      .maybeSingle()
    if (error) {
      console.error('content-delivery kind lookup failed', error.message)
      return { kind: 'unavailable' }
    }
    if (!data) return { kind: 'missing' }
    if (typeof data.content_kind !== 'string') return { kind: 'unavailable' }
    return { kind: 'found', contentKind: data.content_kind }
  }
}

/** Reading bodies come only from the atomic membership/publication/release RPC. */
export function publishedReadingReleaseStore(
  db: DbClient,
): (userId: string, contentId: string, revision: string) => Promise<ReadingReleaseLookup> {
  return async (userId, contentId, revision) => {
    const { data, error } = await db.rpc('get_member_reading_release', {
      p_user_id: userId,
      p_item_id: contentId,
      p_revision: revision,
    })
    if (error) {
      console.error('content-delivery Reading publication lookup failed', error.message)
      return { kind: 'unavailable' }
    }
    if (!isRecord(data) || typeof data.status !== 'string') return { kind: 'unavailable' }
    if (data.status === 'non-member') return { kind: 'non-member' }
    if (data.status === 'missing') return { kind: 'missing' }
    if (data.status !== 'found' || !isRecord(data.payload) ||
      typeof data.content_id !== 'string' || typeof data.revision !== 'string' ||
      typeof data.content_kind !== 'string' || data.content_id !== contentId ||
      data.revision !== revision || data.content_kind !== 'reading') {
      console.error('content-delivery Reading publication lookup returned an invalid release')
      return { kind: 'unavailable' }
    }
    return {
      kind: 'found',
      release: {
        contentId: data.content_id,
        revision: data.revision,
        contentKind: data.content_kind,
        payload: data.payload,
      },
    }
  }
}

/** Existing exact imported-release lookup retained for non-Reading families. */
export function releaseStore(db: DbClient): (contentId: string, revision: string) => Promise<ReleaseLookup> {
  return async (contentId, revision) => {
    const { data, error } = await db
      .from('private_content_release')
      .select('content_id,revision,content_kind,payload')
      .eq('content_id', contentId)
      .eq('revision', revision)
      .neq('content_kind', 'reading')
      .maybeSingle()
    if (error) {
      console.error('content-delivery release lookup failed', error.message)
      return { kind: 'unavailable' }
    }
    if (!data) return { kind: 'missing' }
    if (
      !isRecord(data.payload) ||
      typeof data.content_id !== 'string' ||
      typeof data.revision !== 'string' ||
      typeof data.content_kind !== 'string' ||
      data.content_kind === 'reading'
    ) {
      console.error('content-delivery release lookup returned an invalid payload')
      return { kind: 'unavailable' }
    }
    return {
      kind: 'found',
      release: {
        contentId: data.content_id,
        revision: data.revision,
        contentKind: data.content_kind,
        payload: data.payload,
      },
    }
  }
}
