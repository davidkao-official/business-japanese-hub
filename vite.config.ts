/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Deployment base contract: the app is deployed at the site root, so assets
  // use an absolute base (`/assets/...`). `BrowserRouter` in src/App.tsx has no
  // basename, matching this root base. A nested-route direct load or refresh
  // (e.g. `/books/:slug`) therefore resolves assets from the root instead of
  // beneath the current document path. The host must still serve index.html as
  // the SPA fallback for unknown routes. If the app is ever hosted under a
  // sub-path, `base` here and the `<BrowserRouter basename>` must both change
  // together. See src/deploy-base.test.ts for the regression guard.
  base: '/',
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
