import { describe, expect, it, vi } from 'vitest'
import { preparePrivatePracticeQuestionBankRelease } from '../../../src/content-delivery/privatePracticeQuestionBank.ts'
import { nonProprietaryPracticeQuestionBankFixture } from '../../../src/practice-web-test/fixtures/nonProprietaryPracticeFixture.ts'
import { handlePracticeAttempts } from './handler.ts'
import type { DbClient } from '../_shared/db.ts'

const userId = '10000000-0000-4000-8000-000000000001'
const clientAttemptId = '20000000-0000-4000-8000-000000000001'
const contentId = 'practice-web-test-fixture'
const release = preparePrivatePracticeQuestionBankRelease(contentId, nonProprietaryPracticeQuestionBankFixture)
if (!release.ok) throw new Error(release.reason)
const largeVersion = 2147483648
const largeVersionSource = JSON.parse(JSON.stringify(nonProprietaryPracticeQuestionBankFixture)) as typeof nonProprietaryPracticeQuestionBankFixture
largeVersionSource.questionBank.questions[0]!.version = largeVersion
largeVersionSource.supportOverlays![0]!.questionVersion = largeVersion
const largeVersionRelease = preparePrivatePracticeQuestionBankRelease(contentId, largeVersionSource)
if (!largeVersionRelease.ok) throw new Error(largeVersionRelease.reason)
const checkpointSource = JSON.parse(JSON.stringify(nonProprietaryPracticeQuestionBankFixture)) as typeof nonProprietaryPracticeQuestionBankFixture
checkpointSource.questionBank.questions[0]!.itemAnalysis.diagnosticCheckpoints = { registryVersion: 1, ids: ['fixture-checkpoint-01'] }
checkpointSource.checkpointRegistry = {
  version: 1,
  checkpoints: [{
    id: 'fixture-checkpoint-01', version: 1, questionId: 'fixture-choice-01', questionVersion: 1,
    dimension: 'meaning', promptJa: '選択肢の意味を確認してください。', answer: checkpointSource.questionBank.questions[0]!.answer,
    provenance: { authoredBy: 'fixture-author', reviewedBy: ['fixture-reviewer'], createdAt: '2026-09-10T00:00:00.000Z', updatedAt: '2026-09-10T00:00:00.000Z', originalContentAttestation: true },
  }],
}
const checkpointRelease = preparePrivatePracticeQuestionBankRelease(contentId, checkpointSource)
if (!checkpointRelease.ok) throw new Error(checkpointRelease.reason)
const multiSource = JSON.parse(JSON.stringify(nonProprietaryPracticeQuestionBankFixture)) as typeof nonProprietaryPracticeQuestionBankFixture
multiSource.questionBank.questions[0]!.id = 'fixture-multi-01'
multiSource.questionBank.questions[0]!.answer = {
  input: { kind: 'multi-select', choices: Array.from({ length: 33 }, (_, index) => ({ id: `choice-${index + 1}`, textJa: `選択肢${index + 1}` })) },
  expectedAnswer: { kind: 'multi-select', choiceIds: Array.from({ length: 33 }, (_, index) => `choice-${index + 1}`) }, scoring: { kind: 'exact-set' },
}
delete multiSource.supportOverlays
const multiRelease = preparePrivatePracticeQuestionBankRelease(contentId, multiSource)
if (!multiRelease.ok) throw new Error(multiRelease.reason)

function db(user: string | null, rpcData: unknown = { kind: 'persisted' }, rpcError: { message: string } | null = null): DbClient {
  return {
    from: vi.fn(),
    rpc: vi.fn().mockResolvedValue({ data: rpcData, error: rpcError }),
    auth: { getUser: vi.fn().mockResolvedValue(user ? { data: { user: { id: user } }, error: null } : { data: { user: null }, error: { message: 'invalid' } }) },
  } as unknown as DbClient
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST', url: 'https://example.test/practice-attempts', headers: { authorization: 'Bearer token' },
    bodyText: JSON.stringify({
      contentId, revision: release.value.revision, questionId: 'fixture-choice-01', questionVersion: 1,
      answer: 'two', responseTimeMs: 1200, clientIdempotencyKey: clientAttemptId, ...overrides,
    }),
  }
}

function deps(database: DbClient, membership: 'active' | 'non-member' | 'unavailable' = 'active', selectedRelease = release.value) {
  const questions = selectedRelease.payload.questionBank.questions
  return {
    db: database,
    membershipAccessFor: vi.fn().mockResolvedValue(membership),
    getRelease: vi.fn().mockResolvedValue({ kind: 'found', contentId, revision: selectedRelease.revision, contentKind: 'practice-question-bank', payload: selectedRelease.payload }),
    getQuestionAvailability: vi.fn().mockImplementation(async (_contentId: string, questionId: string) => ({ kind: 'found', revision: selectedRelease.revision, version: Math.max(...questions.filter((question) => question.id === questionId).map((question) => question.version)) })),
  }
}

describe('practice-attempts handler', () => {
  it('authenticates, scores from the exact released question, and persists only server-derived facts', async () => {
    const database = db(userId)
    const result = await handlePracticeAttempts(request(), deps(database))
    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toEqual({ persisted: true })
    expect(database.rpc).toHaveBeenCalledWith('record_practice_attempt', expect.objectContaining({
      p_user_id: userId, p_client_attempt_id: clientAttemptId, p_content_revision: release.value.revision,
      p_question_id: 'fixture-choice-01', p_question_version: 1, p_test_family: 'fixture', p_domain: 'verbal',
      p_category: 'fixture-category', p_practice_mode: 'untimed-learning', p_correct: true, p_response_ms: 1200,
    }))
  })

  it('passes a released safe-integer question version above PostgreSQL integer range to persistence', async () => {
    const database = db(userId)
    const result = await handlePracticeAttempts(request({ revision: largeVersionRelease.value.revision, questionVersion: largeVersion }), deps(database, 'active', largeVersionRelease.value))
    expect(result.status).toBe(200)
    expect(database.rpc).toHaveBeenCalledWith('record_practice_attempt', expect.objectContaining({
      p_question_id: 'fixture-choice-01', p_question_version: largeVersion,
    }))
  })

  it('rejects unauthenticated and non-member requests before release lookup', async () => {
    const missing = deps(db(null))
    expect((await handlePracticeAttempts(request(), missing)).status).toBe(401)
    expect(missing.getRelease).not.toHaveBeenCalled()
    const member = deps(db(userId), 'non-member')
    expect((await handlePracticeAttempts(request(), member)).status).toBe(403)
    expect(member.getRelease).not.toHaveBeenCalled()
  })

  it('fails closed for unknown or stale selection and never returns private content', async () => {
    const unknown = deps(db(userId))
    const result = await handlePracticeAttempts(request({ questionId: 'not-a-question' }), unknown)
    expect(result.status).toBe(400)
    expect(result.body).not.toContain('promptJa')
    expect(unknown.db.rpc).not.toHaveBeenCalled()
    const stale = deps(db(userId))
    stale.getRelease.mockResolvedValue({ kind: 'missing' })
    expect((await handlePracticeAttempts(request({ revision: 'b'.repeat(64) }), stale)).status).toBe(404)
  })

  it('rejects a question whose availability revision or version is stale before persistence', async () => {
    const staleRevision = deps(db(userId))
    staleRevision.getQuestionAvailability.mockResolvedValue({ kind: 'found', revision: 'b'.repeat(64), version: 1 })
    expect((await handlePracticeAttempts(request(), staleRevision)).status).toBe(400)
    const staleVersion = deps(db(userId))
    staleVersion.getQuestionAvailability.mockResolvedValue({ kind: 'found', revision: release.value.revision, version: 2 })
    expect((await handlePracticeAttempts(request(), staleVersion)).status).toBe(400)
    expect(staleVersion.db.rpc).not.toHaveBeenCalled()
  })

  it('rejects malformed and oversized learner input before persistence', async () => {
    const database = db(userId)
    const d = deps(database)
    expect((await handlePracticeAttempts(request({ answer: { correct: true } }), d)).status).toBe(400)
    expect((await handlePracticeAttempts(request({ answer: 'forged-choice-id' }), d)).status).toBe(400)
    expect((await handlePracticeAttempts(request({ responseTimeMs: -1 }), d)).status).toBe(400)
    expect((await handlePracticeAttempts(request({ clientIdempotencyKey: 'not-uuid' }), d)).status).toBe(400)
    expect((await handlePracticeAttempts(request({ family: 'forged' }), d)).status).toBe(400)
    expect((await handlePracticeAttempts(request({ correct: true }), d)).status).toBe(400)
    expect(database.rpc).not.toHaveBeenCalled()
  })

  it('surfaces a replayable idempotency conflict without exposing stored data', async () => {
    const d = deps(db(userId, { kind: 'conflict', replayable: true }))
    const result = await handlePracticeAttempts(request(), d)
    expect(result.status).toBe(409)
    expect(JSON.parse(result.body)).toEqual({ error: 'practice attempt already recorded', replayable: true })
    expect(result.body).not.toContain('promptJa')
  })

  it('keeps a changed-payload idempotency conflict fail closed', async () => {
    const d = deps(db(userId, { kind: 'conflict' }))
    const result = await handlePracticeAttempts(request({ answer: 'one' }), d)
    expect(result.status).toBe(409)
    expect(JSON.parse(result.body)).toEqual({ error: 'practice attempt conflict' })
    expect(result.body).not.toContain('promptJa')
  })

  it('rejects malformed or mismatched checkpoint versions', async () => {
    const database = db(userId)
    const d = deps(database)
    const checkpoint = { checkpointId: 'checkpoint-1', checkpointVersion: 1, response: 'two' }
    expect((await handlePracticeAttempts(request({ checkpointResponses: [checkpoint] }), d)).status).toBe(400)
    expect(database.rpc).not.toHaveBeenCalled()
  })

  it('rejects an empty multi-select answer before persistence', async () => {
    const database = db(userId)
    const d = deps(database, 'active', multiRelease.value)
    const result = await handlePracticeAttempts(request({ revision: multiRelease.value.revision, questionId: 'fixture-multi-01', answer: [] }), d)
    expect(result.status).toBe(400)
    expect(database.rpc).not.toHaveBeenCalled()
  })

  it('accepts a valid multi-select array larger than the old arbitrary cap', async () => {
    const database = db(userId)
    const d = deps(database, 'active', multiRelease.value)
    const answer = Array.from({ length: 33 }, (_, index) => `choice-${index + 1}`)
    const result = await handlePracticeAttempts(request({ revision: multiRelease.value.revision, questionId: 'fixture-multi-01', answer }), d)
    expect(result.status).toBe(200)
    expect(database.rpc).toHaveBeenCalledOnce()
  })

  it('rejects an oversized otherwise-shaped answer before persistence', async () => {
    const database = db(userId)
    const choices = Array.from({ length: 2046 }, (_, index) => ({ id: `c${index.toString().padStart(4, '0')}`, textJa: `選択肢${index}` }))
    const answer = choices.map((choice) => choice.id)
    const payload = structuredClone(multiRelease.value.payload)
    const question = payload.questionBank.questions[0]!
    question.answer = {
      input: { kind: 'multi-select', choices },
      expectedAnswer: { kind: 'multi-select', choiceIds: [choices[0]!.id] },
      scoring: { kind: 'exact-set' },
    }
    const compactBytes = new TextEncoder().encode(JSON.stringify(answer)).byteLength
    expect(compactBytes).toBeLessThan(16 * 1024)
    expect(compactBytes + answer.length - 1).toBeGreaterThan(16 * 1024)
    const result = await handlePracticeAttempts(
      request({ revision: multiRelease.value.revision, questionId: 'fixture-multi-01', answer }),
      deps(database, 'active', { ...multiRelease.value, payload }),
    )
    expect(result.status).toBe(400)
    expect(database.rpc).not.toHaveBeenCalled()
  })

  it('rejects derived checkpoint results over the database JSONB bound before persistence', async () => {
    const database = db(userId)
    const payload = structuredClone(checkpointRelease.value.payload)
    const question = payload.questionBank.questions[0]!
    const template = payload.checkpointRegistry!.checkpoints[0]!
    const checkpoints = Array.from({ length: 200 }, (_, index) => ({ ...template, id: `checkpoint-${index.toString().padStart(3, '0')}-${'x'.repeat(56)}` }))
    payload.checkpointRegistry = { ...payload.checkpointRegistry!, checkpoints }
    question.itemAnalysis = { ...question.itemAnalysis, diagnosticCheckpoints: { registryVersion: 1, ids: checkpoints.map((checkpoint) => checkpoint.id) } }
    const checkpointResponses = checkpoints.map((checkpoint) => ({ checkpointId: checkpoint.id, checkpointVersion: checkpoint.version, response: 'two' }))
    const result = await handlePracticeAttempts(
      request({ revision: checkpointRelease.value.revision, checkpointResponses }),
      deps(database, 'active', { ...checkpointRelease.value, payload }),
    )
    expect(result.status).toBe(400)
    expect(database.rpc).not.toHaveBeenCalled()
  })

  it('requires complete authored checkpoint evidence and accepts a valid full set', async () => {
    const omitted = deps(db(userId), 'active', checkpointRelease.value)
    expect((await handlePracticeAttempts(request({ revision: checkpointRelease.value.revision }), omitted)).status).toBe(400)
    const empty = deps(db(userId), 'active', checkpointRelease.value)
    expect((await handlePracticeAttempts(request({ revision: checkpointRelease.value.revision, checkpointResponses: [] }), empty)).status).toBe(400)
    const invalid = deps(db(userId), 'active', checkpointRelease.value)
    expect((await handlePracticeAttempts(request({ revision: checkpointRelease.value.revision, checkpointResponses: [{ checkpointId: 'wrong', checkpointVersion: 1, response: 'two' }] }), invalid)).status).toBe(400)
    const validDb = db(userId)
    const valid = deps(validDb, 'active', checkpointRelease.value)
    expect((await handlePracticeAttempts(request({ revision: checkpointRelease.value.revision, checkpointResponses: [{ checkpointId: 'fixture-checkpoint-01', checkpointVersion: 1, response: 'two' }] }), valid)).status).toBe(200)
    expect(validDb.rpc).toHaveBeenCalledWith('record_practice_attempt', expect.objectContaining({
      p_checkpoint_results: [{ checkpointId: 'fixture-checkpoint-01', checkpointVersion: 1, correct: true }],
    }))
  })

  it('does not treat a persistence error as a recorded attempt', async () => {
    const d = deps(db(userId, null, { message: 'db down' }))
    const result = await handlePracticeAttempts(request(), d)
    expect(result.status).toBe(502)
    expect(JSON.parse(result.body)).toEqual({ error: 'practice attempt persistence failed' })
  })
})
