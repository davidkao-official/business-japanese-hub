/**
 * Minimal auth context for the reading surface.
 *
 * Provides session restore on mount, sign-in, sign-out, and reactive user
 * state. It renders children immediately (loading never hides content), so it
 * can be mounted high in the tree without blocking public surfaces — public
 * previews must not require sign-in (docs/ui-ux-research.md §4.2).
 *
 * Mounting/wiring into the app shell and any login/logout UI is an integration
 * step owned by the Library/Reader lanes (#6/#5); this module defines and tests
 * the primitive.
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthClient, SessionUser } from './types';

export interface AuthContextValue {
  /** Current authenticated user, or null when signed out. */
  user: SessionUser | null;
  /** True until the initial session restore has resolved. */
  loading: boolean;
  /** Sign in with email/password. Throws on invalid credentials. */
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  authClient: AuthClient;
  children: ReactNode;
}

export function AuthProvider({ authClient, children }: AuthProviderProps) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Restore the persisted session. A failed restore (e.g. network/expiry)
    // degrades to signed-out rather than crashing the surface.
    authClient
      .getSession()
      .then((sessionUser) => {
        if (active) setUser(sessionUser);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const unsubscribe = authClient.onAuthStateChange((nextUser) => {
      if (active) setUser(nextUser);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [authClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      signIn: async (email: string, password: string) => {
        const { user: nextUser } = await authClient.signInWithPassword({ email, password });
        // onAuthStateChange normally fires too; setting here keeps state
        // consistent even if the adapter emits no event.
        setUser(nextUser);
      },
      signOut: async () => {
        await authClient.signOut();
        setUser(null);
      },
    }),
    [authClient, user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return context;
}
