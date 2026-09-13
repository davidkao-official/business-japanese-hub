import type { DbClient } from '../_shared/db.ts'
import type { ReleaseLookup } from './handler.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function releaseStore(db: DbClient): (contentId: string, revision: string) => Promise<ReleaseLookup> {
  return async (contentId, revision) => {
    const { data, error } = await db
      .from('private_content_release')
      .select('content_id,revision,content_kind,access_scope,payload')
      .eq('content_id', contentId)
      .eq('revision', revision)
      .eq('access_scope', 'member')
      .maybeSingle()
    if (error) return { kind: 'unavailable' }
    if (!data || !isRecord(data.payload) || typeof data.content_id !== 'string' ||
      typeof data.revision !== 'string' || typeof data.content_kind !== 'string') return { kind: 'missing' }
    return {
      kind: 'found',
      contentId: data.content_id,
      revision: data.revision,
      contentKind: data.content_kind,
      payload: data.payload,
    }
  }
}
