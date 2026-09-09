/**
 * Authenticated proprietary-content delivery entry.
 *
 * #107 has not yet implemented the authoritative Plus access projection. The
 * injected resolver therefore returns `unavailable`, which is intentionally a
 * server-enforced fail-closed state rather than a client-side placeholder.
 */
import { createClient } from 'npm:@supabase/supabase-js@^2.112.3'
import { browserCors, withCorsHeaders } from '../_shared/cors.ts'
import { createServiceRoleClient, type DbClient } from '../_shared/db.ts'
import { toHandlerRequest, toResponse } from '../_shared/deno.ts'
import { readEnvFrom } from '../_shared/env.ts'
import { handleContentDelivery, type PrivateContentRelease } from './handler.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function releaseStore(db: DbClient): (contentId: string, revision: string) => Promise<PrivateContentRelease | null> {
  return async (contentId, revision) => {
    const { data, error } = await db
      .from('private_content_release')
      .select('content_id,revision,content_kind,payload')
      .eq('content_id', contentId)
      .eq('revision', revision)
      .maybeSingle()
    if (error || !data || !isRecord(data.payload)) return null
    if (
      typeof data.content_id !== 'string' ||
      typeof data.revision !== 'string' ||
      typeof data.content_kind !== 'string'
    ) return null
    return {
      contentId: data.content_id,
      revision: data.revision,
      contentKind: data.content_kind,
      payload: data.payload,
    }
  }
}

Deno.serve(async (req) => {
  const env = readEnvFrom(Deno.env)
  const request = toHandlerRequest(req)
  const cors = browserCors(request, env, ['GET'])
  if (cors.response) return toResponse(cors.response)

  const db = createServiceRoleClient((url, key) => createClient(url, key) as unknown as DbClient, env)
  const result = await handleContentDelivery(request, {
    db,
    // This is intentionally the only incomplete integration point. #107 must
    // replace it with its verified membership projection before any imported
    // member release becomes deliverable.
    membershipAccessFor: async () => 'unavailable',
    getRelease: releaseStore(db),
  })
  return toResponse(withCorsHeaders(result, cors.headers))
})
