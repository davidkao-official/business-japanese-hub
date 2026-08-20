/**
 * Signed-out auth adapter for when no Supabase instance is configured.
 *
 * `AuthProvider` requires an `AuthClient`; when `createSupabaseClientFromEnv()`
 * returns null the app degrades to signed-out / no-sync (docs/accounts-and-
 * entitlement.md §6), and this stub is the minimal adapter for that state.
 */

import type { AuthClient } from './types';

export function createNullAuthClient(): AuthClient {
  return {
    getSession: async () => null,
    signInWithPassword: async () => {
      throw new Error('authentication is unavailable: no auth provider is configured');
    },
    signUpWithPassword: async () => {
      throw new Error('authentication is unavailable: no auth provider is configured');
    },
    signOut: async () => {},
    onAuthStateChange: () => () => {},
  };
}
