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
      contentId, revision: release.value.revision, family: 'fixture', domain: 'verbal', category: 'fixture-category',
      mode: 'untimed-learning', questionId: 'fixture-choice-01', questionVersion: 1,
      clientAttemptId, response: 'two', responseMs: 1200, ...overrides,
    }),
  }
}

function deps(database: DbClient, membership: 'active' | 'non-member' | 'unavailable' = 'active') {
  return {
    db: database,
    membershipAccessFor: vi.fn().mockResolvedValue(membership),
    getRelease: vi.fn().mockResolvedValue({ kind: 'found', contentId, revision: release.value.revision, contentKind: 'practice-question-bank', payload: release.value.payload }),
  }
}

describe('practice-attempts handler', () => {
  it('authenticates, scores from the exact released question, and persists only server-derived facts', async () => {
    const database = db(userId)
    const result = await handlePracticeAttempts(request(), deps(database))
    expect(result.status).toBe(200)
    expect(JSON.parse(result.body)).toMatchObject({ kind: 'persisted', result: { correct: true, score: 1 } })
    expect(database.rpc).toHaveBeenCalledWith('record_practice_attempt', expect.objectContaining({
      p_user_id: userId, p_client_attempt_id: clientAttemptId, p_content_revision: release.value.revision,
      p_question_id: 'fixture-choice-01', p_question_version: 1, p_correct: true, p_response_ms: 1200,
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

  it('rejects malformed and oversized learner input before persistence', async () => {
    const database = db(userId)
    const d = deps(database)
    expect((await handlePracticeAttempts(request({ response: { correct: true } }), d)).status).toBe(400)
    expect((await handlePracticeAttempts(request({ responseMs: -1 }), d)).status).toBe(400)
    expect((await handlePracticeAttempts(request({ clientAttemptId: 'not-uuid' }), d)).status).toBe(400)
    expect(database.rpc).not.toHaveBeenCalled()
  })

  it('does not treat a persistence error as a recorded attempt', async () => {
    const d = deps(db(userId, null, { message: 'db down' }))
    const result = await handlePracticeAttempts(request(), d)
    expect(result.status).toBe(502)
    expect(JSON.parse(result.body)).toEqual({ error: 'practice attempt persistence failed' })
  })
})
