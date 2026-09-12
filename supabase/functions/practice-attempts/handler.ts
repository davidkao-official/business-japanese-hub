import { authenticateBearer } from '../_shared/auth.ts'
import type { DbClient } from '../_shared/db.ts'
import {
  badRequest,
  forbidden,
  headerValue,
  jsonResult,
  methodNotAllowed,
  unauthorized,
  type HandlerRequest,
  type HandlerResult,
} from '../_shared/http.ts'
import {
  resolveQuestionCheckpoints,
  scoreAnswer,
  scoreQuestion,
  isBrowserSupportedQuestion,
  validateRuntimePayload,
  type RunnerResponse,
} from '../../../src/practice-web-test/runtime.ts'
import type { PracticeRuntimePayload } from '../../../src/content-delivery/privatePracticeQuestionBank.ts'
import type { RuntimeQuestion } from '../../../src/practice-web-test/runtime.ts'

export type MembershipAccess = 'active' | 'non-member' | 'unavailable'
export type ReleaseLookup =
  | { kind: 'found'; contentId: string; revision: string; contentKind: string; payload: Record<string, unknown> }
  | { kind: 'missing' }
  | { kind: 'unavailable' }

export interface PracticeAttemptsDeps {
  db: DbClient
  membershipAccessFor: (userId: string) => Promise<MembershipAccess>
  getRelease: (contentId: string, revision: string) => Promise<ReleaseLookup>
}

type AttemptInput = {
  contentId: string
  revision: string
  questionId: string
  questionVersion: number
  answer: RunnerResponse
  responseTimeMs: number
  clientIdempotencyKey: string
  checkpointResponses?: Array<{ checkpointId: string; checkpointVersion: number; response: RunnerResponse }>
}

const ID = /^[A-Za-z0-9._:-]{1,128}$/
const REVISION = /^[a-f0-9]{64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_BODY_BYTES = 32 * 1024
const MAX_ARRAY = 32

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function boundedId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value) && value.trim() === value
}

function positiveVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

function response(value: unknown): value is RunnerResponse {
  if (typeof value === 'string') return value.length <= 2000
  if (typeof value === 'number') return Number.isFinite(value)
  if (!Array.isArray(value) || value.length > MAX_ARRAY) return false
  return value.every((entry) => typeof entry === 'string' && entry.length <= 256)
}

function parseInput(bodyText: string): AttemptInput | null {
  if (new TextEncoder().encode(bodyText).byteLength > MAX_BODY_BYTES) return null
  let raw: unknown
  try { raw = JSON.parse(bodyText) } catch { return null }
  if (!record(raw) || !exactKeys(raw, [
    'contentId', 'revision', 'questionId', 'questionVersion', 'answer', 'responseTimeMs',
    'clientIdempotencyKey', 'checkpointResponses',
  ].filter((key) => raw[key] !== undefined))) return null
  const required = ['contentId', 'revision', 'questionId', 'questionVersion', 'answer', 'responseTimeMs', 'clientIdempotencyKey']
  if (Object.keys(raw).some((key) => !required.includes(key) && key !== 'checkpointResponses')) return null
  if (!boundedId(raw.contentId) || !REVISION.test(String(raw.revision)) || !boundedId(raw.questionId) ||
    !positiveVersion(raw.questionVersion) || typeof raw.clientIdempotencyKey !== 'string' ||
    !UUID.test(raw.clientIdempotencyKey) || !Number.isSafeInteger(raw.responseTimeMs) ||
    (raw.responseTimeMs as number) < 0 || (raw.responseTimeMs as number) > 3600000 || !response(raw.answer)) return null
  if (raw.checkpointResponses !== undefined) {
    if (!Array.isArray(raw.checkpointResponses) || raw.checkpointResponses.length > MAX_ARRAY) return null
    if (raw.checkpointResponses.some((entry) => !record(entry) || !exactKeys(entry, ['checkpointId', 'checkpointVersion', 'response']) ||
      !boundedId(entry.checkpointId) || !positiveVersion(entry.checkpointVersion) || !response(entry.response))) return null
  }
  return {
    contentId: raw.contentId,
    revision: raw.revision as string,
    questionId: raw.questionId,
    questionVersion: raw.questionVersion,
    answer: raw.answer,
    responseTimeMs: raw.responseTimeMs as number,
    clientIdempotencyKey: raw.clientIdempotencyKey,
    ...(raw.checkpointResponses === undefined ? {} : { checkpointResponses: raw.checkpointResponses as AttemptInput['checkpointResponses'] }),
  }
}

function safeCheckpointResults(input: AttemptInput, payload: PracticeRuntimePayload, question: RuntimeQuestion): Array<{ checkpointId: string; checkpointVersion: number; correct: boolean }> | null {
  const checkpoints = resolveQuestionCheckpoints(payload, question)
  if (checkpoints === null) return null
  const submitted = input.checkpointResponses ?? []
  if (submitted.length === 0) return []
  if (submitted.length !== checkpoints.length) return null
  if (submitted.some((entry, index) => entry.checkpointId !== checkpoints[index]?.id || entry.checkpointVersion !== checkpoints[index]?.version)) return null
  const byId = new Map(submitted.map((entry) => [entry.checkpointId, entry]))
  if (byId.size !== submitted.length || checkpoints.some((checkpoint) => {
    const entry = byId.get(checkpoint.id)
    return !entry || entry.checkpointVersion !== checkpoint.version
  })) return null
  return checkpoints.map((checkpoint) => {
    const entry = byId.get(checkpoint.id)!
    return { checkpointId: checkpoint.id, checkpointVersion: checkpoint.version, correct: scoreAnswer(checkpoint.answer, entry.response) }
  })
}

function privateResult(result: HandlerResult): HandlerResult {
  return { ...result, headers: { ...result.headers, 'Cache-Control': 'private, no-store' } }
}

export async function handlePracticeAttempts(req: HandlerRequest, deps: PracticeAttemptsDeps): Promise<HandlerResult> {
  if (req.method !== 'POST') return methodNotAllowed('POST')
  const input = parseInput(req.bodyText)
  if (!input) return badRequest('invalid request body')
  const uid = await authenticateBearer(deps.db, headerValue(req.headers, 'authorization'))
  if (!uid) return privateResult(unauthorized())
  const access = await deps.membershipAccessFor(uid)
  if (access === 'unavailable') return privateResult(jsonResult(503, { error: 'membership access unavailable' }))
  if (access !== 'active') return privateResult(forbidden('active membership required'))
  const release = await deps.getRelease(input.contentId, input.revision)
  if (release.kind === 'unavailable') return privateResult(jsonResult(503, { error: 'practice content unavailable' }))
  if (release.kind === 'missing' || release.contentKind !== 'practice-question-bank') return privateResult(jsonResult(404, { error: 'practice content not found' }))
  if (release.contentId !== input.contentId || release.revision !== input.revision) return privateResult(jsonResult(503, { error: 'practice content unavailable' }))
  const payload = validateRuntimePayload(release.payload)
  if (!payload || payload.questionBank.schemaVersion !== 1) return privateResult(jsonResult(503, { error: 'practice content unavailable' }))
  const candidates = payload.questionBank.questions.filter((question) => question.id === input.questionId)
  const latestVersion = Math.max(...candidates.map((question) => question.version), 0)
  const matching = candidates.filter((question) => question.version === input.questionVersion)
  const selected = matching.length === 1 && latestVersion === input.questionVersion &&
      matching[0].deliveryProfile === 'web' && isBrowserSupportedQuestion(matching[0])
    ? matching[0]
    : undefined
  if (!selected) return badRequest('invalid question selection')
  if (!response(input.answer)) return badRequest('invalid response')
  const checkpointResults = safeCheckpointResults(input, payload, selected)
  if (checkpointResults === null) return badRequest('invalid checkpoint responses')
  const correct = scoreQuestion(selected, input.answer)
  const { data, error } = await deps.db.rpc('record_practice_attempt', {
    p_user_id: uid,
    p_client_attempt_id: input.clientIdempotencyKey,
    p_content_id: release.contentId,
    p_content_revision: release.revision,
    p_question_id: selected.id,
    p_question_version: selected.version,
    p_test_family: selected.testFamily,
    p_domain: selected.domain,
    p_category: selected.category,
    p_practice_mode: selected.practiceProfile,
    p_submitted_answer: input.answer,
    p_correct: correct,
    p_response_ms: input.responseTimeMs,
    p_checkpoint_results: checkpointResults,
  })
  if (error || !record(data) || (data.kind !== 'persisted' && data.kind !== 'conflict')) return privateResult(jsonResult(502, { error: 'practice attempt persistence failed' }))
  if (data.kind !== 'persisted') return privateResult(jsonResult(409, { error: 'practice attempt already recorded' }))
  return privateResult(jsonResult(200, { persisted: true }))
}
