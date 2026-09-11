import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createBuildInfo, resolveBuildCommitSha, type DeploymentProduct } from './deployment-identity'
import { isPrivatePracticeAuthoringArtifact, stripViteSpecifierSuffix } from './practice-content-boundary'

const allowedVirtualModules = ['\0vite/', '\0rolldown/']
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
      throw new Error(`ERR  public build emitted an unprovenanced asset: ${output.fileName}`)
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
export function writeQuarantinedOutput(outputs: readonly PublicRollupOutput[], directory: string): string[] {
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
  return expected.sort()
}

interface LegacyInventory {
  schemaVersion?: unknown
  files?: unknown
}

function approvedPublicInventory(root: string): Record<string, string> {
  const policy = JSON.parse(readFileSync(join(root, '.content-boundary', 'legacy-books.json'), 'utf8')) as LegacyInventory
  if (policy.schemaVersion !== 2 || !policy.files || typeof policy.files !== 'object' || Array.isArray(policy.files)) {
    throw new Error('ERR  public build legacy inventory is invalid')
  }
  const entries = Object.entries(policy.files).filter(([path]) => path.startsWith('public/'))
  if (entries.length === 0 || entries.some(([path, digest]) => path.includes('..') || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest))) {
    throw new Error('ERR  public build legacy public inventory is invalid')
  }
  return Object.fromEntries(entries as Array<[string, string]>)
}

/** Stages only the SHA-pinned legacy public inventory after Vite disables publicDir. */
export function stageApprovedPublicFiles(root: string, directory: string): string[] {
  const staged: string[] = []
  for (const [path, digest] of Object.entries(approvedPublicInventory(root))) {
    const source = safePath(join(root, path), root)
    if (createHash('sha256').update(readFileSync(source)).digest('hex') !== digest) {
      throw new Error(`ERR  public build legacy asset digest changed: ${path}`)
    }
    const fileName = relative('public', path)
    const target = resolve(directory, fileName)
    if (!target.startsWith(`${resolve(directory)}${sep}`)) throw new Error('ERR  public build legacy asset path is unsafe')
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(source, target)
    staged.push(fileName)
  }
  return staged.sort()
}

function themeColors(root: string): { light: string; dark: string } {
  const css = readFileSync(safePath(join(root, 'src/styles/tokens.css'), root), 'utf8')
  const light = /:root\s*\{([^}]*)\}/.exec(css)?.[1]?.match(/--color-bg:\s*([^;]+);/)?.[1]?.trim()
  const dark = /:root\[data-theme='dark'\]\s*\{([^}]*)\}/.exec(css)?.[1]?.match(/--color-bg:\s*([^;]+);/)?.[1]?.trim()
  if (!light || !dark) throw new Error('ERR  public build cannot read canonical theme colors')
  return { light, dark }
}

/** Adds exact build metadata only after Rollup provenance has been validated. */
export function finalizePublicArtifact(root: string, directory: string, product: DeploymentProduct): string[] {
  const index = join(directory, 'index.html')
  if (!existsSync(index)) throw new Error('ERR  public build has no canonical index.html')
  const { light, dark } = themeColors(root)
  const info = createBuildInfo(product, resolveBuildCommitSha())
  const html = readFileSync(index, 'utf8')
    .replace(/\s*<meta\s+name="theme-color"[^>]*\/?>/gi, '')
    .replace(/\s*<meta\s+name="bjh-build"[^>]*\/?>/gi, '')
    .replace('</head>', `    <meta name="theme-color" media="(prefers-color-scheme: light)" content="${light}" />\n    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="${dark}" />\n    <meta name="bjh-build" content="${product}:${info.commitSha}" />\n  </head>`)
  if (!html.includes(`<meta name="bjh-build" content="${product}:${info.commitSha}" />`)) {
    throw new Error('ERR  public build cannot finalize canonical HTML identity')
  }
  writeFileSync(index, html)
  writeFileSync(join(directory, 'build-info.json'), `${JSON.stringify(info, null, 2)}\n`)
  writeFileSync(join(directory, '_headers'), buildInfoHeaders)
  return ['_headers', 'build-info.json']
}

/** Reject an unexpected disk write before the quarantined artifact is promoted. */
export function assertExactQuarantineFiles(directory: string, expected: readonly string[]): void {
  const actual: string[] = []
  files(directory, directory, actual)
  const sortedExpected = [...new Set(expected)].sort()
  if (actual.length !== sortedExpected.length || actual.some((file, index) => file !== sortedExpected[index])) {
    throw new Error('ERR  quarantined public build has an unexpected output file')
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
