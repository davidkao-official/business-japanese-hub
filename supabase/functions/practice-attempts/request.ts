import { toHandlerRequest } from '../_shared/deno.ts'

/** Read a Web Request body once and preserve it for the pure handler seam. */
export async function requestWithBody(req: Request) {
  const request = toHandlerRequest(req)
  request.bodyText = await req.text()
  return request
}

