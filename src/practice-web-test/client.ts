import type { PracticeRuntimePayload } from '../content-delivery/privatePracticeQuestionBank'
import { PRIVATE_CONTENT_REVISION, isPrivateContentId } from '../content-delivery/references'
import { tokenSubject } from '../lib/auth/tokenSubject'
import { validateRuntimePayload } from './runtime'
import type { RunnerResponse } from './runtime'

export type PracticeFetchResult =
  | { kind: 'ok'; payload: PracticeRuntimePayload }
  | { kind: 'signed-out' | 'forbidden' | 'unavailable' | 'missing' }

export type PracticeCheckpointAttempt = {
  checkpointId: string
  checkpointVersion: number
  response: RunnerResponse
}

/** The only browser-submitted shape for a durable Web Test attempt. */
export type PracticeAttemptInput = {
  contentId: string
  revision: string
  questionId: string
  questionVersion: number
  answer: RunnerResponse
  responseTimeMs: number
  clientIdempotencyKey: string
  checkpointResponses?: PracticeCheckpointAttempt[]
}

export type PracticeAttemptResult =
  | { kind: 'ok' }
  | { kind: 'signed-out' | 'forbidden' | 'unavailable' | 'missing' | 'stale' | 'invalid' | 'invalid-response-time' }

export const PRACTICE_ATTEMPT_TIMEOUT_MS = 10_000
export const MAX_PRACTICE_RESPONSE_TIME_MS = 3_600_000
const STALE_ATTEMPT_ERROR_CODE = 'PRACTICE_ATTEMPT_STALE'

function functionsBaseUrl(): string | null {
  const explicit = import.meta.env.VITE_EDGE_FUNCTIONS_BASE_URL as string | undefined
  const supabase = import.meta.env.VITE_SUPABASE_URL as string | undefined
  return (explicit || (supabase ? `${supabase.replace(/\/+$/, '')}/functions/v1` : '')).replace(/\/+$/, '') || null
}

class PracticeRequestTimeout extends Error {}

function requestDeadline(controller: AbortController): { promise: Promise<never>; cancel: () => void } {
  let timer: ReturnType<typeof globalThis.setTimeout>
  const promise = new Promise<never>((_, reject) => {
    timer = globalThis.setTimeout(() => {
      controller.abort()
      reject(new PracticeRequestTimeout())
    }, PRACTICE_ATTEMPT_TIMEOUT_MS)
  })
  return { promise, cancel: () => globalThis.clearTimeout(timer) }
}

export async function fetchPracticePayload(
  contentId: string,
  revision: string,
  getAccessToken: () => Promise<string | null>,
  expectedUserId: string,
): Promise<PracticeFetchResult> {
  if (!isPrivateContentId(contentId) || !PRIVATE_CONTENT_REVISION.test(revision)) return { kind: 'missing' }
  const controller = new AbortController()
  const deadline = requestDeadline(controller)
  try {
    const token = (await Promise.race([getAccessToken(), deadline.promise])) ?? undefined
    if (!token) return { kind: 'signed-out' }
    if (tokenSubject(token) !== expectedUserId) return { kind: 'unavailable' }
    const base = functionsBaseUrl()
    if (!base) return { kind: 'unavailable' }
    const response = await Promise.race([fetch(`${base}/content-delivery?contentId=${encodeURIComponent(contentId)}&revision=${revision}`, { cache: 'no-store', signal: controller.signal, headers: { Authorization: `Bearer ${token}` } }), deadline.promise])
    if (response.status === 401) return { kind: 'signed-out' }
    if (response.status === 403) return { kind: 'forbidden' }
    if (response.status === 404) return { kind: 'missing' }
    if (!response.ok) return { kind: 'unavailable' }
    const body = await Promise.race([response.json() as Promise<{ content?: { payload?: unknown } }>, deadline.promise])
    const payload = validateRuntimePayload(body.content?.payload)
    return payload ? { kind: 'ok', payload } : { kind: 'unavailable' }
  } catch {
    return { kind: 'unavailable' }
  } finally {
    deadline.cancel()
  }
}

export async function submitPracticeAttempt(
  input: PracticeAttemptInput,
  getAccessToken: () => Promise<string | null>,
  expectedUserId: string,
): Promise<PracticeAttemptResult> {
  if (!isPrivateContentId(input.contentId) || !PRIVATE_CONTENT_REVISION.test(input.revision)) return { kind: 'missing' }
  if (!Number.isSafeInteger(input.responseTimeMs) || input.responseTimeMs < 0 || input.responseTimeMs > MAX_PRACTICE_RESPONSE_TIME_MS) return { kind: 'invalid-response-time' }
  if (!Number.isInteger(input.questionVersion) || input.questionVersion < 1 || !input.clientIdempotencyKey) return { kind: 'unavailable' }
  const controller = new AbortController()
  const deadline = requestDeadline(controller)
  try {
    const token = (await Promise.race([getAccessToken(), deadline.promise])) ?? undefined
    if (!token) return { kind: 'signed-out' }
    if (tokenSubject(token) !== expectedUserId) return { kind: 'unavailable' }
    const base = functionsBaseUrl()
    if (!base) return { kind: 'unavailable' }
    // Build the wire body explicitly so an accidental caller-side field can
    // never cross the browser/server boundary.
    const wireBody = {
      contentId: input.contentId,
      revision: input.revision,
      questionId: input.questionId,
      questionVersion: input.questionVersion,
      answer: input.answer,
      responseTimeMs: input.responseTimeMs,
      clientIdempotencyKey: input.clientIdempotencyKey,
      ...(input.checkpointResponses === undefined ? {} : {
        checkpointResponses: input.checkpointResponses.map((checkpoint) => ({
          checkpointId: checkpoint.checkpointId,
          checkpointVersion: checkpoint.checkpointVersion,
          response: checkpoint.response,
        })),
      }),
    }
    const response = await Promise.race([fetch(`${base}/practice-attempts`, {
      method: 'POST',
      cache: 'no-store',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(wireBody),
    }), deadline.promise])
    if (response.status === 401) return { kind: 'signed-out' }
    if (response.status === 403) return { kind: 'forbidden' }
    if (response.status === 404) return { kind: 'missing' }
    if (response.status === 400) {
      try {
        const body = await Promise.race([response.json() as Promise<{ code?: unknown }>, deadline.promise])
        return body.code === STALE_ATTEMPT_ERROR_CODE ? { kind: 'stale' } : { kind: 'invalid' }
      } catch {
        return { kind: 'invalid' }
      }
    }
    if (response.status === 409) {
      const body = await Promise.race([response.json() as Promise<{ error?: unknown; replayable?: unknown }>, deadline.promise])
      return body.error === 'practice attempt already recorded' && body.replayable === true ? { kind: 'ok' } : { kind: 'unavailable' }
    }
    if (!response.ok) return { kind: 'unavailable' }
    const body = await Promise.race([response.json() as Promise<{ persisted?: unknown }>, deadline.promise])
    return body.persisted === true ? { kind: 'ok' } : { kind: 'unavailable' }
  } catch {
    return { kind: 'unavailable' }
  } finally {
    deadline.cancel()
  }
}
