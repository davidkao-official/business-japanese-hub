import { mkdtempSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build } from 'vite'
import {
  assertPublicBuildEnvironment,
  publicFrontendBuildSpec,
  publicProductionViteConfig,
  type PublicFrontendProduct,
} from './lib/public-frontend-build-spec'
import {
  assertExactQuarantineFiles,
  assertNoExternalDependencyProtocols,
  finalizePublicArtifact,
  type PublicRollupOutput,
  promoteQuarantinedOutput,
  removeQuarantine,
  stageApprovedPublicFiles,
  validatePublicBuildProvenance,
  writeQuarantinedOutput,
} from './lib/public-build-provenance'
import { repoRoot } from './lib/books'

const product = process.argv[2] as PublicFrontendProduct | undefined
if (product !== 'library' && product !== 'career-game') {
  throw new Error('Usage: tsx scripts/build-public-frontend.ts <library|career-game>')
}

const root = repoRoot()
const spec = publicFrontendBuildSpec(root, product)
const outputDirectory = resolve(root, product === 'library' ? 'dist' : 'dist-career-game')
const quarantine = mkdtempSync(join(root, `.quarantine-${product}-`))
const originalDirectory = process.cwd()

try {
  process.chdir(root)
  assertNoExternalDependencyProtocols(root)
  assertPublicBuildEnvironment()
  const result = await build(publicProductionViteConfig(spec, quarantine))
  const outputs = (Array.isArray(result) ? result : [result]).filter((output) => output !== undefined) as unknown as PublicRollupOutput[]
  if (outputs.length === 0) throw new Error('ERR  Vite public build returned no Rollup output')
  validatePublicBuildProvenance(outputs, root, spec.root)
  const outputFiles = writeQuarantinedOutput(outputs, quarantine)
  const legacyFiles = stageApprovedPublicFiles(root, quarantine)
  const generatedFiles = finalizePublicArtifact(root, quarantine, product)
  assertExactQuarantineFiles(quarantine, [...outputFiles, ...legacyFiles, ...generatedFiles])
  promoteQuarantinedOutput(quarantine, outputDirectory)
  console.log(`ok   ${product}: provenance-checked public build promoted`)
} finally {
  process.chdir(originalDirectory)
  removeQuarantine(quarantine)
}
