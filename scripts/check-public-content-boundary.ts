/** CI guard for #132's forward-only content boundary. */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
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
    for (const entry of readdirSync(path).sort()) collectFiles(join(path, entry), root, files)
    return
  }
  if (!stat.isFile()) return
  files[relative(root, path)] = createHash('sha256').update(readFileSync(path)).digest('hex')
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
}
