/**
 * UserStateProvider — the single injection point for the account-scoped state
 * repository (docs/accounts-and-entitlement.md §5.1, §8).
 *
 * This is a thin provider over the EXISTING `UserStateRepository` interface and
 * the existing `AuthProvider`; it does not introduce a second state
 * architecture. Consumers depend on `useUserState()` and never construct
 * adapters themselves.
 *
 * When no provider is present, `useUserState()` degrades to signed-out /
 * no-sync (a null repository), matching the docs' contract for an unconfigured
 * backend — so surfaces render as public without crashing.
 */

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import type { SessionUser } from '../auth/types';
import type { UserStateRepository } from './repository';

export interface UserStateContextValue {
  /** Current authenticated user, or null when signed out. */
  user: SessionUser | null;
  /** True until the auth session restore has resolved. */
  authLoading: boolean;
  /** The server-authoritative state repository, or null (no backend / no sync). */
  repository: UserStateRepository | null;
}

export interface UserStateProviderProps {
  repository: UserStateRepository | null;
  children: ReactNode;
}

const UserStateContext = createContext<UserStateContextValue | null>(null);

export function UserStateProvider({ repository, children }: UserStateProviderProps) {
  const { user, loading } = useAuth();

  const value = useMemo<UserStateContextValue>(
    () => ({ user, authLoading: loading, repository }),
    [user, loading, repository],
  );

  return <UserStateContext.Provider value={value}>{children}</UserStateContext.Provider>;
}

/** Signed-out default used when no provider is mounted (isolated renders/tests). */
const DEFAULT_VALUE: UserStateContextValue = { user: null, authLoading: false, repository: null };

export function useUserState(): UserStateContextValue {
  return useContext(UserStateContext) ?? DEFAULT_VALUE;
}
