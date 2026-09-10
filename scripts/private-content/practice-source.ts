import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { preparePrivatePracticeQuestionBankRelease, type PrivatePracticeQuestionBankRelease } from '../../src/content-delivery/privatePracticeQuestionBank'
import { repoRoot } from '../lib/books'

function outsidePublicRepository(path: string): boolean {
  const relationship = relative(repoRoot(), path)
  return relationship === '..' || relationship.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
}

export function privatePracticeSourceDirectory(argv: readonly string[]): string | null {
  const argument = argv.find((value) => value.startsWith('--source='))
  if (!argument) return null
  const source = resolve(argument.slice('--source='.length))
  return outsidePublicRepository(source) ? source : null
}

export function privatePracticeContentId(argv: readonly string[]): string | null {
  const argument = argv.find((value) => value.startsWith('--content-id='))
  return argument?.slice('--content-id='.length) || null
}

/** Reads only an external/private artifact and never logs question bodies. */
export function readPrivatePracticeQuestionBankSource(
  source: string,
  contentId: string,
): { ok: true; value: PrivatePracticeQuestionBankRelease } | { ok: false; reason: string } {
  const path = resolve(source, 'practice-question-bank.json')
  if (!existsSync(path)) return { ok: false, reason: 'private source is missing practice-question-bank.json' }
  try {
    return preparePrivatePracticeQuestionBankRelease(contentId, JSON.parse(readFileSync(path, 'utf8')) as unknown)
  } catch {
    return { ok: false, reason: 'private practice source contains invalid JSON' }
  }
}
