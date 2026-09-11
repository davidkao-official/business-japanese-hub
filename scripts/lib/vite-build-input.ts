import { relative, resolve } from 'node:path'
import { resolveConfig } from 'vite'
import { viteBuildInputPaths } from './practice-content-boundary'

export type ViteAlias = { find: string | RegExp; replacement: string }
export type ViteBuildEntry = { path: string; viteRoot: string; configPath: string; aliases?: readonly ViteAlias[] }

type InputConfig = {
  input?: unknown
  build?: { rollupOptions?: { input?: unknown }; rolldownOptions?: { input?: unknown } }
}

function browserBuildInput(config: InputConfig & { environments?: { client?: InputConfig } }): unknown {
  const client = config.environments?.client
  // Vite 8 builds the resolved client environment. Mirror its input precedence
  // so legacy Rollup, current Rolldown, top-level, and client-environment
  // entries are all checked before falling back to index.html.
  return client?.build?.rolldownOptions?.input ??
    client?.build?.rollupOptions?.input ??
    config.build?.rolldownOptions?.input ??
    config.build?.rollupOptions?.input ??
    client?.input ??
    config.input
}

function browserAliases(config: { resolve?: { alias?: unknown } }): ViteAlias[] | null {
  const configuredAliases = config.resolve?.alias
  if (configuredAliases === undefined) return []
  if (!Array.isArray(configuredAliases)) {
    if (typeof configuredAliases !== 'object' || configuredAliases === null) return null
    if ('find' in configuredAliases || 'replacement' in configuredAliases) return null
    return Object.entries(configuredAliases).every(([, replacement]) => typeof replacement === 'string')
      ? Object.entries(configuredAliases).map(([find, replacement]) => ({ find, replacement: replacement as string }))
      : null
  }
  const aliases: ViteAlias[] = []
  for (const alias of configuredAliases) {
    if (
      typeof alias !== 'object' || alias === null || Array.isArray(alias) ||
      (typeof (alias as { find?: unknown }).find !== 'string' && !((alias as { find?: unknown }).find instanceof RegExp)) ||
      typeof (alias as { replacement?: unknown }).replacement !== 'string' ||
      (alias as { customResolver?: unknown }).customResolver !== undefined
    ) return null
    const resolvedAlias = alias as ViteAlias
    // Vite injects these internal regex aliases into every resolved config.
    // They do not represent an application source edge and are not relevant to
    // the public-content boundary.
    if (resolvedAlias.find instanceof RegExp && resolvedAlias.replacement.includes('/vite/dist/client/')) continue
    aliases.push(resolvedAlias)
  }
  return aliases
}

/** Resolves each real Vite config so configured Rollup browser roots cannot bypass HTML entry checks. */
export async function configuredViteBuildEntries(root: string, configPaths: readonly string[]): Promise<ViteBuildEntry[] | null> {
  const entries: ViteBuildEntry[] = []
  for (const configPath of configPaths) {
    const currentDirectory = process.cwd()
    try {
      // `loadConfigFromFile` intentionally stops before plugins' `config`
      // hooks. The boundary must inspect the same config Vite will build, so
      // a plugin cannot add a browser entry after this guard has run.
      // Vite resolves a config's relative `root` from its invoking directory.
      // The guard accepts an explicit repository root for its testable entry
      // point, so reproduce `vite build`'s working-directory behavior first.
      process.chdir(root)
      const config = await resolveConfig({ configFile: configPath }, 'build', 'production')
      const aliases = browserAliases(config)
      if (aliases === null) {
        console.error(`ERR  Vite config has an unsupported browser alias: ${relative(root, configPath)}`)
        return null
      }
      const configuredInput = browserBuildInput(config)
      const paths = viteBuildInputPaths(configuredInput)
      if (paths === null) {
        console.error(`ERR  Vite config has an unsupported browser build input: ${relative(root, configPath)}`)
        return null
      }
      const viteRoot = resolve(root, config.root ?? '.')
      for (const path of configuredInput === undefined ? ['index.html'] : paths) {
        entries.push({ path: resolve(viteRoot, path), viteRoot, configPath, ...(aliases.length === 0 ? {} : { aliases }) })
      }
    } catch {
      console.error(`ERR  cannot load Vite config for browser boundary: ${relative(root, configPath)}`)
      return null
    } finally {
      process.chdir(currentDirectory)
    }
  }
  return entries
}
