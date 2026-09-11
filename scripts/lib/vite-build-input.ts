import { relative, resolve } from 'node:path'
import { resolveConfig } from 'vite'
import { viteBuildInputPaths } from './practice-content-boundary'

export type ViteBuildEntry = { path: string; viteRoot: string; configPath: string }

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
      const configuredInput = browserBuildInput(config)
      const paths = viteBuildInputPaths(configuredInput)
      if (paths === null) {
        console.error(`ERR  Vite config has an unsupported browser build input: ${relative(root, configPath)}`)
        return null
      }
      const viteRoot = resolve(root, config.root ?? '.')
      for (const path of configuredInput === undefined ? ['index.html'] : paths) {
        entries.push({ path: resolve(viteRoot, path), viteRoot, configPath })
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
