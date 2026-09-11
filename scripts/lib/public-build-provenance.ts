import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parseBuildInfo } from './deployment-identity'
import { isPrivatePracticeAuthoringArtifact, stripViteSpecifierSuffix } from './practice-content-boundary'

const allowedVirtualModules = ['\0vite/', '\0rolldown/']
const generatedAssets = new Set(['_headers', 'build-info.json'])
const forbiddenDependencyProtocol = /^(?:file:|link:|portal:)/
const buildInfoHeaders = '/build-info.json\n  Cache-Control: no-store\n'

export type PublicOutput = {
  fileName: string
} & ({ type: 'chunk'; moduleIds: string[]; code: string } | { type: 'asset'; originalFileNames: string[]; source: string | Uint8Array })

export interface PublicRollupOutput {
  output: PublicOutput[]
}

function isInside(root: string, path: string): boolean {
  const pathFromRoot = relative(realpathSync(root), realpathSync(path))
  return pathFromRoot !== '' && !pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot)
}

function safePath(path: string, root: string): string {
  try {
    if (!isInside(root, path)) throw new Error('outside public repository')
    return realpathSync(path)
  } catch {
    throw new Error(`ERR  public build provenance is outside the repository: ${relative(root, path)}`)
  }
}

function isForbiddenSource(path: string): boolean {
  const normalized = path.split(sep).join('/')
  return /(?:^|\/)(?:fixtures|__tests__)(?:\/|$)/.test(normalized) ||
    /\.(?:test|spec|contract)\.[cm]?[jt]sx?$/.test(normalized)
}

function validateSourceFile(path: string, root: string): void {
  const canonical = safePath(path, root)
  if (isForbiddenSource(relative(root, canonical))) {
    throw new Error(`ERR  public build provenance reaches a fixture or test source: ${relative(root, canonical)}`)
  }
  if (/\.(?:json|csv)$/i.test(canonical) && isPrivatePracticeAuthoringArtifact(canonical, readFileSync(canonical, 'utf8'))) {
    throw new Error(`ERR  public build provenance reaches a private Practice authoring artifact: ${relative(root, canonical)}`)
  }
}

function validateModuleId(moduleId: string, root: string): void {
  if (moduleId.startsWith('\0')) {
    if (!allowedVirtualModules.some((prefix) => moduleId.startsWith(prefix))) {
      throw new Error('ERR  public build has an unsupported virtual module')
    }
    return
  }
  validateSourceFile(stripViteSpecifierSuffix(moduleId), root)
}

function validateAssetOrigin(origin: string, root: string, viteRoot: string): void {
  const candidate = isAbsolute(origin) ? origin : resolve(viteRoot, origin)
  validateSourceFile(candidate, root)
}

function validateOutputFileName(fileName: string): void {
  if (fileName.startsWith('/') || fileName.split('/').includes('..') || fileName === '') {
    throw new Error('ERR  public build emitted an unsafe output path')
  }
}

function generatedAssetText(output: Extract<PublicOutput, { type: 'asset' }>): string {
  return typeof output.source === 'string' ? output.source : new TextDecoder().decode(output.source)
}

function validateGeneratedAsset(output: Extract<PublicOutput, { type: 'asset' }>): void {
  const source = generatedAssetText(output)
  if (output.fileName === '_headers') {
    if (source !== buildInfoHeaders) throw new Error('ERR  public build emitted an invalid generated _headers asset')
    return
  }
  try {
    const parsed = JSON.parse(source) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
      !['schemaVersion', 'product', 'commitSha'].every((key) => key in parsed) ||
      Object.keys(parsed).length !== 3) {
      throw new Error('invalid shape')
    }
    parseBuildInfo(parsed)
  } catch {
    throw new Error('ERR  public build emitted an invalid generated build-info asset')
  }
}

function eachOutput(outputs: readonly PublicRollupOutput[]): Iterable<PublicOutput> {
  return outputs.flatMap((output) => output.output)
}

/** Verifies Vite/Rollup's actual resolved provenance before an artifact is promoted. */
export function validatePublicBuildProvenance(outputs: readonly PublicRollupOutput[], root: string, viteRoot: string): void {
  const fileNames = new Set<string>()
  for (const output of eachOutput(outputs)) {
    validateOutputFileName(output.fileName)
    if (fileNames.has(output.fileName)) throw new Error('ERR  public build emitted duplicate output paths')
    fileNames.add(output.fileName)
    if (output.type === 'chunk') {
      for (const moduleId of output.moduleIds) validateModuleId(moduleId, root)
      continue
    }
    if (output.originalFileNames.length === 0) {
      if (!generatedAssets.has(output.fileName)) {
        throw new Error(`ERR  public build emitted an unprovenanced asset: ${output.fileName}`)
      }
      validateGeneratedAsset(output)
      continue
    }
    for (const origin of output.originalFileNames) validateAssetOrigin(origin, root, viteRoot)
  }
}

function files(path: string, root: string, result: string[]): void {
  for (const entry of readdirSync(path).sort()) {
    const candidate = join(path, entry)
    if (statSync(candidate).isDirectory()) files(candidate, root, result)
    else if (statSync(candidate).isFile()) result.push(relative(root, candidate))
  }
}

/** Writes exactly the validated Rollup output into a quarantined artifact directory. */
export function writeQuarantinedOutput(outputs: readonly PublicRollupOutput[], directory: string): void {
  mkdirSync(directory, { recursive: true })
  const expected: string[] = []
  for (const output of eachOutput(outputs)) {
    const target = resolve(directory, output.fileName)
    if (!target.startsWith(`${resolve(directory)}${sep}`)) throw new Error('ERR  public build emitted an unsafe output path')
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, output.type === 'chunk' ? output.code : output.source)
    expected.push(output.fileName)
  }
  const actual: string[] = []
  files(directory, directory, actual)
  if (actual.length !== expected.length || actual.some((file, index) => file !== expected.sort()[index])) {
    throw new Error('ERR  quarantined public build output does not match Rollup provenance')
  }
}

/** Reject local dependency protocols before a sibling checkout can enter Vite through node_modules. */
export function assertNoExternalDependencyProtocols(root: string): void {
  const manifests = [join(root, 'package.json')]
  const packages = join(root, 'packages')
  if (existsSync(packages)) {
    for (const entry of readdirSync(packages).sort()) {
      const manifest = join(packages, entry, 'package.json')
      if (existsSync(manifest)) manifests.push(manifest)
    }
  }
  for (const manifest of manifests) {
    const packageJson = JSON.parse(readFileSync(manifest, 'utf8')) as Record<string, unknown>
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      const dependencies = packageJson[field]
      if (typeof dependencies !== 'object' || dependencies === null) continue
      for (const version of Object.values(dependencies)) {
        if (typeof version === 'string' && forbiddenDependencyProtocol.test(version)) {
          throw new Error(`ERR  public build manifest has an external dependency protocol: ${relative(root, manifest)}`)
        }
      }
    }
  }
}

/** Atomically replaces only the explicit build artifact after quarantine validation. */
export function promoteQuarantinedOutput(quarantine: string, outputDirectory: string): void {
  const output = resolve(outputDirectory)
  const backup = `${output}.previous-public-build`
  if (existsSync(backup)) rmSync(backup, { recursive: true, force: true })
  try {
    if (existsSync(output)) renameSync(output, backup)
    renameSync(quarantine, output)
    if (existsSync(backup)) rmSync(backup, { recursive: true, force: true })
  } catch (error) {
    if (!existsSync(output) && existsSync(backup)) renameSync(backup, output)
    throw error
  }
}

export function removeQuarantine(path: string): void {
  if (existsSync(path)) rmSync(path, { recursive: true, force: true })
}
