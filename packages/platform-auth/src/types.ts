/** The subset of the shared Supabase identity both product surfaces need. */
export interface SessionUser {
  id: string
  email?: string | null
}

/** Result of a password sign-in attempt. */
export interface SignInResult {
  user: SessionUser
}

/** Sign-up can require email confirmation before Supabase creates a session. */
export interface SignUpResult {
  user: SessionUser
  signedIn: boolean
}

/**
 * Minimal shared browser identity contract.
 *
 * Both frontends consume this interface and the same Supabase `auth.users`
 * namespace. Product data and authorization remain outside this contract.
 */
export interface AuthClient {
  /** Restore the persisted session, or null when signed out. */
  getSession(): Promise<SessionUser | null>

  /** Sign in with email/password. Throws on invalid credentials. */
  signInWithPassword(input: { email: string; password: string }): Promise<SignInResult>

  /** Create an email/password account; `signedIn=false` means confirmation is pending. */
  signUpWithPassword(input: { email: string; password: string }): Promise<SignUpResult>

  /** Sign out the current session. */
  signOut(): Promise<void>

  /** Subscribe to auth state changes and return an unsubscribe function. */
  onAuthStateChange(listener: (user: SessionUser | null) => void): () => void
}
