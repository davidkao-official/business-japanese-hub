/**
 * Private-source Book release preparation.
 *
 * This is deliberately a delivery envelope, not a new all-product content
 * schema. `Book` remains owned by the Reader bounded context; future Practice
 * and Learn domains must bring their own validators before using the same
 * server-only release store.
 */
import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { derivePreview, type PreviewBoundary, type PreviewContent } from '../authoring/preview'
import type { Book } from '../content/types'
import { validateBook } from '../content/validate'
import { isPrivateContentId } from './references'

export interface PrivateBookManifest {
  preview?: { boundary?: PreviewBoundary }
}

export interface PrivateBookRelease {
  schemaVersion: 1
  contentId: string
  revision: string
  contentKind: 'book'
  accessScope: 'member'
  payload: {
    book: Book
    preview: PreviewContent
  }
}

// Conservatively below the database's 1 MiB jsonb-text limit. JSONB's
// canonical serialization can add structural whitespace, so preparation must
// leave room instead of accepting a payload the controlled import cannot store.
export const MAX_PRIVATE_BOOK_PAYLOAD_BYTES = 512 * 1024

export type PrivateBookPreparation =
  | { ok: true; value: PrivateBookRelease }
  | { ok: false; reason: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readBoundary(value: unknown): PreviewBoundary | null {
  if (!isRecord(value) || typeof value.chapterId !== 'string') return null
  if (value.kind === 'chapter') return { kind: 'chapter', chapterId: value.chapterId }
  if (value.kind === 'block' && typeof value.blockId === 'string') {
    return { kind: 'block', chapterId: value.chapterId, blockId: value.blockId }
  }
  return null
}

function hasUndeliverableAssets(book: Book): boolean {
  return Boolean(book.cover) || book.chapters.some((chapter) => chapter.blocks.some((block) => block.type === 'image'))
}

function hasExponentNumber(value: unknown): boolean {
  if (typeof value === 'number') return JSON.stringify(value).includes('e')
  if (Array.isArray(value)) return value.some(hasExponentNumber)
  if (!isRecord(value)) return false
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
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        return true
      }
    }
    return false
  }
  if (Array.isArray(value)) return value.some(hasPostgresIncompatibleString)
  if (!isRecord(value)) return false
  return Object.values(value).some(hasPostgresIncompatibleString)
}

/**
 * Validates a Book held outside this repository and prepares an immutable,
 * member-only server import. The full payload stays in process memory for the
 * caller; this module never writes it under `content-dist` or imports it into
 * a Vite module graph.
 */
export function preparePrivateBookRelease(
  rawBook: unknown,
  rawManifest: unknown,
): PrivateBookPreparation {
  const validated = validateBook(rawBook)
  if (!validated.ok) return { ok: false, reason: `invalid Book: ${validated.issues[0]?.message ?? 'unknown error'}` }
  if (validated.value.publication?.status !== 'published') {
    return { ok: false, reason: 'private Book must be explicitly published before server import' }
  }
  if (!isPrivateContentId(validated.value.id)) {
    return { ok: false, reason: 'private Book id is not compatible with the server delivery reference contract' }
  }
  if (hasUndeliverableAssets(validated.value)) {
    return { ok: false, reason: 'private Book assets require a server-authorized immutable asset adapter before import' }
  }
  // PostgreSQL jsonb canonicalizes exponent-form numbers to their expanded
  // decimal representation. Reject them so the measured JSON wire size remains
  // a conservative bound for the database payload-size constraint.
  if (hasExponentNumber(validated.value)) {
    return { ok: false, reason: 'private Book cannot contain exponent-form numbers in server-delivered payloads' }
  }
  if (hasPostgresIncompatibleString(validated.value)) {
    return { ok: false, reason: 'private Book contains strings incompatible with PostgreSQL jsonb' }
  }

  const manifest = isRecord(rawManifest) ? rawManifest : {}
  const boundary = readBoundary(isRecord(manifest.preview) ? manifest.preview.boundary : undefined)
  if (!boundary) return { ok: false, reason: 'private Book requires an explicit valid preview boundary' }

  const preview = derivePreview(validated.value, boundary)
  if (!preview.ok) return { ok: false, reason: `invalid preview boundary: ${preview.issues[0]?.message ?? 'unknown error'}` }
  if (!preview.value.isPartial) return { ok: false, reason: 'private member Book must retain a partial public preview' }

  // Private JSON delivery deliberately has no Vite-managed asset directory.
  // A future asset adapter must include its own bytes in the immutable revision
  // and apply the same server-side authorization before it is referenced.
  const payload = { book: validated.value, preview: preview.value }
  const serializedPayload = JSON.stringify(payload)
  if (Buffer.byteLength(serializedPayload, 'utf8') > MAX_PRIVATE_BOOK_PAYLOAD_BYTES) {
    return { ok: false, reason: 'private Book payload exceeds the server delivery size limit' }
  }
  const revision = createHash('sha256').update(serializedPayload).digest('hex')
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      contentId: validated.value.id,
      revision,
      contentKind: 'book',
      accessScope: 'member',
      payload,
    },
  }
}
