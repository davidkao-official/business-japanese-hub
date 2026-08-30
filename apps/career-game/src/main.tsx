import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  AuthProvider,
  createBrowserPlatformServices,
} from '@business-japanese-hub/platform-auth'
import App from './App'
import '../../../src/styles/tokens.css'
import './shell.css'

const platform = createBrowserPlatformServices('career-game')
const root = document.getElementById('root')

if (!root) {
  throw new Error('Career Game root element #root not found')
}

createRoot(root).render(
  <StrictMode>
    <AuthProvider authClient={platform.authClient}>
      <App />
    </AuthProvider>
  </StrictMode>,
)
