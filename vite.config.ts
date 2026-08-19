/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Extracts the light/dark `--color-bg` values from the single canonical color
 * source (`src/styles/tokens.css`). `index.html` deliberately contains NO
 * hard-coded theme-color literals, so a design-pass change to the tokens is the
 * only place to update; the browser-chrome colors are regenerated from here on
 * every build/dev transform.
 */
function extractBackgroundColors(): { light: string; dark: string } {
  const css = readFileSync(new URL('./src/styles/tokens.css', import.meta.url), 'utf8')
  const light = /:root\s*\{([^}]*)\}/.exec(css)?.[1]?.match(/--color-bg:\s*([^;]+);/)?.[1]?.trim()
  const dark = /:root\[data-theme='dark'\]\s*\{([^}]*)\}/.exec(css)?.[1]?.match(
    /--color-bg:\s*([^;]+);/,
  )?.[1]?.trim()
  if (!light || !dark) {
    throw new Error(
      'theme-color plugin: could not extract --color-bg (light/dark) from src/styles/tokens.css',
    )
  }
  return { light, dark }
}

/** Injects `<meta name="theme-color">` for light/dark from the token source. */
function themeColorPlugin(): Plugin {
  return {
    name: 'business-japanese-hub:theme-color',
    transformIndexHtml(html) {
      const { light, dark } = extractBackgroundColors()
      const metaLight = `<meta name="theme-color" media="(prefers-color-scheme: light)" content="${light}" />`
      const metaDark = `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${dark}" />`
      const stripped = html.replace(/<meta\s+name="theme-color"[^>]*\/?>/gi, '')
      return stripped.replace('</head>', `${metaLight}\n    ${metaDark}\n  </head>`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), themeColorPlugin()],
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
