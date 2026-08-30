import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createSupabaseClientFromEnv,
  type BrowserPlatformEnvironment,
  type PlatformApplicationId,
} from './browser'
import { createNullAuthClient } from './nullAuthClient'
import { SupabaseAuthClient } from './supabaseAuthClient'
import type { AuthClient } from './types'

export interface BrowserPlatformServices {
  applicationId: PlatformApplicationId
  client: SupabaseClient | null
  authClient: AuthClient
}

/** One construction seam shared by Library and Career Game browser bootstraps. */
export function createBrowserPlatformServices(
  applicationId: PlatformApplicationId,
  environment: BrowserPlatformEnvironment = import.meta.env,
): BrowserPlatformServices {
  const client = createSupabaseClientFromEnv(applicationId, environment)
  return {
    applicationId,
    client,
    authClient: client ? new SupabaseAuthClient(client) : createNullAuthClient(),
  }
}
