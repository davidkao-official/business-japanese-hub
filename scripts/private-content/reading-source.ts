import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { preparePrivateReadingRelease, type PrivateReadingRelease } from '../../src/content-delivery/privateReading'
import { repoRoot } from '../lib/books'

function isWithin(parent: string, candidate: string): boolean {
  const path = relative(parent, candidate)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

function outsidePublicRepository(path: string): boolean {
  try {
    const publicRoot = realpathSync(repoRoot())
    const resolved = realpathSync(path)
    return !isWithin(publicRoot, resolved)
  } catch {
    return false
  }
}

export function privateReadingSourceDirectory(argv: readonly string[]): string | null {
  const argument = argv.find((value) => value.startsWith('--source='))
  if (!argument) return null
  const suppliedPath = argument.slice('--source='.length)
  if (!isAbsolute(suppliedPath)) return null
  const source = resolve(suppliedPath)
  return outsidePublicRepository(source) ? realpathSync(source) : null
}

export function privateReadingContentId(argv: readonly string[]): string | null {
  const argument = argv.find((value) => value.startsWith('--content-id='))
  return argument?.slice('--content-id='.length) || null
}

/** Reads only an external private artifact and never logs Reading text or paths. */
export function readPrivateReadingSource(
  source: string,
  contentId: string,
): { ok: true; value: PrivateReadingRelease } | { ok: false; reason: string } {
  const path = resolve(source, 'reading-item.json')
  if (!existsSync(path)) return { ok: false, reason: 'private source is missing reading-item.json' }
  if (!outsidePublicRepository(path)) return { ok: false, reason: 'private Reading source resolves inside the public repository' }
  try {
    return preparePrivateReadingRelease(contentId, JSON.parse(readFileSync(realpathSync(path), 'utf8')) as unknown)
  } catch {
    return { ok: false, reason: 'private Reading source contains invalid JSON' }
  }
}
