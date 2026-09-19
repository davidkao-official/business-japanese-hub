import { createClient } from 'npm:@supabase/supabase-js@^2.112.3'
import { browserCors, withCorsHeaders } from '../_shared/cors.ts'
import { createServiceRoleClient, type DbClient } from '../_shared/db.ts'
import { toHandlerRequest, toResponse } from '../_shared/deno.ts'
import { readEnvFrom } from '../_shared/env.ts'
import { jsonResult } from '../_shared/http.ts'
import { resolvePlusMembershipAccess } from '../_shared/membership.ts'
import { handleMyLearning } from './handler.ts'

Deno.serve(async (req) => {
  const env = readEnvFrom(Deno.env)
  const request = toHandlerRequest(req)
  const cors = browserCors(request, env, ['GET'])
  if (cors.response) return toResponse(cors.response)
  let db: DbClient
  try {
    db = createServiceRoleClient((url, key) => createClient(url, key) as unknown as DbClient, env)
  } catch {
    return toResponse(withCorsHeaders(jsonResult(503, { error: 'learning evidence unavailable' }), cors.headers))
  }
  const result = await handleMyLearning(request, {
    db,
    membershipAccessFor: (userId) => resolvePlusMembershipAccess(db, userId),
  })
  return toResponse(withCorsHeaders(result, cors.headers))
})
