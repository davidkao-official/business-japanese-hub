import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { preparePrivateWorkplaceLearnRelease, type PrivateWorkplaceLearnRelease } from '../../src/content-delivery/privateWorkplaceLearn'
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

export function privateWorkplaceSourceDirectory(argv: readonly string[]): string | null {
  const argument = argv.find((value) => value.startsWith('--source='))
  if (!argument) return null
  const suppliedPath = argument.slice('--source='.length)
  if (!isAbsolute(suppliedPath)) return null
  try {
    const source = realpathSync(resolve(suppliedPath))
    return statSync(source).isDirectory() && outsidePublicRepository(source) ? source : null
  } catch {
    return null
  }
}

export function privateWorkplaceContentId(argv: readonly string[]): string | null {
  const argument = argv.find((value) => value.startsWith('--content-id='))
  return argument?.slice('--content-id='.length) || null
}

/** Reads only the canonical external private artifact; diagnostics never include private text or paths. */
export function readPrivateWorkplaceSource(
  source: string,
  contentId: string,
): { ok: true; value: PrivateWorkplaceLearnRelease } | { ok: false; reason: string } {
  const path = resolve(source, 'workplace-item.json')
  if (!existsSync(path)) return { ok: false, reason: 'private source is missing workplace-item.json' }
  if (!outsidePublicRepository(path)) return { ok: false, reason: 'private Workplace Learn source resolves inside the public repository' }
  let raw: unknown
  try {
    const text = readFileSync(realpathSync(path), 'utf8').replace(/^\uFEFF/, '')
    raw = JSON.parse(text) as unknown
  } catch {
    return { ok: false, reason: 'private Workplace Learn source contains invalid JSON' }
  }
  return preparePrivateWorkplaceLearnRelease(contentId, raw)
}
