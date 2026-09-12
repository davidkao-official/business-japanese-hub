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
  scoreQuestion,
  selectableQuestions,
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
  family: string
  domain: 'verbal' | 'nonverbal'
  category: string
  mode: string
  questionId: string
  questionVersion: number
  response: RunnerResponse
  clientAttemptId: string
  responseMs: number
  checkpoints?: Array<{ id: string; response: RunnerResponse }>
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
    'contentId', 'revision', 'family', 'domain', 'category', 'mode',
    'questionId', 'questionVersion', 'response', 'clientAttemptId', 'responseMs', 'checkpoints',
  ].filter((key) => raw?.[key] !== undefined))) return null
  const required = ['contentId', 'revision', 'family', 'domain', 'category', 'mode', 'questionId', 'questionVersion', 'response', 'clientAttemptId', 'responseMs']
  if (Object.keys(raw).some((key) => !required.includes(key) && key !== 'checkpoints')) return null
  if (!boundedId(raw.contentId) || !REVISION.test(String(raw.revision)) || !boundedId(raw.family) ||
    !boundedId(raw.category) || !boundedId(raw.mode) || !boundedId(raw.questionId) ||
    !positiveVersion(raw.questionVersion) || (raw.domain !== 'verbal' && raw.domain !== 'nonverbal') ||
    typeof raw.clientAttemptId !== 'string' || !UUID.test(raw.clientAttemptId) ||
    !Number.isSafeInteger(raw.responseMs) || (raw.responseMs as number) < 0 || (raw.responseMs as number) > 3600000 ||
    !response(raw.response)) return null
  if (raw.checkpoints !== undefined) {
    if (!Array.isArray(raw.checkpoints) || raw.checkpoints.length > MAX_ARRAY) return null
    if (raw.checkpoints.some((entry) => !record(entry) || !exactKeys(entry, ['id', 'response']) || !boundedId(entry.id) || !response(entry.response))) return null
  }
  return {
    contentId: raw.contentId,
    revision: raw.revision,
    family: raw.family,
    domain: raw.domain,
    category: raw.category,
    mode: raw.mode,
    questionId: raw.questionId,
    questionVersion: raw.questionVersion,
    response: raw.response,
    clientAttemptId: raw.clientAttemptId,
    responseMs: raw.responseMs,
    ...(raw.checkpoints === undefined ? {} : { checkpoints: raw.checkpoints as AttemptInput['checkpoints'] }),
  }
}

function safeCheckpointResults(input: AttemptInput, payload: PracticeRuntimePayload, question: RuntimeQuestion): Array<{ id: string; correct: boolean }> | null {
  const checkpoints = resolveQuestionCheckpoints(payload, question)
  if (checkpoints === null) return null
  const submitted = input.checkpoints ?? []
  if (submitted.length === 0) return []
  if (submitted.length !== checkpoints.length) return null
  const byId = new Map(submitted.map((entry) => [entry.id, entry.response]))
  if (byId.size !== submitted.length || checkpoints.some((checkpoint) => !byId.has(checkpoint.id))) return null
  return checkpoints.map((checkpoint) => ({ id: checkpoint.id, correct: scoreQuestion(checkpoint, byId.get(checkpoint.id)!) }))
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
  const selected = selectableQuestions(payload, input.family, input.domain, input.category, input.mode)
    .find((question) => question.id === input.questionId && question.version === input.questionVersion)
  if (!selected) return badRequest('invalid question selection')
  if (!response(input.response)) return badRequest('invalid response')
  const checkpointResults = safeCheckpointResults(input, payload, selected)
  if (checkpointResults === null) return badRequest('invalid checkpoint responses')
  const correct = scoreQuestion(selected, input.response)
  const score = correct ? 1 : 0
  const { data, error } = await deps.db.rpc('record_practice_attempt', {
    p_user_id: uid,
    p_client_attempt_id: input.clientAttemptId,
    p_content_id: release.contentId,
    p_content_revision: release.revision,
    p_question_id: selected.id,
    p_question_version: selected.version,
    p_test_family: input.family,
    p_domain: input.domain,
    p_category: input.category,
    p_practice_mode: input.mode,
    p_submitted_answer: input.response,
    p_correct: correct,
    p_response_ms: input.responseMs,
    p_checkpoint_results: checkpointResults,
  })
  if (error || !record(data) || (data.kind !== 'persisted' && data.kind !== 'conflict')) return privateResult(jsonResult(502, { error: 'practice attempt persistence failed' }))
  return privateResult(jsonResult(200, {
    kind: data.kind,
    result: { correct, score, checkpointResults },
  }))
}
