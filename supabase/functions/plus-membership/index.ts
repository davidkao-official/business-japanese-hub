/**
 * Authenticated, read-only Business Japanese Hub Plus access status.
 *
 * This function exposes only `active | non-member | unavailable` derived from
 * the existing service-owned projection. It cannot create or mutate
 * membership, select a plan, or initiate billing.
 */
import { createClient } from 'npm:@supabase/supabase-js@^2.112.3'
import { browserCors, withCorsHeaders } from '../_shared/cors.ts'
import { createServiceRoleClient, type DbClient } from '../_shared/db.ts'
import { toHandlerRequest, toResponse } from '../_shared/deno.ts'
import { readEnvFrom } from '../_shared/env.ts'
import { handlePlusMembership, plusMembershipDeps } from './handler.ts'

Deno.serve(async (req) => {
  const env = readEnvFrom(Deno.env)
  const request = toHandlerRequest(req)
  const cors = browserCors(request, env, ['GET'])
  if (cors.response) return toResponse(cors.response)

  const db = createServiceRoleClient(
    (url, key) => createClient(url, key) as unknown as DbClient,
    env,
  )
  const result = await handlePlusMembership(request, plusMembershipDeps(db))
  return toResponse(withCorsHeaders(result, cors.headers))
})
