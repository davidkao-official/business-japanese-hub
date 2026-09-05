import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { deploymentIdentityPlugin } from './vite.deployment-identity.ts'

// Career Game is independently bootable and publishes its root-hosted SPA
// artifact to the dedicated Cloudflare Pages project documented in
// docs/deployment.md. Its output remains separate from the Library artifact.
export default defineConfig({
  root: 'apps/career-game',
  envDir: '../..',
  plugins: [react(), deploymentIdentityPlugin('career-game')],
  build: {
    outDir: '../../dist-career-game',
    emptyOutDir: true,
  },
})
