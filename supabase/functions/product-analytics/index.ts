import { productAnalyticsCors, withCorsHeaders } from '../_shared/cors.ts'
import { toHandlerRequest, toResponse } from '../_shared/deno.ts'
import { readEnvFrom } from '../_shared/env.ts'
import { createSanitizedLogger } from '../_shared/log.ts'
import {
  handleProductAnalytics,
  PRODUCT_ANALYTICS_MAX_BODY_BYTES,
} from './handler.ts'

type BoundedBody =
  | { kind: 'ok'; text: string }
  | { kind: 'too-large' }
  | { kind: 'invalid' }

async function readBoundedBody(request: Request): Promise<BoundedBody> {
  const declared = request.headers.get('content-length')
  if (declared && /^\d+$/.test(declared)
    && BigInt(declared) > BigInt(PRODUCT_ANALYTICS_MAX_BODY_BYTES)) {
    return { kind: 'too-large' }
  }
  if (!request.body) return { kind: 'ok', text: '' }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > PRODUCT_ANALYTICS_MAX_BODY_BYTES) {
        await reader.cancel()
        return { kind: 'too-large' }
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return { kind: 'ok', text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  } catch {
    return { kind: 'invalid' }
  }
}

Deno.serve(async (req) => {
  const env = readEnvFrom(Deno.env)
  const request = toHandlerRequest(req)
  const cors = productAnalyticsCors(request, env, ['POST'])
  if (cors.response) return toResponse(cors.response)

  const body = await readBoundedBody(req)
  request.bodyText = body.kind === 'ok'
    ? body.text
    : body.kind === 'too-large'
      ? 'x'.repeat(PRODUCT_ANALYTICS_MAX_BODY_BYTES + 1)
      : '{'
  const result = handleProductAnalytics(request, {
    log: createSanitizedLogger(console.log, 'product-analytics'),
  })
  return toResponse(withCorsHeaders(result, cors.headers))
})
