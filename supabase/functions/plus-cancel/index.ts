/**
 * Authenticated Plus membership cancellation entry — `POST /functions/v1/plus-cancel`.
 *
 * Cancels the caller's ECPay recurring subscription and records the period-end
 * cancellation. The handler re-verifies the bearer session; the client supplies
 * no order identity or access state.
 */
import { createClient } from 'npm:@supabase/supabase-js@^2.112.3'
import { browserCors, withCorsHeaders } from '../_shared/cors.ts'
import { createServiceRoleClient, type DbClient } from '../_shared/db.ts'
import { toHandlerRequest, toResponse } from '../_shared/deno.ts'
import { readEnvFrom } from '../_shared/env.ts'
import { createSanitizedLogger } from '../_shared/log.ts'
import { handlePlusCancel, plusCancelDeps } from './handler.ts'

Deno.serve(async (req) => {
  const env = readEnvFrom(Deno.env)
  const request = toHandlerRequest(req)
  request.bodyText = await req.text()
  const cors = browserCors(request, env, ['POST'])
  if (cors.response) return toResponse(cors.response)

  const db = createServiceRoleClient(
    (url, key) => createClient(url, key) as unknown as DbClient,
    env,
  )
  const log = createSanitizedLogger()
  const result = await handlePlusCancel(request, plusCancelDeps(env, db, log))
  return toResponse(withCorsHeaders(result, cors.headers))
})
