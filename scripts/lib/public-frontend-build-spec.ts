import { resolve } from 'node:path'
import type { InlineConfig } from 'vite'
import { resolveDeploymentBase } from './deployment-base.ts'

export type PublicFrontendProduct = 'library' | 'career-game'

const sharedClientEnvironmentKeys = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_EDGE_FUNCTIONS_BASE_URL',
] as const

const productClientEnvironmentKeys: Record<PublicFrontendProduct, readonly string[]> = {
  library: ['VITE_CAREER_GAME_ORIGIN'],
  'career-game': ['VITE_LIBRARY_ORIGIN'],
}

const allClientEnvironmentKeys = new Set([
  ...sharedClientEnvironmentKeys,
  ...Object.values(productClientEnvironmentKeys).flat(),
])

export interface PublicFrontendBuildSpec {
  product: PublicFrontendProduct
  root: string
  entry: string
  base: string
  clientEnvironmentKeys: readonly string[]
}

export function publicFrontendBuildSpec(
  root: string,
  product: PublicFrontendProduct,
  environment: NodeJS.ProcessEnv = process.env,
): PublicFrontendBuildSpec {
  const frontendRoot = product === 'library' ? root : resolve(root, 'apps/career-game')
  return {
    product,
    root: frontendRoot,
    entry: resolve(frontendRoot, 'index.html'),
    base: resolveDeploymentBase(environment.DEPLOY_BASE_PATH),
    clientEnvironmentKeys: [...sharedClientEnvironmentKeys, ...productClientEnvironmentKeys[product]],
  }
}

/** Reject any browser-prefixed environment input that is not contractually public. */
export function assertPublicBuildEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): void {
  const unexpected = Object.keys(environment)
    .filter((key) => key.startsWith('VITE_') && !allClientEnvironmentKeys.has(key))
    .sort()
  if (unexpected.length > 0) {
    throw new Error(`ERR  public build has unapproved VITE environment keys: ${unexpected.join(', ')}`)
  }
}

/** Inject only exact, product-approved public keys; Vite env discovery stays disabled. */
export function publicBuildDefines(
  spec: PublicFrontendBuildSpec,
  environment: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  return Object.fromEntries(
    spec.clientEnvironmentKeys.map((key) => [
      `import.meta.env.${key}`,
      JSON.stringify(environment[key] ?? ''),
    ]),
  )
}

/**
 * Closed production Vite configuration. Do not merge arbitrary user config or
 * plugins into this object: it is the public artifact admission boundary.
 */
export function publicProductionViteConfig(
  spec: PublicFrontendBuildSpec,
  quarantine: string,
  environment: NodeJS.ProcessEnv = process.env,
): InlineConfig {
  return {
    root: spec.root,
    base: spec.base,
    configFile: false,
    mode: 'production',
    envDir: false,
    envPrefix: [],
    define: publicBuildDefines(spec, environment),
    publicDir: false,
    css: { postcss: { plugins: [] } },
    plugins: [],
    build: {
      write: false,
      outDir: quarantine,
      emptyOutDir: false,
      assetsInlineLimit: 0,
      sourcemap: false,
      rollupOptions: { input: spec.entry },
    },
  }
}
