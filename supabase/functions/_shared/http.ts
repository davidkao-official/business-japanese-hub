/**
 * Normalized HTTP shapes between the Deno entry (index.ts) and the pure handlers,
 * plus tiny response builders. Pure — no Deno types, so handlers stay importable
 * by vitest/Node.
 */

/** Request shape the Deno entry builds from a real `Request`. */
export interface HandlerRequest {
  method: string;
  url: string;
  /** Lowercased header name → value. */
  headers: Record<string, string>;
  /** Raw body text, already read by the Deno entry. */
  bodyText: string;
}

/** Response shape the Deno entry turns into a `Response`. */
export interface HandlerResult {
  status: number;
  headers?: Record<string, string>;
  body: string;
}

export function jsonResult(status: number, data: unknown): HandlerResult {
  return {
    status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
}

export function textResult(
  status: number,
  body: string,
  headers: Record<string, string> = { 'Content-Type': 'text/plain' },
): HandlerResult {
  return { status, headers, body };
}

export function redirectResult(location: string, status = 303): HandlerResult {
  return { status, headers: { Location: location }, body: '' };
}

export function unauthorized(message = 'missing or invalid session'): HandlerResult {
  return jsonResult(401, { error: message });
}

export function forbidden(message = 'forbidden'): HandlerResult {
  return jsonResult(403, { error: message });
}

export function badRequest(message: string): HandlerResult {
  return jsonResult(400, { error: message });
}

export function notFound(message = 'not found'): HandlerResult {
  return jsonResult(404, { error: message });
}

export function methodNotAllowed(allowed: string): HandlerResult {
  return jsonResult(405, { error: `method not allowed; expected ${allowed}` });
}

export function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** Case-insensitive header lookup (headers are stored lowercased). */
export function headerValue(headers: Record<string, string>, name: string): string | undefined {
  return headers[name.toLowerCase()];
}
