/** CI guard for #132's forward-only content boundary. */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contentDistRoot, repoRoot } from './lib/books'
import { hasFixtureHtmlEntryBypass, hasUnsafeBrowserModuleGraph } from './lib/browser-module-boundary'
import { isPrivatePracticeAuthoringArtifact } from './lib/practice-content-boundary'
import { configuredViteBuildEntries, isApprovedVitePublicDir, type ViteBuildEntry } from './lib/vite-build-input'

interface LegacyBooksFile {
  schemaVersion?: unknown
  slugs?: unknown
  files?: unknown
}

function directories(root: string): string[] {
  if (!existsSync(root)) return []
  return readdirSync(root).filter((entry) => statSync(join(root, entry)).isDirectory()).sort()
}

function exactStrings(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) return null
  const values = [...value]
  return new Set(values).size === values.length ? values.sort() : null
}

function same(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function expectedFiles(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null
  const files = Object.entries(value)
  if (files.length === 0 || files.some(([path, digest]) => path.startsWith('/') || !/^[a-f0-9]{64}$/.test(String(digest)))) return null
  return Object.fromEntries(files as Array<[string, string]>)
}

function collectFiles(path: string, root: string, files: Record<string, string>): void {
  if (!existsSync(path)) return
  const stat = statSync(path)
  if (stat.isDirectory()) {
    if (basename(path) === 'node_modules' || basename(path) === '.git') return
    for (const entry of readdirSync(path).sort()) collectFiles(join(path, entry), root, files)
    return
  }
  if (!stat.isFile()) return
  files[relative(root, path)] = createHash('sha256').update(readFileSync(path)).digest('hex')
}

function collectSourceFiles(path: string, files: string[]): void {
  if (!existsSync(path)) return
  const stat = statSync(path)
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path).sort()) collectSourceFiles(join(path, entry), files)
    return
  }
  if (stat.isFile() && /\.(?:ts|tsx)$/.test(path)) files.push(path)
}

function isFixturePath(path: string): boolean {
  return relative(root, path).split('/').includes('fixtures')
}

function sameFiles(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return same(leftKeys, rightKeys) && leftKeys.every((path) => left[path] === right[path])
}

const root = repoRoot()

function browserModuleContext(path: string, entries: readonly ViteBuildEntry[]): Pick<ViteBuildEntry, 'viteRoot' | 'aliases'> | null {
  const contexts = new Map<string, Pick<ViteBuildEntry, 'viteRoot' | 'aliases'>>()
  for (const entry of entries) contexts.set(entry.configPath, entry)
  return [...contexts.values()]
    .filter((context) => !relative(context.viteRoot, path).startsWith('..'))
    .sort((left, right) => right.viteRoot.length - left.viteRoot.length)[0] ?? null
}
export async function runPublicContentBoundary(): Promise<void> {
  const policy = JSON.parse(readFileSync(join(root, '.content-boundary', 'legacy-books.json'), 'utf8')) as LegacyBooksFile
  const legacySlugs = policy.schemaVersion === 2 ? exactStrings(policy.slugs) : null
  const legacyFiles = policy.schemaVersion === 2 ? expectedFiles(policy.files) : null

  if (!legacySlugs || !legacyFiles) {
    console.error('ERR  invalid legacy Book allowlist')
    process.exitCode = 1
  } else {
  const paths = [
    join(root, 'books'),
    join(contentDistRoot(), 'books'),
    join(contentDistRoot(), 'assets', 'books'),
    join(contentDistRoot(), 'assets', 'snapshots'),
  ]
  for (const path of paths) {
    if (!same(directories(path), legacySlugs)) {
      console.error(`ERR  static content path is not the disclosed legacy allowlist: ${path}`)
      process.exitCode = 1
    }
  }

  const actualFiles: Record<string, string> = {}
  for (const path of [
    join(root, 'books'),
    contentDistRoot(),
    join(root, 'public'),
  ]) {
    collectFiles(path, root, actualFiles)
  }
  if (!sameFiles(actualFiles, legacyFiles)) {
    console.error('ERR  static legacy inventory changed; do not route future content through books/content-dist/Vite')
    process.exitCode = 1
  }

  const catalog = readFileSync(join(root, 'src', 'reader', 'catalog.ts'), 'utf8')
  if (
    !catalog.includes("import.meta.glob('../../content-dist/books/*/current.json'") ||
    catalog.includes('private-content') ||
    catalog.includes('private_content_release')
  ) {
    console.error('ERR  Reader static catalog no longer has the approved legacy-only delivery boundary')
    process.exitCode = 1
  }

  if (existsSync(join(root, '.private-content'))) {
    console.error('ERR  private authoring checkout must live outside the public repository')
    process.exitCode = 1
  }

  const configuredEntries = await configuredViteBuildEntries(root, [join(root, 'vite.config.ts'), join(root, 'vite.career-game.config.ts')])
  if (configuredEntries === null) process.exitCode = 1

  // Vite copies `publicDir` straight into the public artifact without an
  // import edge. The only approved static public inventory is root/public,
  // which is checked above against the legacy allowlist. Reject another live
  // public directory before a config/plugin can copy private authoring files
  // from an external checkout into a Pages build.
  const publicDirs = new Map<string, string>()
  for (const entry of configuredEntries ?? []) {
    if (entry.publicDir !== undefined) publicDirs.set(entry.publicDir, entry.viteRoot)
  }
  for (const [publicDir, viteRoot] of publicDirs) {
    if (!isApprovedVitePublicDir(publicDir, root, viteRoot)) {
      console.error(`ERR  configured Vite publicDir is outside the approved static inventory: ${relative(root, publicDir)}`)
      process.exitCode = 1
    }
  }

  // #114 permits only deliberately tiny test fixtures. A production browser
  // module must never import one, because that would make public Git/Vite a
  // question-bank delivery path again. The external import commands below are
  // intentionally not part of `src`, so this scan does not block them.
  const sourceFiles: string[] = []
  collectSourceFiles(join(root, 'src'), sourceFiles)
  // Workspace packages are compiled into the same browser artifacts. Scan
  // their TypeScript sources too, so a bare workspace import cannot hide a
  // transitive fixture edge from the deployment boundary.
  collectSourceFiles(join(root, 'packages'), sourceFiles)
  collectSourceFiles(join(root, 'apps', 'career-game', 'src'), sourceFiles)
  for (const path of sourceFiles) {
    const relativePath = relative(root, path)
    if (relativePath.includes('/fixtures/') || /\.(?:test|contract)\.[tj]sx?$/.test(relativePath)) continue
    const context = browserModuleContext(path, configuredEntries ?? [])
    if (hasUnsafeBrowserModuleGraph(path, root, new Set(), context?.viteRoot ?? root, undefined, context?.aliases)) process.exitCode = 1
  }

  for (const entry of configuredEntries ?? []) {
    if (!existsSync(entry.path) || !statSync(entry.path).isFile()) {
      console.error(`ERR  configured Vite build input is not a local file: ${relative(root, entry.path)} (${relative(root, entry.configPath)})`)
      process.exitCode = 1
    } else if (isFixturePath(entry.path)) {
      console.error(`ERR  configured Vite build input is a public Practice fixture: ${relative(root, entry.path)}`)
      process.exitCode = 1
    } else if (extname(entry.path).toLowerCase() === '.html') {
      if (hasFixtureHtmlEntryBypass(entry.path, root, entry.viteRoot, entry.aliases)) process.exitCode = 1
    } else if (hasUnsafeBrowserModuleGraph(entry.path, root, new Set(), entry.viteRoot, undefined, entry.aliases)) process.exitCode = 1
  }

  const publicFiles: Record<string, string> = {}
  collectFiles(root, root, publicFiles)
  for (const path of Object.keys(publicFiles)) {
    const absolutePath = join(root, path)
    if (isPrivatePracticeAuthoringArtifact(absolutePath, readFileSync(absolutePath, 'utf8'))) {
      console.error(`ERR  private Practice authoring artifact found in public repository: ${path}`)
      process.exitCode = 1
    }
  }
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void runPublicContentBoundary().catch(() => {
    console.error('ERR  public-content boundary check failed before completion')
    process.exitCode = 1
  })
}
