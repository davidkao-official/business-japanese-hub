import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import '../../../src/styles/tokens.css'
import './shell.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Career Game root element #root not found')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
