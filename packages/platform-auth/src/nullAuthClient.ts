import type { AuthClient } from './types'

/** Signed-out adapter used when the shared public Supabase config is absent. */
export function createNullAuthClient(): AuthClient {
  return {
    getSession: async () => null,
    signInWithPassword: async () => {
      throw new Error('authentication is unavailable: no auth provider is configured')
    },
    signUpWithPassword: async () => {
      throw new Error('authentication is unavailable: no auth provider is configured')
    },
    signOut: async () => {},
    onAuthStateChange: () => () => {},
  }
}
