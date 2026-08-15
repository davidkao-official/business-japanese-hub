/**
 * Per-book user-state hooks: entitlement + reading state for one book.
 *
 * Both are thin wrappers over the existing `UserStateRepository` interface.
 * When signed out or no backend is configured they resolve to owned:false /
 * null reading state WITHOUT any network call (deny-by-default, and public
 * surfaces never require sign-in — docs/ui-ux-research.md §4.2).
 *
 * State is keyed by the exact auth user (object reference) + book id and only
 * ever written from async callbacks: `loading` is derived from "the current
 * identity has not been fetched yet", so an account change — even to the same
 * account via a fresh session — automatically masks the previous session's
 * state instead of flashing it.
 */

import { useCallback, useEffect, useState } from 'react';
import type { SessionUser } from '../auth/types';
import type { ReadingState, SaveReadingStateInput } from './types';
import { useUserState } from './UserStateContext';

export interface BookState {
  /** True while auth restore or the entitlement/reading-state fetch is pending. */
  loading: boolean;
  /** Server-authoritative ownership; false when signed out or no backend. */
  owned: boolean;
  /** The user's last-read location, or null. */
  readingState: ReadingState | null;
  /** Fetch error, or null. */
  error: Error | null;
}

interface FetchedBookState {
  user: SessionUser;
  bookId: string;
  owned: boolean;
  readingState: ReadingState | null;
  error: Error | null;
}

export function useBookState(bookId: string): BookState {
  const { user, authLoading, repository } = useUserState();
  const [fetched, setFetched] = useState<FetchedBookState | null>(null);

  const active = Boolean(user && repository && bookId !== '');

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    const repo = repository!;
    const currentUser = user!;

    Promise.all([repo.getEntitlement(bookId), repo.getReadingState(bookId)])
      .then(([entitlement, readingState]) => {
        if (cancelled) return;
        setFetched({
          user: currentUser,
          bookId,
          owned: Boolean(entitlement),
          readingState,
          error: null,
        });
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setFetched({
          user: currentUser,
          bookId,
          owned: false, // deny-by-default on read failure
          readingState: null,
          error: reason instanceof Error ? reason : new Error(String(reason)),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [bookId, active, user, repository]);

  const fresh = active && fetched !== null && fetched.user === user && fetched.bookId === bookId;

  return {
    loading: authLoading || (active && !fresh),
    owned: fresh ? fetched.owned : false,
    readingState: fresh ? fetched.readingState : null,
    error: fresh ? fetched.error : null,
  };
}

/** Persist the user's last-read location; no-op when signed out / no backend. */
export function useSaveReadingState(): (state: SaveReadingStateInput) => void {
  const { user, repository } = useUserState();

  return useCallback(
    (state) => {
      if (!user || !repository) return;
      void repository.saveReadingState(state).catch(() => {
        // Best-effort: a failed position save must never interrupt reading.
      });
    },
    [user, repository],
  );
}

/**
 * Ownership-only state for list surfaces (storefront cards). Reads just the
 * entitlement, so a card does not fetch reading state it does not need.
 */
export function useBookOwned(bookId: string): { owned: boolean; loading: boolean } {
  const { user, authLoading, repository } = useUserState();
  const [fetched, setFetched] = useState<FetchedBookState | null>(null);

  const active = Boolean(user && repository && bookId !== '');

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const repo = repository!;
    const currentUser = user!;

    repo
      .getEntitlement(bookId)
      .then((entitlement) => {
        if (!cancelled) {
          setFetched({ user: currentUser, bookId, owned: Boolean(entitlement), readingState: null, error: null });
        }
      })
      .catch(() => {
        if (!cancelled) setFetched({ user: currentUser, bookId, owned: false, readingState: null, error: null });
      });

    return () => {
      cancelled = true;
    };
  }, [bookId, active, user, repository]);

  const fresh = active && fetched !== null && fetched.user === user && fetched.bookId === bookId;

  return { owned: fresh ? fetched.owned : false, loading: authLoading || (active && !fresh) };
}
