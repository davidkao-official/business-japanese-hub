import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AuthProvider,
  createBrowserPlatformServices,
} from '@business-japanese-hub/platform-auth'
import App from './App'
import { createCareerGameProgressRepository } from './career-game-progress'
import { rookieSurvivalScenario } from './content/rookie-survival'
import '../../../src/styles/tokens.css'
import './shell.css'

const platform = createBrowserPlatformServices('career-game')
const progressRepository = platform.client
  ? createCareerGameProgressRepository(platform.client, rookieSurvivalScenario)
  : undefined
const root = document.getElementById('root')

if (!root) {
  throw new Error('Career Game root element #root not found')
}

createRoot(root).render(
  <StrictMode>
    <AuthProvider authClient={platform.authClient}>
      <App progressRepository={progressRepository} />
    </AuthProvider>
  </StrictMode>,
)
