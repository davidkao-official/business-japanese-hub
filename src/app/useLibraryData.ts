/**
 * Library data — the personal-shelf view model (issue #6).
 *
 * Composes the catalog seam + the existing `UserStateRepository`: entitlement
 * per book (parallel, small catalog), then reading state per owned book, then
 * the §4.3 continue-reading ordering (most recently read first). No second
 * state architecture — everything flows through the repository interface.
 *
 * Like useBookState, the fetched result is keyed by the user identity and only
 * written from async callbacks; loading / defaults are derived.
 */

import { useCallback, useEffect, useState } from 'react'
import type { Book } from '../content/types'
import { listCatalogEntries } from '../reader/catalog'
import { progressFromReadingState } from '../reader/readingPosition'
import { useUserState } from '../lib/persistence/UserStateContext'
import type { ReadingState } from '../lib/persistence/types'

export interface LibraryBook {
  book: Book
  readingState: ReadingState | null
  /** Whole-book progress 0..1 (0 when never opened). */
  progress: number
}

export interface LibraryData {
  /** Every owned book (storefront inventory is never shown here). */
  books: LibraryBook[]
  /** Owned books with a reading state, most recently read first. */
  continueReading: Array<LibraryBook & { readingState: ReadingState }>
}

export interface LibraryDataState {
  data: LibraryData | null
  loading: boolean
  error: Error | null
  reload: () => void
}

interface FetchedLibraryData {
  user: import('../lib/auth/types').SessionUser
  data: LibraryData | null
  error: Error | null
}

/** A library book whose reading state resolved (used by the sort below). */
type ReadLibraryBook = LibraryBook & { readingState: ReadingState }

/** Sort newest first by the server-authoritative `updatedAt` (ISO-8601). */
function byUpdatedAtDesc(a: ReadLibraryBook, b: ReadLibraryBook): number {
  const at = a.readingState.updatedAt
  const bt = b.readingState.updatedAt
  if (at === bt) return 0
  return at < bt ? 1 : -1
}

export function useLibraryData(): LibraryDataState {
  const { user, authLoading, repository } = useUserState();
  const [fetched, setFetched] = useState<FetchedLibraryData | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  const active = Boolean(user && repository)

  useEffect(() => {
    if (!active) return

    let cancelled = false
    const repo = repository!
    const currentUser = user!

    const entries = listCatalogEntries()

    Promise.all(entries.map((entry) => repo.getEntitlement(entry.book.id)))
      .then((entitlements) => {
        const owned = entries
          .filter((_, index) => Boolean(entitlements[index]))
          .map((entry) => entry.book)

        if (owned.length === 0) {
          if (!cancelled) {
            setFetched({ user: currentUser, data: { books: [], continueReading: [] }, error: null })
          }
          return
        }

        // allSettled: one failed reading-state read must not blank the whole
        // shelf — the affected book simply degrades to zero progress.
        return Promise.allSettled(owned.map((book) => repo.getReadingState(book.id))).then(
          (results) => {
            if (cancelled) return
            const states = results.map((result) =>
              result.status === 'fulfilled' ? result.value : null,
            )
            const books: LibraryBook[] = owned.map((book, index) => {
              const readingState = states[index]
              return {
                book,
                readingState,
                progress: readingState ? progressFromReadingState(book, readingState) : 0,
              }
            })
            const continueReading = books
              .filter(
                (b): b is LibraryBook & { readingState: ReadingState } => b.readingState !== null,
              )
              .sort(byUpdatedAtDesc)
            setFetched({ user: currentUser, data: { books, continueReading }, error: null })
          },
        )
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setFetched({
          user: currentUser,
          data: null,
          error: reason instanceof Error ? reason : new Error(String(reason)),
        })
      })

    return () => {
      cancelled = true
    }
  }, [active, user, repository, reloadKey])

  const fresh = active && fetched !== null && fetched.user === user

  return {
    data: fresh ? fetched.data : null,
    loading: authLoading || (active && !fresh),
    error: fresh ? fetched.error : null,
    reload,
  }
}
