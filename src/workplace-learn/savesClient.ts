import { tokenSubject } from '../lib/auth/tokenSubject'
import type { WorkplaceLearnKind } from './types'

export const WORKPLACE_SAVES_TIMEOUT_MS = 10_000
const ITEM_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/
const REVISION = /^[a-f0-9]{64}$/
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

export type WorkplaceSave = { itemId: string; kind: WorkplaceLearnKind; revision: string | null; savedAt: string; current: boolean }
export type WorkplaceSaveError = { kind: 'signed-out' | 'forbidden' | 'stale' | 'unavailable' }
export type WorkplaceSaveResult = { kind: 'ok'; save: WorkplaceSave | null } | WorkplaceSaveError
export type WorkplaceSavesResult = { kind: 'ok'; items: WorkplaceSave[] } | WorkplaceSaveError
export type WorkplaceSaveMutationResult = { kind: 'ok'; save?: WorkplaceSave } | WorkplaceSaveError

function functionsBaseUrl(): string | null {
  const explicit = import.meta.env.VITE_EDGE_FUNCTIONS_BASE_URL as string | undefined
  const supabase = import.meta.env.VITE_SUPABASE_URL as string | undefined
  return (explicit || (supabase ? `${supabase.replace(/\/+$/, '')}/functions/v1` : '')).replace(/\/+$/, '') || null
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}
function validSave(value: unknown, expectedItemId: string): WorkplaceSave | null {
  if (!record(value) || !exactKeys(value, ['itemId', 'kind', 'revision', 'savedAt', 'current']) ||
    !ITEM_ID.test(expectedItemId) || value.itemId !== expectedItemId ||
    (value.kind !== 'lesson' && value.kind !== 'vocabulary') ||
    !(value.revision === null || (typeof value.revision === 'string' && REVISION.test(value.revision))) ||
    typeof value.savedAt !== 'string' || !TIMESTAMP.test(value.savedAt) || !Number.isFinite(Date.parse(value.savedAt)) ||
    typeof value.current !== 'boolean') return null
  return { itemId: value.itemId, kind: value.kind, revision: value.revision, savedAt: value.savedAt, current: value.current }
}
function cancellation(controller: AbortController, signal?: AbortSignal) {
  let rejectCancellation: (error: Error) => void = () => undefined
  const promise = new Promise<never>((_, reject) => { rejectCancellation = reject })
  const cancel = () => rejectCancellation(new Error('Workplace save request cancelled'))
  const onExternalAbort = () => { controller.abort(signal?.reason); cancel() }
  controller.signal.addEventListener('abort', cancel, { once: true })
  signal?.addEventListener('abort', onExternalAbort, { once: true })
  if (signal?.aborted) onExternalAbort()
  const timer = globalThis.setTimeout(() => { controller.abort(); cancel() }, WORKPLACE_SAVES_TIMEOUT_MS)
  return {
    promise,
    cleanup: () => {
      globalThis.clearTimeout(timer)
      controller.signal.removeEventListener('abort', cancel)
      signal?.removeEventListener('abort', onExternalAbort)
    },
  }
}
type Sent =
  | { kind: 'response'; response: Response; timeout: Promise<never>; finish: () => void }
  | { kind: 'status'; status: 401 | 403 | 409 | 'unavailable' }

async function send(
  itemId: string | null,
  method: 'GET' | 'PUT' | 'DELETE',
  getAccessToken: () => Promise<string | null>,
  expectedUserId: string,
  signal?: AbortSignal,
  revision?: string | null,
): Promise<Sent> {
  if ((itemId !== null && !ITEM_ID.test(itemId)) || (method !== 'GET' && itemId === null) || !expectedUserId || signal?.aborted) return { kind: 'status', status: 'unavailable' }
  const base = functionsBaseUrl()
  if (!base) return { kind: 'status', status: 'unavailable' }
  const controller = new AbortController()
  const pending = cancellation(controller, signal)
  try {
    const token = await Promise.race([getAccessToken(), pending.promise])
    if (!token) { pending.cleanup(); return { kind: 'status', status: 401 } }
    if (tokenSubject(token) !== expectedUserId) { pending.cleanup(); return { kind: 'status', status: 'unavailable' } }
    const url = `${base}/workplace-saves${method === 'GET' && itemId !== null ? `?itemId=${encodeURIComponent(itemId)}` : ''}`
    const body = method === 'PUT'
      ? JSON.stringify({ itemId, revision })
      : method === 'DELETE' ? JSON.stringify({ itemId }) : undefined
    const response = await Promise.race([fetch(url, {
      method, cache: 'no-store', signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body } : {}),
    }), pending.promise])
    if (signal?.aborted) { pending.cleanup(); return { kind: 'status', status: 'unavailable' } }
    if (response.status === 401 || response.status === 403 || response.status === 409) {
      pending.cleanup()
      return { kind: 'status', status: response.status }
    }
    if (!response.ok) { pending.cleanup(); return { kind: 'status', status: 'unavailable' } }
    return { kind: 'response', response, timeout: pending.promise, finish: pending.cleanup }
  } catch {
    pending.cleanup()
    return { kind: 'status', status: 'unavailable' }
  }
}
function resultForStatus(status: 401 | 403 | 409 | 'unavailable'): WorkplaceSaveError {
  if (status === 401) return { kind: 'signed-out' }
  if (status === 403) return { kind: 'forbidden' }
  if (status === 409) return { kind: 'stale' }
  return { kind: 'unavailable' }
}

export async function fetchWorkplaceSave(
  itemId: string, getAccessToken: () => Promise<string | null>, expectedUserId: string, signal?: AbortSignal,
): Promise<WorkplaceSaveResult> {
  const sent = await send(itemId, 'GET', getAccessToken, expectedUserId, signal)
  if (sent.kind === 'status') return resultForStatus(sent.status)
  try {
    const raw: unknown = await Promise.race([sent.response.json() as Promise<unknown>, sent.timeout])
    if (!record(raw) || !exactKeys(raw, ['items']) || !Array.isArray(raw.items) || raw.items.length > 1) return { kind: 'unavailable' }
    if (!raw.items.length) return { kind: 'ok', save: null }
    const save = validSave(raw.items[0], itemId)
    return save ? { kind: 'ok', save } : { kind: 'unavailable' }
  } catch { return { kind: 'unavailable' } } finally { sent.finish() }
}

export async function fetchWorkplaceSaves(
  getAccessToken: () => Promise<string | null>, expectedUserId: string, signal?: AbortSignal,
): Promise<WorkplaceSavesResult> {
  const sent = await send(null, 'GET', getAccessToken, expectedUserId, signal)
  if (sent.kind === 'status') return resultForStatus(sent.status)
  try {
    const raw: unknown = await Promise.race([sent.response.json() as Promise<unknown>, sent.timeout])
    if (!record(raw) || !exactKeys(raw, ['items']) || !Array.isArray(raw.items) || raw.items.length > 50) return { kind: 'unavailable' }
    const items: WorkplaceSave[] = []
    const seen = new Set<string>()
    for (const value of raw.items) {
      if (!record(value) || typeof value.itemId !== 'string') return { kind: 'unavailable' }
      const save = validSave(value, value.itemId)
      if (!save || seen.has(save.itemId)) return { kind: 'unavailable' }
      seen.add(save.itemId)
      items.push(save)
    }
    return { kind: 'ok', items }
  } catch { return { kind: 'unavailable' } } finally { sent.finish() }
}

export async function saveWorkplaceItem(
  itemId: string, revision: string | null, getAccessToken: () => Promise<string | null>, expectedUserId: string, signal?: AbortSignal,
): Promise<WorkplaceSaveMutationResult> {
  if (revision !== null && !REVISION.test(revision)) return { kind: 'stale' }
  const sent = await send(itemId, 'PUT', getAccessToken, expectedUserId, signal, revision)
  if (sent.kind === 'status') return resultForStatus(sent.status)
  try {
    const raw: unknown = await Promise.race([sent.response.json() as Promise<unknown>, sent.timeout])
    const save = validSave(raw, itemId)
    return save && save.revision === revision && save.current ? { kind: 'ok', save } : { kind: 'unavailable' }
  } catch { return { kind: 'unavailable' } } finally { sent.finish() }
}

export async function removeWorkplaceSave(
  itemId: string, getAccessToken: () => Promise<string | null>, expectedUserId: string, signal?: AbortSignal,
): Promise<WorkplaceSaveMutationResult> {
  const sent = await send(itemId, 'DELETE', getAccessToken, expectedUserId, signal)
  if (sent.kind === 'status') return resultForStatus(sent.status)
  try {
    const raw: unknown = await Promise.race([sent.response.json() as Promise<unknown>, sent.timeout])
    if (!record(raw) || !exactKeys(raw, ['itemId', 'kind', 'revision', 'serverTimestamp']) || raw.itemId !== itemId ||
      !(raw.kind === null || raw.kind === 'lesson' || raw.kind === 'vocabulary') ||
      !(raw.revision === null || (typeof raw.revision === 'string' && REVISION.test(raw.revision))) ||
      typeof raw.serverTimestamp !== 'string' || !TIMESTAMP.test(raw.serverTimestamp) || !Number.isFinite(Date.parse(raw.serverTimestamp))) return { kind: 'unavailable' }
    return { kind: 'ok' }
  } catch { return { kind: 'unavailable' } } finally { sent.finish() }
}
