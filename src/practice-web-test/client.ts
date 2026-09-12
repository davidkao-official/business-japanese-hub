import type { PracticeRuntimePayload } from '../content-delivery/privatePracticeQuestionBank'
import { PRIVATE_CONTENT_REVISION, isPrivateContentId } from '../content-delivery/references'
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
  | { kind: 'signed-out' | 'forbidden' | 'unavailable' | 'missing' }

function functionsBaseUrl(): string | null {
  const explicit = import.meta.env.VITE_EDGE_FUNCTIONS_BASE_URL as string | undefined
  const supabase = import.meta.env.VITE_SUPABASE_URL as string | undefined
  return (explicit || (supabase ? `${supabase.replace(/\/+$/, '')}/functions/v1` : '')).replace(/\/+$/, '') || null
}

export async function fetchPracticePayload(
  contentId: string,
  revision: string,
  getAccessToken: () => Promise<string | null>,
): Promise<PracticeFetchResult> {
  if (!isPrivateContentId(contentId) || !PRIVATE_CONTENT_REVISION.test(revision)) return { kind: 'missing' }
  let token: string | undefined
  try {
    token = (await getAccessToken()) ?? undefined
  } catch {
    return { kind: 'unavailable' }
  }
  if (!token) return { kind: 'signed-out' }
  const base = functionsBaseUrl()
  if (!base) return { kind: 'unavailable' }
  try {
    const response = await fetch(`${base}/content-delivery?contentId=${encodeURIComponent(contentId)}&revision=${revision}`, { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } })
    if (response.status === 401) return { kind: 'signed-out' }
    if (response.status === 403) return { kind: 'forbidden' }
    if (response.status === 404) return { kind: 'missing' }
    if (!response.ok) return { kind: 'unavailable' }
    const body = await response.json() as { content?: { payload?: unknown } }
    const payload = validateRuntimePayload(body.content?.payload)
    return payload ? { kind: 'ok', payload } : { kind: 'unavailable' }
  } catch {
    return { kind: 'unavailable' }
  }
}

export async function submitPracticeAttempt(
  input: PracticeAttemptInput,
  getAccessToken: () => Promise<string | null>,
): Promise<PracticeAttemptResult> {
  if (!isPrivateContentId(input.contentId) || !PRIVATE_CONTENT_REVISION.test(input.revision)) return { kind: 'missing' }
  if (!Number.isInteger(input.questionVersion) || input.questionVersion < 1 || !Number.isFinite(input.responseTimeMs) || input.responseTimeMs < 0 || !input.clientIdempotencyKey) return { kind: 'unavailable' }
  let token: string | undefined
  try {
    token = (await getAccessToken()) ?? undefined
  } catch {
    return { kind: 'unavailable' }
  }
  if (!token) return { kind: 'signed-out' }
  const base = functionsBaseUrl()
  if (!base) return { kind: 'unavailable' }
  try {
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
    const response = await fetch(`${base}/practice-attempts`, {
      method: 'POST',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(wireBody),
    })
    if (response.status === 401) return { kind: 'signed-out' }
    if (response.status === 403) return { kind: 'forbidden' }
    if (response.status === 404) return { kind: 'missing' }
    if (!response.ok) return { kind: 'unavailable' }
    const body = await response.json() as { persisted?: unknown }
    return body.persisted === true ? { kind: 'ok' } : { kind: 'unavailable' }
  } catch {
    return { kind: 'unavailable' }
  }
}
