import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { useMemo } from 'react'
import { BookPage } from './app/BookPage'
import { HomePage } from './app/HomePage'
import { LibraryPage } from './app/LibraryPage'
import { NotFoundPage } from './app/NotFoundPage'
import { Layout } from './components/Layout'
import { ReaderPage } from './reader/ReaderPage'
import { AuthProvider } from './lib/auth/AuthContext'
import { createNullAuthClient } from './lib/auth/nullAuthClient'
import { SupabaseAuthClient } from './lib/auth/supabaseAuthClient'
import { SupabaseUserStateRepository } from './lib/persistence/supabase'
import { UserStateProvider } from './lib/persistence/UserStateContext'
import { PurchaseProvider } from './lib/purchase/PurchaseContext'
import { createSupabaseClientFromEnv } from './lib/supabase'
import type { AuthClient } from './lib/auth/types'
import type { UserStateRepository } from './lib/persistence/repository'

/**
 * Platform bootstrap: one Supabase client (when the environment is configured)
 * is shared by the auth adapter and the user-state repository. Without
 * environment variables both degrade to signed-out / no-sync, so the whole app
 * renders as public (docs/accounts-and-entitlement.md §6).
 */
function createAppServices(): {
  authClient: AuthClient
  repository: UserStateRepository | null
} {
  const client = createSupabaseClientFromEnv()
  if (!client) {
    return { authClient: createNullAuthClient(), repository: null }
  }
  return {
    authClient: new SupabaseAuthClient(client),
    repository: new SupabaseUserStateRepository(client),
  }
}

/**
 * Platform-level routing. Routes are intentionally generic — no
 * book-specific route, component, or data lives here yet.
 */
export default function App() {
  const services = useMemo(() => createAppServices(), [])

  return (
    <AuthProvider authClient={services.authClient}>
      <UserStateProvider repository={services.repository}>
        <PurchaseProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<HomePage />} />
                <Route path="library" element={<LibraryPage />} />
                <Route path="books/:slug" element={<BookPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
              {/* The reader is an immersive surface — it renders OUTSIDE the site
                  chrome (no Header/Footer) and owns the whole viewport. */}
              <Route path="books/:slug/read" element={<ReaderPage />} />
              <Route path="books/:slug/read/:chapterSlug" element={<ReaderPage />} />
            </Routes>
          </BrowserRouter>
        </PurchaseProvider>
      </UserStateProvider>
    </AuthProvider>
  )
}
