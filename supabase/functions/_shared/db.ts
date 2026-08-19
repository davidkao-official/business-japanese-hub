/**
 * Minimal structural DB client used by every Edge Function handler (§3.5
 * service-role persistence).
 *
 * All writes happen through a service-role client built from
 * `SUPABASE_SERVICE_ROLE_KEY` — NEVER the anon key, and never a client JWT. The
 * client JWT is used ONLY for ownership / role checks (`auth.getUser`), never
 * for writes.
 *
 * This module defines the narrow, structural interface the pure handlers depend
 * on. It intentionally does NOT import `@supabase/supabase-js` (no Deno/vitest
 * module-resolution coupling). The Deno entry (`index.ts`) supplies the real
 * `createClient` factory; tests inject fakes. The real SupabaseClient is
 * structurally compatible with `DbClient` for the subset used here.
 */
import type { Env } from './env.ts';

export interface DbError {
  message: string;
}

export interface DbResult<T = unknown> {
  data: T | null;
  error: DbError | null;
}

/**
 * Minimal chainable PostgREST builder subset used by the handlers. `insert`,
 * `update`, `delete`, `select`, filters, `order`, `limit` return the builder;
 * `single` / `maybeSingle` are terminal promises; the builder is also awaitable
 * (resolves to a row list) via `then`, mirroring @supabase/supabase-js.
 */
export interface DbBuilder {
  select(columns?: string): DbBuilder;
  eq(column: string, value: unknown): DbBuilder;
  neq(column: string, value: unknown): DbBuilder;
  lte(column: string, value: unknown): DbBuilder;
  gte(column: string, value: unknown): DbBuilder;
  in(column: string, values: readonly unknown[]): DbBuilder;
  or(filters: string): DbBuilder;
  order(column: string, opts?: { ascending?: boolean }): DbBuilder;
  limit(count: number): DbBuilder;
  insert(row: unknown): DbBuilder;
  upsert(row: unknown, opts?: { onConflict?: string; ignoreDuplicates?: boolean }): DbBuilder;
  update(partial: Record<string, unknown>): DbBuilder;
  delete(): DbBuilder;
  maybeSingle(): Promise<DbResult<Record<string, unknown>>>;
  single(): Promise<DbResult<Record<string, unknown>>>;
  then<TResult1 = DbResult<Record<string, unknown>[]>>(
    onfulfilled?:
      | ((value: DbResult<Record<string, unknown>[]>) => TResult1 | PromiseLike<TResult1>)
      | null,
  ): Promise<TResult1>;
}

/** Auth verification seam: `auth.getUser(token)` verifies a session against GoTrue. */
export interface DbAuth {
  getUser(token: string): Promise<DbResult<{ user: { id: string } | null }>>;
}

export interface DbClient {
  from(table: string): DbBuilder;
  rpc(fn: string, args: Record<string, unknown>): Promise<DbResult<Record<string, unknown>>>;
  auth: DbAuth;
}

/** `createClient` from @supabase/supabase-js, structurally (Deno entry injects the real one). */
export type DbClientFactory = (url: string, key: string) => DbClient;

/**
 * Build the service-role client from `Env`. Fails closed (throws) when the
 * service-role key or URL is absent — there is NEVER an anon-key fallback.
 */
export function createServiceRoleClient(factory: DbClientFactory, env: Env): DbClient {
  if (!env.supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to build the service-role client');
  }
  if (!env.supabaseUrl) {
    throw new Error('SUPABASE_URL is required to build the service-role client');
  }
  return factory(env.supabaseUrl, env.supabaseServiceRoleKey);
}
