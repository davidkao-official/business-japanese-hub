import { createClient } from 'npm:@supabase/supabase-js@^2.112.3'
import { browserCors, withCorsHeaders } from '../_shared/cors.ts'
import { createServiceRoleClient, type DbClient } from '../_shared/db.ts'
import { toHandlerRequest, toResponse } from '../_shared/deno.ts'
import { readEnvFrom } from '../_shared/env.ts'
import { jsonResult } from '../_shared/http.ts'
import { handlePracticeAttempts, type ReleaseLookup } from './handler.ts'
import { resolvePlusMembershipAccess } from '../content-delivery/membership.ts'

export async function requestWithBody(req: Request) {
  const request = toHandlerRequest(req)
  request.bodyText = await req.text()
  return request
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function releaseStore(db: DbClient): (contentId: string, revision: string) => Promise<ReleaseLookup> {
  return async (contentId, revision) => {
    const { data, error } = await db
      .from('private_content_release')
      .select('content_id,revision,content_kind,access_scope,payload')
      .eq('content_id', contentId)
      .eq('revision', revision)
      .eq('access_scope', 'member')
      .maybeSingle()
    if (error) {
      console.error('practice-attempts release lookup failed', error.message)
      return { kind: 'unavailable' }
    }
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

Deno.serve(async (req) => {
  const env = readEnvFrom(Deno.env)
  const request = toHandlerRequest(req)
  const cors = browserCors(request, env, ['POST'])
  if (cors.response) return toResponse(cors.response)
  let bodyText: string
  try {
    bodyText = (await requestWithBody(req)).bodyText
  } catch {
    return toResponse(withCorsHeaders(jsonResult(400, { error: 'invalid request body' }), cors.headers))
  }
  const db = createServiceRoleClient((url, key) => createClient(url, key) as unknown as DbClient, env)
  const result = await handlePracticeAttempts({ ...request, bodyText }, {
    db,
    membershipAccessFor: (userId) => resolvePlusMembershipAccess(db, userId),
    getRelease: releaseStore(db),
  })
  return toResponse(withCorsHeaders(result, cors.headers))
})
