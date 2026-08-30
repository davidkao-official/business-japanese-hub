import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Career Game is independently bootable, but has no production hostname or
// routing contract yet. Its output stays separate from the canonical Library
// artifact published by Cloudflare Pages.
export default defineConfig({
  root: 'apps/career-game',
  envDir: '../..',
  plugins: [react()],
  build: {
    outDir: '../../dist-career-game',
    emptyOutDir: true,
  },
})
