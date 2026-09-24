import { PRIVATE_CONTENT_REVISION, isPrivateContentId } from '../content-delivery/references'
import { tokenSubject } from '../lib/auth/tokenSubject'
import { WORKPLACE_LEARN_CATEGORIES, type WorkplaceLearnCatalogEntry, type WorkplaceLearnRuntimeItem } from './types'
import { validateWorkplaceLearnRuntimeItem } from './validate'

export const WORKPLACE_LEARN_REQUEST_TIMEOUT_MS = 10_000

export type WorkplaceLearnFetchResult =
  | { kind: 'ok'; item: WorkplaceLearnRuntimeItem }
  | { kind: 'signed-out' | 'forbidden' | 'missing' | 'unavailable' }

function functionsBaseUrl(): string | null {
  const explicit = import.meta.env.VITE_EDGE_FUNCTIONS_BASE_URL as string | undefined
  const supabase = import.meta.env.VITE_SUPABASE_URL as string | undefined
  return (explicit || (supabase ? `${supabase.replace(/\/+$/, '')}/functions/v1` : '')).replace(/\/+$/, '') || null
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const keys = [...expected].sort()
  return actual.length === keys.length && actual.every((key, index) => key === keys[index])
}

function hasValidPlusReference(entry: WorkplaceLearnCatalogEntry): boolean {
  if (!record(entry)) return false
  if (typeof entry.id !== 'string' || typeof entry.slug !== 'string' || typeof entry.access !== 'string') return false
  if (!exactKeys(entry, ['schemaVersion', 'kind', 'id', 'slug', 'title', 'titleLanguage', 'lead', 'leadLanguage', 'category', 'tags', 'access', ...(entry.sampleLabel === undefined ? [] : ['sampleLabel']), 'releaseReference'])) return false
  if (entry.schemaVersion !== 1 || (entry.kind !== 'lesson' && entry.kind !== 'vocabulary')) return false
  if (!(WORKPLACE_LEARN_CATEGORIES as readonly unknown[]).includes(entry.category)) return false
  if (typeof entry.title !== 'string' || entry.title.trim().length === 0 || entry.title.length > 180) return false
  if (!['ja', 'zh-TW', 'zh-CN', 'en'].includes(entry.titleLanguage)) return false
  if (typeof entry.lead !== 'string' || entry.lead.trim().length === 0 || entry.lead.length > 360) return false
  if (!['ja', 'zh-TW', 'zh-CN', 'en'].includes(entry.leadLanguage)) return false
  if (!Array.isArray(entry.tags) || entry.tags.length > 12 || entry.tags.some((tag) => typeof tag !== 'string' || tag.length > 48 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag))) return false
  if (entry.sampleLabel !== undefined && entry.sampleLabel !== 'non-proprietary-teaching-sample') return false
  const reference = entry.releaseReference
  return entry.access === 'plus'
    && isPrivateContentId(entry.id)
    && entry.slug.length > 0
    && entry.slug.length <= 80
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug)
    && reference !== undefined
    && record(reference)
    && exactKeys(reference, ['contentId', 'revision'])
    && typeof reference.contentId === 'string'
    && reference.contentId === entry.id
    && typeof reference.revision === 'string'
    && PRIVATE_CONTENT_REVISION.test(reference.revision)
}

function matchesCatalog(entry: WorkplaceLearnCatalogEntry, item: WorkplaceLearnRuntimeItem): boolean {
  return item.id === entry.id
    && item.slug === entry.slug
    && item.kind === entry.kind
    && item.access === 'plus'
    && item.schemaVersion === entry.schemaVersion
    && item.title === entry.title
    && item.titleLanguage === entry.titleLanguage
    && item.lead === entry.lead
    && item.leadLanguage === entry.leadLanguage
    && item.category === entry.category
    && item.tags.length === entry.tags.length
    && item.tags.every((tag, index) => tag === entry.tags[index])
    && item.sampleLabel === entry.sampleLabel
}

function parseDelivery(raw: unknown, entry: WorkplaceLearnCatalogEntry): WorkplaceLearnRuntimeItem | null {
  if (!record(raw) || !exactKeys(raw, ['content'])) return null
  const content = raw.content
  if (!record(content) || !exactKeys(content, ['contentId', 'revision', 'contentKind', 'payload'])) return null
  const reference = entry.releaseReference
  const expectedKind = entry.kind === 'lesson' ? 'workplace-lesson' : 'workplace-vocabulary'
  if (!reference || content.contentId !== reference.contentId || content.revision !== reference.revision || content.contentKind !== expectedKind) return null
  if (!record(content.payload) || !exactKeys(content.payload, ['workplaceLearn'])) return null
  const validated = validateWorkplaceLearnRuntimeItem(content.payload.workplaceLearn)
  if (!validated.ok || !matchesCatalog(entry, validated.value)) return null
  return validated.value
}

function cancellation(controller: AbortController, signal?: AbortSignal) {
  let reject: (error: Error) => void = () => undefined
  const promise = new Promise<never>((_, fail) => { reject = fail })
  const cancel = () => reject(new Error('Workplace Learn request cancelled'))
  const onAbort = () => { controller.abort(signal?.reason); cancel() }
  controller.signal.addEventListener('abort', cancel, { once: true })
  signal?.addEventListener('abort', onAbort, { once: true })
  if (signal?.aborted) onAbort()
  const timer = globalThis.setTimeout(() => { controller.abort(); cancel() }, WORKPLACE_LEARN_REQUEST_TIMEOUT_MS)
  return {
    promise,
    cleanup: () => {
      globalThis.clearTimeout(timer)
      controller.signal.removeEventListener('abort', cancel)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

/** Load one catalogued Plus item through the existing member-authorized delivery endpoint. */
export async function fetchWorkplaceLearnPayload(
  entry: WorkplaceLearnCatalogEntry,
  getAccessToken: () => Promise<string | null>,
  expectedUserId: string,
  signal?: AbortSignal,
): Promise<WorkplaceLearnFetchResult> {
  if (!hasValidPlusReference(entry)) return { kind: 'missing' }
  if (!expectedUserId || signal?.aborted) return { kind: 'unavailable' }

  const controller = new AbortController()
  const pending = cancellation(controller, signal)
  try {
    const token = await Promise.race([getAccessToken(), pending.promise])
    if (!token) return { kind: 'signed-out' }
    if (tokenSubject(token) !== expectedUserId) return { kind: 'unavailable' }
    const base = functionsBaseUrl()
    if (!base) return { kind: 'unavailable' }
    const reference = entry.releaseReference!
    const url = `${base}/content-delivery?contentId=${encodeURIComponent(reference.contentId)}&revision=${encodeURIComponent(reference.revision)}`
    const response = await Promise.race([fetch(url, {
      method: 'GET', cache: 'no-store', signal: controller.signal,
      headers: { Authorization: `Bearer ${token}` },
    }), pending.promise])
    if (signal?.aborted) return { kind: 'unavailable' }
    if (response.status === 401) return { kind: 'signed-out' }
    if (response.status === 403) return { kind: 'forbidden' }
    if (response.status === 404) return { kind: 'missing' }
    if (!response.ok) return { kind: 'unavailable' }
    const body = await Promise.race([response.json() as Promise<unknown>, pending.promise])
    if (signal?.aborted) return { kind: 'unavailable' }
    const item = parseDelivery(body, entry)
    return item ? { kind: 'ok', item } : { kind: 'unavailable' }
  } catch {
    return { kind: 'unavailable' }
  } finally {
    pending.cleanup()
  }
}
