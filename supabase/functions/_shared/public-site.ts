import type { Env } from './env.ts';

/**
 * Resolve a frontend route against the configured public site, preserving an
 * optional deployment sub-path. Invalid/missing configuration fails closed so
 * browser returns never land on the Supabase function origin by accident.
 */
export function publicSiteRoute(env: Env, route: string): string | null {
  const raw = env.publicSiteUrl?.trim();
  if (!raw) return null;
  try {
    const base = new URL(raw.endsWith('/') ? raw : `${raw}/`);
    const localHttp = base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname);
    if (base.protocol !== 'https:' && !localHttp) return null;
    if (base.username || base.password || base.search || base.hash) return null;
    return new URL(route.replace(/^\/+/, ''), base).toString();
  } catch {
    return null;
  }
}
