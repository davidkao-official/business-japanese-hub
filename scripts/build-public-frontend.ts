import { mkdtempSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build, type UserConfig } from 'vite'
import { careerGameViteConfig, libraryViteConfig } from './lib/public-frontend-config'
import {
  assertNoExternalDependencyProtocols,
  type PublicRollupOutput,
  promoteQuarantinedOutput,
  removeQuarantine,
  validatePublicBuildProvenance,
  writeQuarantinedOutput,
} from './lib/public-build-provenance'
import { repoRoot } from './lib/books'

const product = process.argv[2]
if (product !== 'library' && product !== 'career-game') {
  throw new Error('Usage: tsx scripts/build-public-frontend.ts <library|career-game>')
}

const root = repoRoot()
const config: UserConfig = product === 'library' ? libraryViteConfig() : careerGameViteConfig()
const outputDirectory = resolve(root, product === 'library' ? 'dist' : 'dist-career-game')
const viteRoot = resolve(root, config.root ?? '.')
const quarantine = mkdtempSync(join(root, `.quarantine-${product}-`))
const originalDirectory = process.cwd()

try {
  process.chdir(root)
  assertNoExternalDependencyProtocols(root)
  const result = await build({
    ...config,
    configFile: false,
    build: {
      ...config.build,
      assetsInlineLimit: 0,
      emptyOutDir: false,
      outDir: quarantine,
      write: false,
    },
  })
  const outputs = (Array.isArray(result) ? result : [result]).filter((output) => output !== undefined) as unknown as PublicRollupOutput[]
  if (outputs.length === 0) throw new Error('ERR  Vite public build returned no Rollup output')
  validatePublicBuildProvenance(outputs, root, viteRoot)
  writeQuarantinedOutput(outputs, quarantine)
  promoteQuarantinedOutput(quarantine, outputDirectory)
  console.log(`ok   ${product}: provenance-checked public build promoted`)
} finally {
  process.chdir(originalDirectory)
  removeQuarantine(quarantine)
}
