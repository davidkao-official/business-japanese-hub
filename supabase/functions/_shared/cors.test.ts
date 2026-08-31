import { describe, expect, it } from 'vitest';
import type { Env } from './env.ts';
import {
  browserCors,
  careerGameCors,
  productAnalyticsCors,
  withCorsHeaders,
} from './cors.ts';
import { toResponse } from './deno.ts';
import { jsonResult, type HandlerRequest } from './http.ts';

const ENV = {
  publicSiteUrl: 'https://davidkao-official.github.io/business-japanese-hub/',
} as Env;

function request(method: string, headers: Record<string, string> = {}): HandlerRequest {
  return {
    method,
    url: 'https://project.supabase.co/functions/v1/checkout/books/book-a',
    headers,
    bodyText: '',
  };
}

describe('browser CORS policy', () => {
  it('answers an exact-origin checkout preflight without exposing credentials', () => {
    const decision = browserCors(
      request('OPTIONS', {
        origin: 'https://davidkao-official.github.io',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, content-type',
      }),
      ENV,
      ['POST'],
    );

    expect(decision.response).toEqual({
      status: 200,
      headers: expect.objectContaining({
        'Access-Control-Allow-Origin': 'https://davidkao-official.github.io',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
        Vary: 'Origin',
      }),
      body: '',
    });
    expect(decision.response?.headers?.['Access-Control-Allow-Credentials']).toBeUndefined();
    expect(() => toResponse(decision.response!)).not.toThrow();
  });

  it('adds the exact origin to an actual browser response', () => {
    const decision = browserCors(
      request('GET', { origin: 'https://davidkao-official.github.io' }),
      ENV,
      ['GET'],
    );
    expect(decision.response).toBeUndefined();
    expect(withCorsHeaders(jsonResult(200, { ok: true }), decision.headers)).toEqual({
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://davidkao-official.github.io',
        Vary: 'Origin',
      },
      body: '{"ok":true}',
    });
  });

  it('denies a mismatched browser origin before the handler runs', () => {
    const decision = browserCors(
      request('POST', { origin: 'https://attacker.example' }),
      ENV,
      ['POST'],
    );
    expect(decision.response?.status).toBe(403);
    expect(decision.response?.headers?.['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('fails closed for browser traffic when PUBLIC_SITE_URL is missing or invalid', () => {
    const missing = browserCors(
      request('GET', { origin: 'https://davidkao-official.github.io' }),
      { ...ENV, publicSiteUrl: undefined },
      ['GET'],
    );
    const invalid = browserCors(
      request('GET', { origin: 'https://davidkao-official.github.io' }),
      { ...ENV, publicSiteUrl: 'http://public.example' },
      ['GET'],
    );
    expect(missing.response?.status).toBe(403);
    expect(invalid.response?.status).toBe(403);
  });

  it('rejects unsupported preflight methods and headers', () => {
    const method = browserCors(
      request('OPTIONS', {
        origin: 'https://davidkao-official.github.io',
        'access-control-request-method': 'DELETE',
      }),
      ENV,
      ['GET'],
    );
    const headers = browserCors(
      request('OPTIONS', {
        origin: 'https://davidkao-official.github.io',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization, x-unexpected',
      }),
      ENV,
      ['GET'],
    );
    expect(method.response?.status).toBe(403);
    expect(headers.response?.status).toBe(403);
  });

  it('allows non-browser server calls without adding CORS headers', () => {
    expect(browserCors(request('GET'), ENV, ['GET'])).toEqual({ headers: {} });
  });

  it('uses only the dedicated exact Career Game origin and fails closed when undecided', () => {
    const configured = careerGameCors(
      request('POST', { origin: 'https://game.example.com' }),
      { ...ENV, careerGameSiteUrl: 'https://game.example.com/play' },
      ['POST'],
    );
    const libraryOrigin = careerGameCors(
      request('POST', { origin: 'https://davidkao-official.github.io' }),
      { ...ENV, careerGameSiteUrl: 'https://game.example.com/play' },
      ['POST'],
    );
    const undecided = careerGameCors(
      request('POST', { origin: 'https://game.example.com' }),
      { ...ENV, careerGameSiteUrl: undefined },
      ['POST'],
    );
    expect(configured.response).toBeUndefined();
    expect(configured.headers['Access-Control-Allow-Origin']).toBe('https://game.example.com');
    expect(libraryOrigin.response?.status).toBe(403);
    expect(undecided.response?.status).toBe(403);
    expect(careerGameCors(request('POST'), ENV, ['POST'])).toEqual({ headers: {} });
  });
});

describe('product analytics CORS policy', () => {
  const analyticsEnv = {
    ...ENV,
    publicSiteUrl: 'https://business-japanese-hub.pages.dev/',
    careerGameSiteUrl: 'https://career-game.pages.dev/play',
  } as Env;

  it.each([
    'https://business-japanese-hub.pages.dev',
    'https://career-game.pages.dev',
  ])('allows the exact configured product origin %s', (origin) => {
    const decision = productAnalyticsCors(
      request('POST', { origin }),
      analyticsEnv,
      ['POST'],
    );
    expect(decision.response).toBeUndefined();
    expect(decision.headers).toEqual({
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin',
    });
  });

  it('answers an allowed preflight without a wildcard or credentials', () => {
    const decision = productAnalyticsCors(
      request('OPTIONS', {
        origin: 'https://career-game.pages.dev',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      }),
      analyticsEnv,
      ['POST'],
    );
    expect(decision.response?.status).toBe(200);
    expect(decision.response?.headers?.['Access-Control-Allow-Origin']).toBe(
      'https://career-game.pages.dev',
    );
    expect(decision.response?.headers?.['Access-Control-Allow-Origin']).not.toBe('*');
    expect(decision.response?.headers?.['Access-Control-Allow-Credentials']).toBeUndefined();
  });

  it('fails closed for absent, unconfigured, or invalid origins', () => {
    const absent = productAnalyticsCors(request('POST'), analyticsEnv, ['POST']);
    const unconfigured = productAnalyticsCors(
      request('POST', { origin: 'https://attacker.example' }),
      analyticsEnv,
      ['POST'],
    );
    const invalidConfiguration = productAnalyticsCors(
      request('POST', { origin: 'https://career-game.pages.dev' }),
      {
        ...analyticsEnv,
        publicSiteUrl: 'javascript:alert(1)',
        careerGameSiteUrl: 'http://career-game.pages.dev',
      },
      ['POST'],
    );

    expect(absent.response?.status).toBe(403);
    expect(unconfigured.response?.status).toBe(403);
    expect(invalidConfiguration.response?.status).toBe(403);
  });
});
