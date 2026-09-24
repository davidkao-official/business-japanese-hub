/** Member-owned Workplace Learn save API. Identity and Plus access are reverified in handler. */
import { createClient } from 'npm:@supabase/supabase-js@^2.112.3'
import { browserCors, withCorsHeaders } from '../_shared/cors.ts'
import { createServiceRoleClient, type DbClient } from '../_shared/db.ts'
import { toHandlerRequest, toResponse } from '../_shared/deno.ts'
import { readEnvFrom } from '../_shared/env.ts'
import { jsonResult } from '../_shared/http.ts'
import { resolvePlusMembershipAccess } from '../_shared/membership.ts'
import { handleWorkplaceSaves, MAX_BODY_BYTES } from './handler.ts'

async function boundedRequest(req: Request) {
  const request = toHandlerRequest(req)
  if (req.method === 'GET') return request
  const declaredLength = req.headers.get('content-length')
  if (declaredLength && /^\d+$/.test(declaredLength) && BigInt(declaredLength) > BigInt(MAX_BODY_BYTES)) {
    throw new Error('request body too large')
  }
  if (!req.body) return request
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_BODY_BYTES) {
        await reader.cancel()
        throw new Error('request body too large')
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    request.bodyText = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error('invalid request body')
  }
  return request
}

Deno.serve(async (req) => {
  const env = readEnvFrom(Deno.env)
  let request: Awaited<ReturnType<typeof boundedRequest>>
  try {
    request = await boundedRequest(req)
  } catch {
    return toResponse({ ...jsonResult(400, { error: 'invalid Workplace save request' }), headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } })
  }
  const cors = browserCors(request, env, ['GET', 'PUT', 'DELETE'])
  if (cors.response) return toResponse(cors.response)

  let db: DbClient
  try {
    db = createServiceRoleClient((url, key) => createClient(url, key) as unknown as DbClient, env)
  } catch {
    return toResponse(withCorsHeaders({ ...jsonResult(503, { error: 'Workplace saves unavailable' }), headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } }, cors.headers))
  }
  const result = await handleWorkplaceSaves(request, {
    db,
    membershipAccessFor: (userId) => resolvePlusMembershipAccess(db, userId),
  })
  return toResponse(withCorsHeaders(result, cors.headers))
})
