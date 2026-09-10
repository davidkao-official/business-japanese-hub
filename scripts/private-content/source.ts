import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { preparePrivateBookRelease } from '../../src/content-delivery/privateBook'
import type { PrivateBookRelease } from '../../src/content-delivery/privateBook'
import { repoRoot } from '../lib/books'

function outsidePublicRepository(path: string): boolean {
  const relationship = relative(repoRoot(), path)
  return relationship === '..' || relationship.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
}

export function privateSourceDirectory(argv: readonly string[]): string | null {
  const argument = argv.find((value) => value.startsWith('--source='))
  if (!argument) return null
  const source = resolve(argument.slice('--source='.length))
  return outsidePublicRepository(source) ? source : null
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown
}

/** Read and validate an external/private Book source without copying it into this repository. */
export function readPrivateBookSource(source: string): { ok: true; value: PrivateBookRelease } | { ok: false; reason: string } {
  const bookPath = resolve(source, 'book.json')
  const manifestPath = resolve(source, 'manifest.json')
  if (!existsSync(bookPath)) return { ok: false, reason: 'private source is missing book.json' }
  try {
    return preparePrivateBookRelease(readJson(bookPath), existsSync(manifestPath) ? readJson(manifestPath) : {})
  } catch {
    return { ok: false, reason: 'private source contains invalid JSON' }
  }
}
