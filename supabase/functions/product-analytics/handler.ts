import { parseRecordedValidationAnalyticsEvent } from '../../../packages/validation-analytics/src/index.ts'
import type { HandlerRequest, HandlerResult } from '../_shared/http.ts'
import { headerValue, jsonResult, methodNotAllowed } from '../_shared/http.ts'
import type { Logger } from '../_shared/log.ts'

export const PRODUCT_ANALYTICS_MAX_BODY_BYTES = 1024

export interface ProductAnalyticsHandlerDeps {
  log: Logger
}

function bodyTooLarge(request: HandlerRequest): boolean {
  const declared = headerValue(request.headers, 'content-length')
  if (declared && /^\d+$/.test(declared)
    && BigInt(declared) > BigInt(PRODUCT_ANALYTICS_MAX_BODY_BYTES)) return true
  return new TextEncoder().encode(request.bodyText).byteLength
    > PRODUCT_ANALYTICS_MAX_BODY_BYTES
}

export function handleProductAnalytics(
  request: HandlerRequest,
  deps: ProductAnalyticsHandlerDeps,
): HandlerResult {
  if (request.method.toUpperCase() !== 'POST') return methodNotAllowed('POST')
  if (bodyTooLarge(request)) return jsonResult(413, { error: 'request body too large' })
  const mediaType = headerValue(request.headers, 'content-type')
    ?.split(';', 1)[0]
    ?.trim()
    .toLowerCase()
  if (mediaType !== 'application/json') {
    return jsonResult(415, { error: 'content type must be application/json' })
  }

  let body: unknown
  try {
    body = JSON.parse(request.bodyText)
  } catch {
    return jsonResult(400, { error: 'invalid JSON body' })
  }
  const event = parseRecordedValidationAnalyticsEvent(body)
  if (!event) return jsonResult(400, { error: 'invalid analytics event' })

  deps.log.info(event, 'validation event accepted')
  return jsonResult(202, { accepted: true })
}
