import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { useMemo } from 'react'
import {
  AuthProvider,
  createBrowserPlatformServices,
  type AuthClient,
} from '@business-japanese-hub/platform-auth'
import { BookPage } from './app/BookPage'
import { HomePage } from './app/HomePage'
import { LibraryPage } from './app/LibraryPage'
import { LibraryLinkPage } from './app/LibraryLinkPage'
import { NotFoundPage } from './app/NotFoundPage'
import { PurchaseResultPage } from './app/PurchaseResultPage'
import { LegalIndexPage } from './app/legal/LegalIndexPage'
import { LegalPage } from './app/legal/LegalPage'
import { Layout } from './components/Layout'
import { ReaderPage } from './reader/ReaderPage'
import { AppearanceProvider } from './lib/appearance/AppearanceContext'
import { SupabaseUserStateRepository } from './lib/persistence/supabase'
import { UserStateProvider } from './lib/persistence/UserStateContext'
import { PurchaseProvider } from './lib/purchase/PurchaseContext'
import { createCheckoutPurchaseExecutor } from './lib/purchase/executor'
import { configureEdgeFunctionsAuth } from './lib/purchase/executor'
import type { UserStateRepository } from './lib/persistence/repository'
import { LearningEvidenceProvider } from './lib/learning/LearningEvidenceContext'
import type { LibraryLearningEvidenceRepository } from './lib/learning/repository'
import { SupabaseLibraryLearningEvidenceRepository } from './lib/learning/supabase'

/**
 * Platform bootstrap: one Supabase client (when the environment is configured)
 * is shared by the auth adapter and the user-state repository. Without
 * environment variables both degrade to signed-out / no-sync, so the whole app
 * renders as public (docs/accounts-and-entitlement.md §6).
 */
function createAppServices(): {
  authClient: AuthClient
  repository: UserStateRepository | null
  learningEvidenceRepository: LibraryLearningEvidenceRepository | null
  getAccessToken: () => Promise<string | null>
} {
  const platform = createBrowserPlatformServices('library')
  const client = platform.client
  if (!client) {
    return {
      authClient: platform.authClient,
      repository: null,
      learningEvidenceRepository: null,
      getAccessToken: async () => null,
    }
  }
  // The authenticated checkout / orders-status Edge Functions need the Supabase
  // session token (Bearer). Wire it once so the executor + result page can
  // authenticate; without a session this resolves to null (no auth header).
  configureEdgeFunctionsAuth(
    async () => (await client.auth.getSession()).data.session?.access_token ?? null,
  )
  return {
    authClient: platform.authClient,
    repository: new SupabaseUserStateRepository(client),
    learningEvidenceRepository: new SupabaseLibraryLearningEvidenceRepository(client),
    getAccessToken: async () => (await client.auth.getSession()).data.session?.access_token ?? null,
  }
}

/**
 * Platform-level routing. Routes are intentionally generic — no
 * book-specific route, component, or data lives here yet.
 */
export default function App() {
  const services = useMemo(() => createAppServices(), [])
  const routerBasename = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/'
  // The real #9 checkout executor, wired behind the provider-neutral purchase
  // seam. Jurisdiction is an explicit consumer self-declaration (never locale-
  // derived); the executor's fail-closed gate requires it. Without a configured
  // Edge Functions base URL it degrades to `unavailable`, so the app still
  // renders as before (#6 behavior).
  const purchaseExecutor = useMemo(() => createCheckoutPurchaseExecutor(), [])

  return (
    <AppearanceProvider>
      <AuthProvider authClient={services.authClient}>
        <LearningEvidenceProvider repository={services.learningEvidenceRepository}>
          <UserStateProvider repository={services.repository}>
            <PurchaseProvider executor={purchaseExecutor}>
              <BrowserRouter basename={routerBasename}>
                <Routes>
                  <Route element={<Layout />}>
                    <Route index element={<HomePage />} />
                    <Route path="library" element={<LibraryPage />} />
                    <Route path="library-link" element={<LibraryLinkPage />} />
                    <Route path="books/:slug" element={<BookPage />} />
                    <Route path="purchase/result" element={<PurchaseResultPage />} />
                    <Route path="legal" element={<LegalIndexPage />} />
                    <Route path="legal/:slug" element={<LegalPage />} />
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
        </LearningEvidenceProvider>
      </AuthProvider>
    </AppearanceProvider>
  )
}
