import { toHandlerRequest } from '../_shared/deno.ts'
import { MAX_BODY_BYTES } from './handler.ts'

/** Read a Web Request body once, bounded, and preserve it for the pure handler seam. */
export async function requestWithBody(req: Request) {
  const request = toHandlerRequest(req)
  const declared = req.headers.get('content-length')
  if (declared && /^\d+$/.test(declared) && BigInt(declared) > BigInt(MAX_BODY_BYTES)) throw new Error('request body too large')
  if (!req.body) {
    request.bodyText = ''
    return request
  }
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
  } catch (error) {
    throw error instanceof Error ? error : new Error('invalid request body')
  }
  return request
}
