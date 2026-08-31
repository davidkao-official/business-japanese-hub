import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AuthProvider,
  createBrowserPlatformServices,
} from '@business-japanese-hub/platform-auth'
import { createBrowserValidationAnalytics } from '@business-japanese-hub/validation-analytics'
import { CareerGameRouter } from './CareerGameRouter'
import { createCareerGameProgressRepository } from './career-game-progress'
import '../../../src/styles/tokens.css'
import './shell.css'

const platform = createBrowserPlatformServices('career-game')
const progressClient = platform.client
const createProgressRepository = progressClient
  ? (scenario: Parameters<typeof createCareerGameProgressRepository>[1]) =>
      createCareerGameProgressRepository(progressClient, scenario)
  : undefined
const analytics = createBrowserValidationAnalytics({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
})
const root = document.getElementById('root')

if (!root) {
  throw new Error('Career Game root element #root not found')
}

createRoot(root).render(
  <StrictMode>
    <AuthProvider authClient={platform.authClient}>
      <CareerGameRouter
        createProgressRepository={createProgressRepository}
        analytics={analytics}
      />
    </AuthProvider>
  </StrictMode>,
)
