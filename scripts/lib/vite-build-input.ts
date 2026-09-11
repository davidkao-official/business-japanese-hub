import { relative, resolve } from 'node:path'
import { loadConfigFromFile } from 'vite'
import { viteBuildInputPaths } from './practice-content-boundary'

export type ViteBuildEntry = { path: string; viteRoot: string; configPath: string }

/** Loads each real Vite config so configured Rollup browser roots cannot bypass HTML entry checks. */
export async function configuredViteBuildEntries(root: string, configPaths: readonly string[]): Promise<ViteBuildEntry[] | null> {
  const entries: ViteBuildEntry[] = []
  for (const configPath of configPaths) {
    try {
      const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, configPath, root)
      if (!loaded) {
        console.error(`ERR  cannot load Vite config for browser boundary: ${relative(root, configPath)}`)
        return null
      }
      const config = loaded.config as { root?: unknown; build?: { rollupOptions?: { input?: unknown } } }
      if (config.root !== undefined && typeof config.root !== 'string') {
        console.error(`ERR  Vite config has an invalid root: ${relative(root, configPath)}`)
        return null
      }
      const paths = viteBuildInputPaths(config.build?.rollupOptions?.input)
      if (paths === null) {
        console.error(`ERR  Vite config has an unsupported build.rollupOptions.input: ${relative(root, configPath)}`)
        return null
      }
      const viteRoot = resolve(root, config.root ?? '.')
      for (const path of paths) entries.push({ path: resolve(viteRoot, path), viteRoot, configPath })
    } catch {
      console.error(`ERR  cannot load Vite config for browser boundary: ${relative(root, configPath)}`)
      return null
    }
  }
  return entries
}
