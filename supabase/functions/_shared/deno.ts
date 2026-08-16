/**
 * Deno-boundary helpers shared by every Edge Function entry (index.ts).
 *
 * Only the entry files import this module — pure handlers and tests never touch
 * Deno types. `Request` / `Response` are the Deno Web-standard globals.
 */
import type { HandlerRequest, HandlerResult } from './http.ts';

/** Build the normalized `HandlerRequest` from a real `Request` (body read separately). */
export function toHandlerRequest(req: Request): HandlerRequest {
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return { method: req.method, url: req.url, headers, bodyText: '' };
}

/** Turn a `HandlerResult` into a Web-standard `Response`. */
export function toResponse(result: HandlerResult): Response {
  return new Response(result.body, {
    status: result.status,
    headers: result.headers ?? { 'Content-Type': 'application/json' },
  });
}
