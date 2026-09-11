import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import type { Plugin, UserConfig } from 'vite'
import { deploymentIdentityPlugin } from '../../vite.deployment-identity.ts'
import { resolveDeploymentBase } from './deployment-base.ts'

export { resolveDeploymentBase } from './deployment-base.ts'

function extractBackgroundColors(): { light: string; dark: string } {
  const css = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8')
  const light = /:root\s*\{([^}]*)\}/.exec(css)?.[1]?.match(/--color-bg:\s*([^;]+);/)?.[1]?.trim()
  const dark = /:root\[data-theme='dark'\]\s*\{([^}]*)\}/.exec(css)?.[1]?.match(/--color-bg:\s*([^;]+);/)?.[1]?.trim()
  if (!light || !dark) throw new Error('theme-color plugin: could not extract --color-bg (light/dark) from src/styles/tokens.css')
  return { light, dark }
}

/** Injects the browser-chrome colors from the canonical design-token source. */
export function themeColorPlugin(): Plugin {
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

/** Shared config factory for Vite CLI/dev and the provenance-checked build. */
export function libraryViteConfig(): UserConfig & {
  test: { environment: string; setupFiles: string[]; include: string[]; css: boolean }
} {
  return {
    plugins: [react(), themeColorPlugin(), deploymentIdentityPlugin('library')],
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
  }
}

/** Shared config factory for the isolated Career Game artifact. */
export function careerGameViteConfig(): UserConfig {
  return {
    root: 'apps/career-game',
    envDir: '../..',
    plugins: [react(), deploymentIdentityPlugin('career-game')],
    build: {
      outDir: '../../dist-career-game',
      emptyOutDir: true,
    },
  }
}
