/** Private-source release preparation for the bounded Business Reading domain. */
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import type { ReadingRuntimeItem } from '../reading/types'
import { projectReadingRuntimeItem, validateReadingItem } from '../reading/validate'
import { isPrivateContentId } from './references'

export const MAX_PRIVATE_READING_PAYLOAD_BYTES = 512 * 1024

export type PrivateReadingPayload = { reading: ReadingRuntimeItem }
export type PrivateReadingRelease = {
  schemaVersion: 1
  contentId: string
  revision: string
  contentKind: 'reading'
  accessScope: 'member'
  payload: PrivateReadingPayload
}
export type PrivateReadingPreparation =
  | { ok: true; value: PrivateReadingRelease }
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

/** Projects reviewed private authoring into the member-only server envelope. */
export function preparePrivateReadingRelease(contentId: string, raw: unknown): PrivateReadingPreparation {
  if (!isPrivateContentId(contentId)) return { ok: false, reason: 'Reading id is not compatible with the server delivery reference contract' }
  const validated = validateReadingItem(raw, { requireReleased: true })
  if (!validated.ok) return { ok: false, reason: `invalid Reading item: ${validated.issues[0]?.path ?? 'unknown field'} ${validated.issues[0]?.message ?? 'unknown error'}` }
  if (validated.value.id !== contentId) return { ok: false, reason: 'Reading id does not match the requested server delivery reference' }
  if (validated.value.access !== 'plus') return { ok: false, reason: 'private Reading import currently accepts Plus items only' }

  const payload: PrivateReadingPayload = { reading: projectReadingRuntimeItem(validated.value) }
  if (hasExponentNumber(payload)) return { ok: false, reason: 'Reading payload cannot contain exponent-form numbers in server-delivered payloads' }
  if (hasPostgresIncompatibleString(payload)) return { ok: false, reason: 'Reading payload contains strings incompatible with PostgreSQL jsonb' }
  const serializedPayload = JSON.stringify(payload)
  if (Buffer.byteLength(serializedPayload, 'utf8') > MAX_PRIVATE_READING_PAYLOAD_BYTES) {
    return { ok: false, reason: 'Reading payload exceeds the server delivery size limit' }
  }
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      contentId,
      revision: createHash('sha256').update(serializedPayload).digest('hex'),
      contentKind: 'reading',
      accessScope: 'member',
      payload,
    },
  }
}
