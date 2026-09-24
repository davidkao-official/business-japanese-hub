/** Private-source release preparation for bounded Workplace Learn content. */
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import type { WorkplaceLearnRuntimeItem } from '../workplace-learn/types'
import { projectWorkplaceLearnRuntimeItem, validateWorkplaceLearnItem } from '../workplace-learn/validate'
import { isPrivateContentId } from './references'

export const MAX_PRIVATE_WORKPLACE_LEARN_PAYLOAD_BYTES = 32 * 1024

export type PrivateWorkplaceLearnPayload = { workplaceLearn: WorkplaceLearnRuntimeItem }
export type PrivateWorkplaceLearnRelease = {
  schemaVersion: 1
  contentId: string
  revision: string
  contentKind: 'workplace-lesson' | 'workplace-vocabulary'
  accessScope: 'member'
  payload: PrivateWorkplaceLearnPayload
}
export type PrivateWorkplaceLearnPreparation =
  | { ok: true; value: PrivateWorkplaceLearnRelease }
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

/** Projects reviewed private Plus authoring into an immutable member envelope. */
export function preparePrivateWorkplaceLearnRelease(contentId: string, raw: unknown): PrivateWorkplaceLearnPreparation {
  if (!isPrivateContentId(contentId)) return { ok: false, reason: 'Workplace Learn id is not compatible with the server delivery reference contract' }
  const validated = validateWorkplaceLearnItem(raw, { requireReleased: true })
  if (!validated.ok) return { ok: false, reason: `invalid Workplace Learn item: ${validated.issues[0]?.path ?? 'unknown field'} ${validated.issues[0]?.message ?? 'unknown error'}` }
  if (validated.value.id !== contentId) return { ok: false, reason: 'Workplace Learn id does not match the requested server delivery reference' }
  if (validated.value.access !== 'plus') return { ok: false, reason: 'private Workplace Learn import currently accepts Plus items only' }
  if (validated.value.sampleLabel !== undefined) return { ok: false, reason: 'public teaching fixtures cannot be imported as private Workplace Learn content' }

  const runtime = projectWorkplaceLearnRuntimeItem(validated.value)
  const payload: PrivateWorkplaceLearnPayload = { workplaceLearn: runtime }
  if (hasExponentNumber(payload)) return { ok: false, reason: 'Workplace Learn payload cannot contain exponent-form numbers in server-delivered payloads' }
  if (hasPostgresIncompatibleString(payload)) return { ok: false, reason: 'Workplace Learn payload contains strings incompatible with PostgreSQL jsonb' }
  const serializedPayload = JSON.stringify(payload)
  if (Buffer.byteLength(serializedPayload, 'utf8') > MAX_PRIVATE_WORKPLACE_LEARN_PAYLOAD_BYTES) {
    return { ok: false, reason: 'Workplace Learn payload exceeds the server delivery size limit' }
  }
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      contentId,
      revision: createHash('sha256').update(serializedPayload).digest('hex'),
      contentKind: runtime.kind === 'lesson' ? 'workplace-lesson' : 'workplace-vocabulary',
      accessScope: 'member',
      payload,
    },
  }
}
