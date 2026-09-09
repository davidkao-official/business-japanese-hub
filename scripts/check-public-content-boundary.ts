/** CI guard for #132's forward-only content boundary. */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { contentDistRoot, repoRoot } from './lib/books'

interface LegacyBooksFile {
  schemaVersion?: unknown
  slugs?: unknown
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

const root = repoRoot()
const policy = JSON.parse(readFileSync(join(root, '.content-boundary', 'legacy-books.json'), 'utf8')) as LegacyBooksFile
const legacySlugs = policy.schemaVersion === 1 ? exactStrings(policy.slugs) : null

if (!legacySlugs) {
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
