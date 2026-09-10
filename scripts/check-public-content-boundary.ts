/** CI guard for #132's forward-only content boundary. */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import * as ts from 'typescript'
import { contentDistRoot, repoRoot } from './lib/books'

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

function isFixtureSpecifier(specifier: string, sourcePath: string): boolean {
  if (specifier.includes('/fixtures/') || specifier.startsWith('./fixtures/') || specifier.startsWith('../fixtures/')) return true
  const resolved = join(sourcePath, '..', specifier)
  return resolved.includes('/src/practice-web-test/fixtures/')
}

function resolveLocalModule(specifier: string, sourcePath: string, viteRoot = root): string | null {
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return null
  const candidate = specifier.startsWith('/') ? resolve(viteRoot, `.${specifier}`) : resolve(dirname(sourcePath), specifier)
  const paths = extname(candidate) ? [candidate] : [candidate, ...['.ts', '.tsx', '.js', '.jsx'].map((extension) => `${candidate}${extension}`), ...['.ts', '.tsx', '.js', '.jsx'].map((extension) => join(candidate, `index${extension}`))]
  return paths.find((path) => existsSync(path) && statSync(path).isFile()) ?? null
}

function hasFixtureModuleGraphBypass(path: string, visited = new Set<string>(), viteRoot = root, sourceText?: string): boolean {
  if (visited.has(path)) return false
  visited.add(path)
  const source = ts.createSourceFile(path, sourceText ?? readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
  let unsafe = false
  const inspectSpecifier = (node: ts.Expression, label: string): void => {
    if (!ts.isStringLiteralLike(node)) {
      console.error(`ERR  production module has non-literal ${label}: ${relative(root, path)}`)
      unsafe = true
      return
    }
    if (isFixtureSpecifier(node.text, path)) {
      console.error(`ERR  production module imports a public Practice fixture: ${relative(root, path)}`)
      unsafe = true
    }
    const imported = resolveLocalModule(node.text, path, viteRoot)
    if (imported && hasFixtureModuleGraphBypass(imported, visited, viteRoot)) unsafe = true
  }
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier) inspectSpecifier(node.moduleSpecifier, 'import')
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) inspectSpecifier(node.moduleSpecifier, 'export-from')
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0]) inspectSpecifier(node.arguments[0], 'dynamic import')
      if (ts.isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments[0]) inspectSpecifier(node.arguments[0], 'require')
      if (ts.isPropertyAccessExpression(node.expression) && (node.expression.name.text === 'glob' || node.expression.name.text === 'globEager') && ts.isMetaProperty(node.expression.expression) && node.expression.expression.keywordToken === ts.SyntaxKind.ImportKeyword && node.arguments[0]) inspectSpecifier(node.arguments[0], 'import.meta.glob')
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return unsafe
}

function hasFixtureHtmlEntryBypass(path: string, viteRoot: string): boolean {
  const html = readFileSync(path, 'utf8')
  let unsafe = false
  const moduleScripts = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)
  for (const match of moduleScripts) {
    const attributes = match[1] ?? ''
    if (!/\btype\s*=\s*(['"])module\1/i.test(attributes)) continue
    const source = /\bsrc\s*=\s*(['"])(.*?)\1/i.exec(attributes)?.[2]
    if (source) {
      if (isFixtureSpecifier(source, path)) {
        console.error(`ERR  Vite HTML entry imports a public Practice fixture: ${relative(root, path)}`)
        unsafe = true
      }
      const imported = resolveLocalModule(source, path, viteRoot)
      if (imported && hasFixtureModuleGraphBypass(imported, new Set(), viteRoot)) unsafe = true
    } else if (hasFixtureModuleGraphBypass(path, new Set(), viteRoot, match[2] ?? '')) unsafe = true
  }
  return unsafe
}

function sameFiles(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return same(leftKeys, rightKeys) && leftKeys.every((path) => left[path] === right[path])
}

const root = repoRoot()
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
    if (hasFixtureModuleGraphBypass(path)) process.exitCode = 1
  }
  for (const [entry, viteRoot] of [[join(root, 'index.html'), root], [join(root, 'apps', 'career-game', 'index.html'), join(root, 'apps', 'career-game')]] as const) {
    if (hasFixtureHtmlEntryBypass(entry, viteRoot)) process.exitCode = 1
  }

  // A complete private artifact has a fixed filename. It belongs only outside
  // this checkout; fixtures are TypeScript-only and cannot be mistaken for an
  // importable production bank by the controlled server importer.
  const forbiddenArtifacts = ['practice-question-bank.json', 'practice-question-bank.csv', 'practice-question-bank-base.json', 'practice-questions.csv']
  const publicFiles: Record<string, string> = {}
  collectFiles(root, root, publicFiles)
  for (const path of Object.keys(publicFiles)) {
    if (forbiddenArtifacts.includes(path.split('/').at(-1) ?? '')) {
      console.error(`ERR  private Practice authoring artifact found in public repository: ${path}`)
      process.exitCode = 1
    }
  }
}
