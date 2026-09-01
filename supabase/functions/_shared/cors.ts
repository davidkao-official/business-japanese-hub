import type { Env } from './env.ts';
import { forbidden, headerValue, type HandlerRequest, type HandlerResult } from './http.ts';
import { publicSiteRoute } from './public-site.ts';

const ALLOWED_REQUEST_HEADERS = ['authorization', 'apikey', 'content-type', 'x-client-info'] as const;

export interface BrowserCorsDecision {
  /** Present when the request must stop before the application handler runs. */
  response?: HandlerResult;
  /** Add to every allowed non-preflight browser response. */
  headers: Record<string, string>;
}

function configuredPublicOrigin(env: Env): string | null {
  const route = publicSiteRoute(env, '');
  if (!route) return null;
  try {
    return new URL(route).origin;
  } catch {
    return null;
  }
}

function configuredExactOrigin(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw);
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password || url.search || url.hash) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function corsHeaders(origin: string, methods: readonly string[]): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': [...methods, 'OPTIONS'].join(', '),
    'Access-Control-Allow-Headers': ALLOWED_REQUEST_HEADERS.join(', '),
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function actualResponseHeaders(origin: string): Record<string, string> {
  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
}

/**
 * Exact-origin CORS policy for authenticated browser Edge Functions.
 *
 * `Authorization` makes both checkout and order status preflighted when the
 * static frontend is hosted on a different origin. Never use a wildcard here:
 * the only browser origin allowed is the origin of `PUBLIC_SITE_URL`. Requests
 * without an Origin remain available to trusted non-browser callers/tests.
 */
export function browserCors(
  request: HandlerRequest,
  env: Env,
  allowedMethods: readonly string[],
): BrowserCorsDecision {
  return exactOriginCors(request, configuredPublicOrigin(env), allowedMethods);
}

function exactOriginCors(
  request: HandlerRequest,
  expectedOrigin: string | null,
  allowedMethods: readonly string[],
): BrowserCorsDecision {
  const origin = headerValue(request.headers, 'origin');
  if (!origin) {
    return request.method.toUpperCase() === 'OPTIONS'
      ? { response: forbidden('origin not allowed'), headers: {} }
      : { headers: {} };
  }

  if (!expectedOrigin || origin !== expectedOrigin) {
    return { response: forbidden('origin not allowed'), headers: {} };
  }

  const normalizedMethods = allowedMethods.map((method) => method.toUpperCase());
  const headers = actualResponseHeaders(expectedOrigin);
  if (request.method.toUpperCase() !== 'OPTIONS') return { headers };

  const requestedMethod = headerValue(request.headers, 'access-control-request-method')?.toUpperCase();
  const requestedHeaders = (headerValue(request.headers, 'access-control-request-headers') ?? '')
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  if (
    !requestedMethod ||
    !normalizedMethods.includes(requestedMethod) ||
    requestedHeaders.some((header) => !(ALLOWED_REQUEST_HEADERS as readonly string[]).includes(header))
  ) {
    return { response: forbidden('CORS preflight not allowed'), headers: {} };
  }

  const preflightHeaders = corsHeaders(expectedOrigin, normalizedMethods);
  return { response: { status: 200, headers: preflightHeaders, body: '' }, headers };
}

/**
 * Exact-origin CORS for the separately deployed Career Game frontend. The
 * hostname remains intentionally optional: browser traffic fails closed until
 * CAREER_GAME_SITE_URL is explicitly configured, while trusted no-Origin
 * callers remain supported.
 */
export function careerGameCors(
  request: HandlerRequest,
  env: Env,
  allowedMethods: readonly string[],
): BrowserCorsDecision {
  return exactOriginCors(request, configuredExactOrigin(env.careerGameSiteUrl), allowedMethods);
}

/**
 * Browser-only exact-origin policy for anonymous, non-authoritative product
 * validation events. Both first-class frontends may emit events, but an absent
 * Origin or any value outside the two deployment settings fails closed.
 */
export function productAnalyticsCors(
  request: HandlerRequest,
  env: Env,
  allowedMethods: readonly string[],
): BrowserCorsDecision {
  const origin = headerValue(request.headers, 'origin');
  if (!origin) return { response: forbidden('origin not allowed'), headers: {} };

  const allowedOrigins = [
    configuredPublicOrigin(env),
    configuredExactOrigin(env.careerGameSiteUrl),
  ].filter((candidate): candidate is string => candidate !== null);
  if (!allowedOrigins.includes(origin)) {
    return { response: forbidden('origin not allowed'), headers: {} };
  }
  return exactOriginCors(request, origin, allowedMethods);
}

/** Merge CORS headers without mutating the handler's server-authoritative result. */
export function withCorsHeaders(
  result: HandlerResult,
  headers: Record<string, string>,
): HandlerResult {
  if (Object.keys(headers).length === 0) return result;
  return { ...result, headers: { ...(result.headers ?? {}), ...headers } };
}
