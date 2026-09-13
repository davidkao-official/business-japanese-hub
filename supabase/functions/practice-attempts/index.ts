import { createClient } from 'npm:@supabase/supabase-js@^2.112.3'
import { browserCors, withCorsHeaders } from '../_shared/cors.ts'
import { createServiceRoleClient, type DbClient } from '../_shared/db.ts'
import { toHandlerRequest, toResponse } from '../_shared/deno.ts'
import { readEnvFrom } from '../_shared/env.ts'
import { jsonResult } from '../_shared/http.ts'
import { handlePracticeAttempts } from './handler.ts'
import { resolvePlusMembershipAccess } from '../content-delivery/membership.ts'
import { requestWithBody } from './request.ts'
import { releaseStore } from './release-store.ts'

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
    getQuestionAvailability: async (contentId, questionId) => {
      const { data, error } = await db.from('practice_question_availability')
        .select('content_revision,question_version')
        .eq('content_id', contentId).eq('question_id', questionId).eq('available', true).maybeSingle()
      if (error) return { kind: 'unavailable' as const }
      if (!data) return { kind: 'missing' as const }
      if (typeof data.content_revision !== 'string' || typeof data.question_version !== 'number' || !Number.isSafeInteger(data.question_version)) return { kind: 'unavailable' as const }
      return { kind: 'found' as const, revision: data.content_revision, version: data.question_version }
    },
  })
  return toResponse(withCorsHeaders(result, cors.headers))
})
