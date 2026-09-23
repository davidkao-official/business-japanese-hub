import { tokenSubject } from '../lib/auth/tokenSubject'

export const READING_SAVES_TIMEOUT_MS = 10_000

const ITEM_ID = /^[A-Za-z0-9._:-]{1,128}$/
const REVISION = /^[a-f0-9]{64}$/
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

export type ReadingSave = { itemId: string; revision: string | null; savedAt: string }
export type ReadingSaveError = { kind: 'signed-out' | 'forbidden' | 'stale' | 'unavailable' }
export type ReadingSaveResult = { kind: 'ok'; save: ReadingSave | null } | ReadingSaveError
export type ReadingSaveMutationResult = { kind: 'ok' } | ReadingSaveError

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

function validSave(value: unknown, expectedItemId: string): ReadingSave | null {
  if (!record(value) || !hasExactKeys(value, ['itemId', 'revision', 'savedAt']) ||
    value.itemId !== expectedItemId ||
    !(value.revision === null || (typeof value.revision === 'string' && REVISION.test(value.revision))) ||
    typeof value.savedAt !== 'string' || !TIMESTAMP.test(value.savedAt) || !Number.isFinite(Date.parse(value.savedAt))) return null
  return { itemId: value.itemId, revision: value.revision, savedAt: value.savedAt }
}

function cancellation(controller: AbortController, signal?: AbortSignal): {
  promise: Promise<never>
  cancel: () => void
} {
  let rejectCancellation: (error: Error) => void = () => undefined
  const promise = new Promise<never>((_, reject) => { rejectCancellation = reject })
  const cancel = () => rejectCancellation(new Error('Reading save request cancelled'))
  const onExternalAbort = () => {
    controller.abort(signal?.reason)
    cancel()
  }
  controller.signal.addEventListener('abort', cancel, { once: true })
  signal?.addEventListener('abort', onExternalAbort, { once: true })
  if (signal?.aborted) onExternalAbort()
  const timer = globalThis.setTimeout(() => {
    controller.abort()
    cancel()
  }, READING_SAVES_TIMEOUT_MS)
  return {
    promise,
    cancel: () => {
      globalThis.clearTimeout(timer)
      controller.signal.removeEventListener('abort', cancel)
      signal?.removeEventListener('abort', onExternalAbort)
    },
  }
}

type ApiResponse =
  | { kind: 'response'; response: Response; timeout: Promise<never>; finish: () => void }
  | { kind: 'status'; status: 401 | 403 | 409 | 'unavailable' }

async function send(
  itemId: string,
  method: 'GET' | 'PUT' | 'DELETE',
  getAccessToken: () => Promise<string | null>,
  expectedUserId: string,
  signal?: AbortSignal,
  revision?: string | null,
): Promise<ApiResponse> {
  if (!ITEM_ID.test(itemId) || !expectedUserId || signal?.aborted) return { kind: 'status', status: 'unavailable' }
  const base = functionsBaseUrl()
  if (!base) return { kind: 'status', status: 'unavailable' }
  const controller = new AbortController()
  const timeout = cancellation(controller, signal)
  try {
    const token = await Promise.race([getAccessToken(), timeout.promise])
    if (!token) {
      timeout.cancel()
      return { kind: 'status', status: 401 }
    }
    if (tokenSubject(token) !== expectedUserId) {
      timeout.cancel()
      return { kind: 'status', status: 'unavailable' }
    }
    const url = `${base}/reading-saves${method === 'GET' ? `?itemId=${encodeURIComponent(itemId)}` : ''}`
    const body = method === 'PUT'
      ? JSON.stringify({ itemId, revision })
      : method === 'DELETE'
        ? JSON.stringify({ itemId })
        : undefined
    const response = await Promise.race([fetch(url, {
      method,
      cache: 'no-store',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body } : {}),
    }), timeout.promise])
    if (signal?.aborted) {
      timeout.cancel()
      return { kind: 'status', status: 'unavailable' }
    }
    if (response.status === 401 || response.status === 403 || response.status === 409) {
      timeout.cancel()
      return { kind: 'status', status: response.status }
    }
    if (!response.ok) {
      timeout.cancel()
      return { kind: 'status', status: 'unavailable' }
    }
    return { kind: 'response', response, timeout: timeout.promise, finish: timeout.cancel }
  } catch {
    timeout.cancel()
    return { kind: 'status', status: 'unavailable' }
  }
}

function resultForStatus(status: 401 | 403 | 409 | 'unavailable'): ReadingSaveError {
  if (status === 401) return { kind: 'signed-out' }
  if (status === 403) return { kind: 'forbidden' }
  if (status === 409) return { kind: 'stale' }
  return { kind: 'unavailable' }
}

/** Reads one owner's save by exact item ID, including saves outside the recent-list window. */
export async function fetchReadingSave(
  itemId: string,
  getAccessToken: () => Promise<string | null>,
  expectedUserId: string,
  signal?: AbortSignal,
): Promise<ReadingSaveResult> {
  const sent = await send(itemId, 'GET', getAccessToken, expectedUserId, signal)
  if (sent.kind === 'status') return resultForStatus(sent.status)
  try {
    const raw: unknown = await Promise.race([sent.response.json() as Promise<unknown>, sent.timeout])
    if (!record(raw) || !hasExactKeys(raw, ['items']) || !Array.isArray(raw.items) || raw.items.length > 1) return { kind: 'unavailable' }
    if (raw.items.length === 0) return { kind: 'ok', save: null }
    const save = validSave(raw.items[0], itemId)
    return save ? { kind: 'ok', save } : { kind: 'unavailable' }
  } catch {
    return { kind: 'unavailable' }
  } finally {
    sent.finish()
  }
}

/** Creates or updates the current published Reading preference; server remains authoritative. */
export async function saveReadingItem(
  itemId: string,
  revision: string | null,
  getAccessToken: () => Promise<string | null>,
  expectedUserId: string,
  signal?: AbortSignal,
): Promise<ReadingSaveMutationResult> {
  if (revision !== null && !REVISION.test(revision)) return { kind: 'stale' }
  const sent = await send(itemId, 'PUT', getAccessToken, expectedUserId, signal, revision)
  if (sent.kind === 'status') return resultForStatus(sent.status)
  try {
    const raw: unknown = await Promise.race([sent.response.json() as Promise<unknown>, sent.timeout])
    const save = validSave(raw, itemId)
    return save && save.revision === revision ? { kind: 'ok' } : { kind: 'unavailable' }
  } catch {
    return { kind: 'unavailable' }
  } finally {
    sent.finish()
  }
}

/** Removes by stable ID so a retired saved revision remains removable. */
export async function removeReadingSave(
  itemId: string,
  getAccessToken: () => Promise<string | null>,
  expectedUserId: string,
  signal?: AbortSignal,
): Promise<ReadingSaveMutationResult> {
  const sent = await send(itemId, 'DELETE', getAccessToken, expectedUserId, signal)
  if (sent.kind === 'status') return resultForStatus(sent.status)
  try {
    const raw: unknown = await Promise.race([sent.response.json() as Promise<unknown>, sent.timeout])
    if (!record(raw) || !hasExactKeys(raw, ['itemId', 'revision', 'serverTimestamp']) || raw.itemId !== itemId ||
      !(raw.revision === null || (typeof raw.revision === 'string' && REVISION.test(raw.revision))) ||
      typeof raw.serverTimestamp !== 'string' || !TIMESTAMP.test(raw.serverTimestamp) || !Number.isFinite(Date.parse(raw.serverTimestamp))) {
      return { kind: 'unavailable' }
    }
    return { kind: 'ok' }
  } catch {
    return { kind: 'unavailable' }
  } finally {
    sent.finish()
  }
}
