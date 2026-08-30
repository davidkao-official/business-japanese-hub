/**
 * Shared test render helpers for issue #6 surfaces.
 *
 * Wraps a component tree in the same providers App mounts: AuthProvider +
 * UserStateProvider + PurchaseProvider + MemoryRouter. Surfaces that consume
 * `useUserState()` / `usePurchase()` must be rendered through here (or through
 * `<App />`, which mounts its own providers).
 */

import { render } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { AuthProvider } from '@business-japanese-hub/platform-auth'
import type { AuthClient, SessionUser } from '@business-japanese-hub/platform-auth'
import { AppearanceProvider } from '../lib/appearance/AppearanceContext'
import { UserStateProvider } from '../lib/persistence/UserStateContext'
import type { UserStateRepository } from '../lib/persistence/repository'
import type { Entitlement, ReadingState } from '../lib/persistence/types'
import { PurchaseProvider } from '../lib/purchase/PurchaseContext'
import type { PurchaseExecutor } from '../lib/purchase/types'

export interface MockAuthClient extends AuthClient {
  emitAuthStateChange(user: SessionUser | null): void
}

/** Auth client whose session restore resolves immediately to `session`. */
export function createMockAuthClient(session: SessionUser | null): MockAuthClient {
  const listeners: Array<(user: SessionUser | null) => void> = []
  return {
    getSession: vi.fn().mockResolvedValue(session),
    signInWithPassword: vi.fn().mockResolvedValue({
      user: { id: 'u-1', email: 'reader@example.com' },
    }),
    signUpWithPassword: vi.fn().mockResolvedValue({
      user: { id: 'u-1', email: 'reader@example.com' },
      signedIn: true,
    }),
    signOut: vi.fn().mockResolvedValue(undefined),
    onAuthStateChange: vi.fn((listener) => {
      listeners.push(listener)
      return () => {}
    }),
    emitAuthStateChange(nextUser) {
      for (const listener of listeners) listener(nextUser)
    },
  }
}

export interface MockRepositoryState {
  entitlements?: Record<string, Entitlement>
  readingStates?: Record<string, ReadingState>
}

/** In-memory `UserStateRepository` (no network). */
export function createMockRepository(state: MockRepositoryState = {}): UserStateRepository {
  return {
    getEntitlement: vi.fn(async (bookId: string) => state.entitlements?.[bookId] ?? null),
    getReadingState: vi.fn(async (bookId: string) => state.readingStates?.[bookId] ?? null),
    saveReadingState: vi.fn(async () => {}),
    listBookmarks: vi.fn(async () => []),
    saveBookmark: vi.fn(async () => ({
      id: 'bm-1',
      bookId: 'book',
      chapterId: 'ch-1',
      createdAt: '2026-08-01T00:00:00.000Z',
    })),
  }
}

export interface RenderAppOptions {
  /** Defaults to signed-out. */
  session?: SessionUser | null
  /** Defaults to null (no backend / no sync). */
  repository?: UserStateRepository | null
  purchaseExecutor?: PurchaseExecutor
  initialEntries?: string[]
  initialIndex?: number
}

export function renderWithAppProviders(ui: ReactElement, options: RenderAppOptions = {}) {
  const {
    session = null,
    repository = null,
    purchaseExecutor,
    initialEntries = ['/'],
    initialIndex,
  } = options
  const authClient = createMockAuthClient(session)

  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppearanceProvider>
      <AuthProvider authClient={authClient}>
        <UserStateProvider repository={repository}>
          <PurchaseProvider executor={purchaseExecutor}>
            <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
              {children}
            </MemoryRouter>
          </PurchaseProvider>
        </UserStateProvider>
      </AuthProvider>
    </AppearanceProvider>
  )

  return { ...render(ui, { wrapper }), authClient, repository }
}
