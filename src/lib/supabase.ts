/**
 * Supabase client construction from environment.
 *
 * Environment contract (baked at build time by Vite):
 *  - `VITE_SUPABASE_URL`        — project URL, e.g. https://xxxx.supabase.co
 *  - `VITE_SUPABASE_ANON_KEY`   — public anon key (safe for the browser; RLS is
 *                                 the actual gate, never the anon key).
 *
 * Returns `null` when unset so the app can run without a provisioned instance
 * (e.g. local dev before Supabase is configured); callers then degrade to
 * signed-out / no-sync. Creating a live Supabase instance is an environment
 * dependency documented in docs/accounts-and-entitlement.md.
 */
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

export function createSupabaseClientFromEnv(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey);
}
