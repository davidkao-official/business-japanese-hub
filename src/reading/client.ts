import { PRIVATE_CONTENT_REVISION, isPrivateContentId } from '../content-delivery/references'
import { tokenSubject } from '../lib/auth/tokenSubject'
import type { ReadingCatalogEntry, ReadingRuntimeItem } from './types'
import { validateReadingRuntimeItem } from './validate'

export const READING_REQUEST_TIMEOUT_MS = 10_000

export type ReadingFetchResult =
  | { kind: 'ok'; item: ReadingRuntimeItem }
  | { kind: 'signed-out' | 'forbidden' | 'missing' | 'unavailable' }

function functionsBaseUrl(): string | null {
  const explicit = import.meta.env.VITE_EDGE_FUNCTIONS_BASE_URL as string | undefined
  const supabase = import.meta.env.VITE_SUPABASE_URL as string | undefined
  return (explicit || (supabase ? `${supabase.replace(/\/+$/, '')}/functions/v1` : '')).replace(/\/+$/, '') || null
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function catalogReferenceIsValid(entry: ReadingCatalogEntry): boolean {
  if (!record(entry)) return false
  const reference = entry.releaseReference
  return entry.access === 'plus'
    && typeof entry.id === 'string'
    && isPrivateContentId(entry.id)
    && typeof entry.slug === 'string'
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug)
    && reference !== undefined
    && record(reference)
    && hasExactKeys(reference, ['contentId', 'revision'])
    && typeof reference.contentId === 'string'
    && reference.contentId === entry.id
    && typeof reference.revision === 'string'
    && PRIVATE_CONTENT_REVISION.test(reference.revision)
}

function catalogMatchesItem(entry: ReadingCatalogEntry, item: ReadingRuntimeItem): boolean {
  if (entry.id !== item.id || entry.slug !== item.slug || entry.access !== item.access) return false
  if (entry.releasedAt !== item.releasedAt) return false
  if (!record(entry.source) || !record(entry.seo)) return false
  return entry.title === item.title
    && entry.summary === item.summary
    && entry.category === item.category
    && Array.isArray(entry.tags)
    && entry.tags.length === item.tags.length
    && entry.tags.every((tag, index) => tag === item.tags[index])
    && entry.source.type === item.source.type
    && entry.source.label === item.source.label
    && entry.source.url === item.source.url
    && entry.source.publishedAt === item.source.publishedAt
    && entry.seo.title === item.seo.title
    && entry.seo.description === item.seo.description
    && entry.sampleLabel === item.sampleLabel
}

function requestCancellation(controller: AbortController, signal?: AbortSignal): {
  promise: Promise<never>
  cancel: () => void
} {
  let timer: ReturnType<typeof globalThis.setTimeout>
  let rejectCancellation: (error: Error) => void = () => undefined
  const promise = new Promise<never>((_, reject) => { rejectCancellation = reject })
  const cancel = () => rejectCancellation(new Error('Reading request cancelled'))
  const onExternalAbort = () => {
    controller.abort(signal?.reason)
    cancel()
  }
  controller.signal.addEventListener('abort', cancel, { once: true })
  signal?.addEventListener('abort', onExternalAbort, { once: true })
  if (signal?.aborted) onExternalAbort()
  timer = globalThis.setTimeout(() => {
    controller.abort()
    cancel()
  }, READING_REQUEST_TIMEOUT_MS)
  return {
    promise,
    cancel: () => {
      globalThis.clearTimeout(timer)
      controller.signal.removeEventListener('abort', cancel)
      signal?.removeEventListener('abort', onExternalAbort)
    },
  }
}

function parseDeliveryResponse(raw: unknown, entry: ReadingCatalogEntry): ReadingRuntimeItem | null {
  if (!record(raw) || !hasExactKeys(raw, ['content'])) return null
  const content = raw.content
  if (!record(content) || !hasExactKeys(content, ['contentId', 'revision', 'contentKind', 'payload'])) return null
  const reference = entry.releaseReference
  if (!reference || content.contentKind !== 'reading' || content.contentId !== reference.contentId || content.revision !== reference.revision) return null
  if (!record(content.payload) || !hasExactKeys(content.payload, ['reading'])) return null
  const validated = validateReadingRuntimeItem(content.payload.reading)
  if (!validated.ok || validated.value.access !== 'plus' || !catalogMatchesItem(entry, validated.value)) return null
  return validated.value
}

/** Fetches a catalogued Plus Reading item through the existing server gate. */
export async function fetchReadingPayload(
  entry: ReadingCatalogEntry,
  getAccessToken: () => Promise<string | null>,
  expectedUserId: string,
  signal?: AbortSignal,
): Promise<ReadingFetchResult> {
  if (!catalogReferenceIsValid(entry)) return { kind: 'missing' }
  if (!expectedUserId || signal?.aborted) return { kind: 'unavailable' }

  const controller = new AbortController()
  const cancellation = requestCancellation(controller, signal)
  try {
    const token = await Promise.race([getAccessToken(), cancellation.promise])
    if (!token) return { kind: 'signed-out' }
    if (tokenSubject(token) !== expectedUserId) return { kind: 'unavailable' }
    const base = functionsBaseUrl()
    if (!base) return { kind: 'unavailable' }
    const reference = entry.releaseReference!
    const url = `${base}/content-delivery?contentId=${encodeURIComponent(reference.contentId)}&revision=${encodeURIComponent(reference.revision)}`
    const response = await Promise.race([fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}` },
    }), cancellation.promise])
    if (signal?.aborted) return { kind: 'unavailable' }
    if (response.status === 401) return { kind: 'signed-out' }
    if (response.status === 403) return { kind: 'forbidden' }
    if (response.status === 404) return { kind: 'missing' }
    if (!response.ok) return { kind: 'unavailable' }
    const body = await Promise.race([response.json() as Promise<unknown>, cancellation.promise])
    if (signal?.aborted) return { kind: 'unavailable' }
    const item = parseDeliveryResponse(body, entry)
    return item ? { kind: 'ok', item } : { kind: 'unavailable' }
  } catch {
    return { kind: 'unavailable' }
  } finally {
    cancellation.cancel()
  }
}
