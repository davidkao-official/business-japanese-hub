/** Private-source release preparation for the bounded Practice/Web Test bank. */
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import type { PrivatePracticeQuestionBankSource } from '../practice-web-test/contract'
import { validatePracticeQuestionBankSource } from '../practice-web-test/validate'
import { isPrivateContentId } from './references'

export const MAX_PRIVATE_PRACTICE_QUESTION_BANK_PAYLOAD_BYTES = 512 * 1024

export type PrivatePracticeQuestionBankRelease = {
  schemaVersion: 1
  contentId: string
  revision: string
  contentKind: 'practice-question-bank'
  accessScope: 'member'
  payload: PrivatePracticeQuestionBankSource
}

export type PrivatePracticeQuestionBankPreparation =
  | { ok: true; value: PrivatePracticeQuestionBankRelease }
  | { ok: false; reason: string }

function hasExponentNumber(value: unknown): boolean {
  if (typeof value === 'number') return JSON.stringify(value).includes('e')
  if (Array.isArray(value)) return value.some(hasExponentNumber)
  if (typeof value !== 'object' || value === null) return false
  return Object.values(value).some(hasExponentNumber)
}

function hasPostgresIncompatibleString(value: unknown): boolean {
  if (typeof value === 'string') {
    if (value.includes('\u0000')) return true
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index)
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(index + 1)
        if (!(next >= 0xdc00 && next <= 0xdfff)) return true
        index += 1
      } else if (code >= 0xdc00 && code <= 0xdfff) return true
    }
    return false
  }
  if (Array.isArray(value)) return value.some(hasPostgresIncompatibleString)
  if (typeof value !== 'object' || value === null) return false
  return Object.entries(value).some(([key, entry]) => hasPostgresIncompatibleString(key) || hasPostgresIncompatibleString(entry))
}

/**
 * Produces the immutable server payload without writing it into the public
 * checkout, `content-dist`, or a browser module graph.
 */
export function preparePrivatePracticeQuestionBankRelease(
  contentId: string,
  raw: unknown,
): PrivatePracticeQuestionBankPreparation {
  if (!isPrivateContentId(contentId)) return { ok: false, reason: 'practice question bank id is not compatible with the server delivery reference contract' }
  const validated = validatePracticeQuestionBankSource(raw, { requireReleased: true })
  if (!validated.ok) return { ok: false, reason: `invalid practice question bank: ${validated.issues[0]?.message ?? 'unknown error'}` }
  if (hasExponentNumber(validated.value)) return { ok: false, reason: 'practice question bank cannot contain exponent-form numbers in server-delivered payloads' }
  if (hasPostgresIncompatibleString(validated.value)) return { ok: false, reason: 'practice question bank contains strings incompatible with PostgreSQL jsonb' }
  const serializedPayload = JSON.stringify(validated.value)
  if (Buffer.byteLength(serializedPayload, 'utf8') > MAX_PRIVATE_PRACTICE_QUESTION_BANK_PAYLOAD_BYTES) return { ok: false, reason: 'practice question bank payload exceeds the server delivery size limit' }
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      contentId,
      revision: createHash('sha256').update(serializedPayload).digest('hex'),
      contentKind: 'practice-question-bank',
      accessScope: 'member',
      payload: validated.value,
    },
  }
}
