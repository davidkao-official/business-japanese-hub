/**
 * Minimal auth contract for the reading surface.
 *
 * Auth is deliberately subordinate to reading: there is no account-center page,
 * and login/logout only gate entry to Library/Reader. This interface is the
 * smallest shape the app needs (session restore, password sign-in, sign-out,
 * change notification) and is adapter-injectable so tests use a mock and never
 * touch the network. Supabase is one adapter (./supabaseAuthClient.ts).
 */

/** The subset of an authenticated identity the app surface needs. */
export interface SessionUser {
  id: string;
  email?: string | null;
}

/** Result of a password sign-in attempt. */
export interface SignInResult {
  user: SessionUser;
}

export interface AuthClient {
  /** Restore the persisted session, or null when signed out. */
  getSession(): Promise<SessionUser | null>;

  /** Sign in with email/password. Throws on invalid credentials. */
  signInWithPassword(input: { email: string; password: string }): Promise<SignInResult>;

  /** Sign out the current session. */
  signOut(): Promise<void>;

  /**
   * Subscribe to auth state changes. Returns an unsubscribe function. Must
   * emit the current user on sign-in/out so consumers stay in sync.
   */
  onAuthStateChange(listener: (user: SessionUser | null) => void): () => void;
}
