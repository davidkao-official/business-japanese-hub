/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { deploymentIdentityPlugin } from './vite.deployment-identity'

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

/**
 * Resolve the public deployment path. The canonical Cloudflare Pages site is
 * deployed at the origin root (`/`). `DEPLOY_BASE_PATH` remains a narrow escape
 * hatch for a future explicitly path-prefixed deployment without coupling the
 * router or asset URLs to a specific hosting provider.
 */
export function resolveDeploymentBase(raw: string | undefined): string {
  const candidate = raw?.trim() || '/'
  if (!candidate.startsWith('/') || candidate.includes('?') || candidate.includes('#')) {
    throw new Error('DEPLOY_BASE_PATH must be an absolute path such as /app/')
  }
  const segments = candidate.split('/').filter(Boolean)
  if (
    segments.some(
      (segment) =>
        segment === '.' ||
        segment === '..' ||
        !/^[A-Za-z0-9._~-]+$/.test(segment),
    )
  ) {
    throw new Error('DEPLOY_BASE_PATH contains an unsafe path segment')
  }
  return segments.length === 0 ? '/' : `/${segments.join('/')}/`
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), themeColorPlugin(), deploymentIdentityPlugin('library')],
  // `BASE_URL` is derived from this value and is also used as BrowserRouter's
  // basename. Cloudflare Pages production uses the root default.
  base: resolveDeploymentBase(process.env.DEPLOY_BASE_PATH),
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: [
      'src/**/*.test.{ts,tsx}',
      'apps/**/*.test.{ts,tsx}',
      'packages/**/*.test.ts',
      'supabase/functions/**/*.test.ts',
    ],
    css: false,
  },
})
