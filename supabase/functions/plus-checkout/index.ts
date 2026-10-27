/** Authenticated Plus recurring checkout entrypoint. */
import { createClient } from 'npm:@supabase/supabase-js@^2.112.3'
import { browserCors, withCorsHeaders } from '../_shared/cors.ts'
import { createServiceRoleClient, type DbClient } from '../_shared/db.ts'
import { toHandlerRequest, toResponse } from '../_shared/deno.ts'
import { readEnvFrom } from '../_shared/env.ts'
import { handlePlusCheckout, plusCheckoutDeps } from './handler.ts'

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
  const result = await handlePlusCheckout(request, plusCheckoutDeps(env, db))
  return toResponse(withCorsHeaders(result, cors.headers))
})
