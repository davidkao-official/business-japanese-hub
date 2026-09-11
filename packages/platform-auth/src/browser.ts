import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

export type PlatformApplicationId = 'library' | 'career-game'

/** Exact public browser configuration admitted by the production build spec. */
export interface BrowserPlatformEnvironment {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

/** Do not pass whole import.meta.env: arbitrary VITE_* values are not build inputs. */
export function defaultBrowserPlatformEnvironment(): BrowserPlatformEnvironment {
  return {
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  }
}

/**
 * Create the shared Supabase browser client for either frontend.
 *
 * Both applications intentionally keep Supabase's default project-scoped auth
 * storage key. That lets same-origin deployments reuse a session, while
 * separate origins reauthenticate against the same durable `auth.users`
 * namespace. The application tag is untrusted diagnostic metadata only.
 */
export function createSupabaseClientFromEnv(
  applicationId: PlatformApplicationId,
  environment: BrowserPlatformEnvironment = defaultBrowserPlatformEnvironment(),
): SupabaseClient | null {
  const url = environment.VITE_SUPABASE_URL
  const anonKey = environment.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null

  return createClient(url, anonKey, {
    global: {
      headers: { 'X-Client-Info': `business-japanese-hub/${applicationId}` },
    },
  })
}
