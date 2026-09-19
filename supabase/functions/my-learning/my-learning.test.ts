import { describe, expect, it, vi } from 'vitest'
import { createMockDb, bearerHeaders, handlerRequest } from '../_shared/testing.ts'
import { handleMyLearning } from './handler.ts'

const userId = '10000000-0000-4000-8000-000000000001'
const revision = 'a'.repeat(64)

const attemptRow = {
  content_id: 'practice-web-test-spi-v1',
  content_revision: revision,
  question_id: 'question-1',
  question_version: 1,
  test_family: 'spi',
  domain: 'verbal',
  category: 'vocabulary-in-context',
  practice_mode: 'untimed-learning',
  correct: false,
  created_at: '2026-09-19T00:00:00.000Z',
}

const reviewRow = {
  content_id: attemptRow.content_id,
  content_revision: revision,
  question_id: attemptRow.question_id,
  question_version: 1,
  test_family: attemptRow.test_family,
  domain: attemptRow.domain,
  category: attemptRow.category,
  practice_mode: attemptRow.practice_mode,
  correct: false,
  created_at: attemptRow.created_at,
}

const availabilityRow = {
  content_id: attemptRow.content_id,
  question_id: attemptRow.question_id,
  question_version: 1,
  content_revision: revision,
  test_family: attemptRow.test_family,
  domain: attemptRow.domain,
  category: attemptRow.category,
  practice_mode: attemptRow.practice_mode,
  available: true,
}

function request(method = 'GET', authorization = 'Bearer verified-token') {
  return handlerRequest(method, 'https://example.test/my-learning', '', authorization ? bearerHeaders(authorization.replace('Bearer ', '')) : {})
}

function deps(database: ReturnType<typeof createMockDb>, access: 'active' | 'non-member' | 'unavailable' = 'active') {
  return {
    db: database.db,
    membershipAccessFor: vi.fn().mockResolvedValue(access),
  }
}

describe('my-learning handler', () => {
  it('rejects methods other than GET', async () => {
    const database = createMockDb()

    const result = await handleMyLearning(request('POST'), deps(database))

    expect(result.status).toBe(405)
  })

  it('authenticates before checking membership or reading evidence', async () => {
    const database = createMockDb({ 'auth:getUser': { data: null } })
    const membership = deps(database)

    const result = await handleMyLearning(request('GET', ''), membership)

    expect(result.status).toBe(401)
    expect(membership.membershipAccessFor).not.toHaveBeenCalled()
    expect(database.callsFor('practice_attempts')).toEqual([])
  })

  it.each([
    ['non-member', 403],
    ['unavailable', 503],
  ] as const)('fails closed for %s membership before reading evidence', async (access, status) => {
    const database = createMockDb({ 'auth:getUser': { data: { id: userId } } })

    const result = await handleMyLearning(request(), deps(database, access))

    expect(result.status).toBe(status)
    expect(database.callsFor('practice_attempts')).toEqual([])
    expect(database.callsFor('practice_review_queue')).toEqual([])
  })

  it('returns a bounded own-user Practice snapshot without sensitive answer data', async () => {
    const database = createMockDb({
      'auth:getUser': { data: { id: userId } },
      practice_attempts: { data: [{ ...attemptRow, submitted_answer: { forged: true }, checkpoint_results: [{ correct: false }] }] },
      practice_review_queue: { data: [reviewRow] },
      practice_question_availability: { data: [availabilityRow] },
    })

    const result = await handleMyLearning(request(), deps(database))
    const body = JSON.parse(result.body) as { source: string; snapshot: { nextAction: { kind: string }; actionableMistakes: unknown[] } }
    const attemptSelect = database.callsFor('practice_attempts', 'select')[0]?.args[0]
    const reviewSelect = database.callsFor('practice_review_queue', 'select')[0]?.args[0]

    expect(result.status).toBe(200)
    expect(result.headers?.['Cache-Control']).toBe('private, no-store')
    expect(body.source).toBe('practice-web-test')
    expect(body.snapshot.nextAction.kind).toBe('review-mistake')
    expect(body.snapshot.actionableMistakes).toHaveLength(1)
    expect(result.body).not.toContain('submitted_answer')
    expect(result.body).not.toContain('checkpoint_results')
    expect(attemptSelect).toBe('content_id,content_revision,question_id,question_version,test_family,domain,category,practice_mode,correct,created_at')
    expect(reviewSelect).toBe('content_id,content_revision,question_id,question_version,test_family,domain,category,practice_mode,correct,created_at')
    expect(database.callsFor('practice_attempts', 'eq')).toContainEqual({ table: 'practice_attempts', method: 'eq', args: ['user_id', userId] })
    expect(database.callsFor('practice_review_queue', 'eq')).toContainEqual({ table: 'practice_review_queue', method: 'eq', args: ['user_id', userId] })
    expect(database.callsFor('practice_attempts', 'limit')[0]?.args).toEqual([50])
  })

  it('fails closed when the evidence read is unavailable', async () => {
    const database = createMockDb({
      'auth:getUser': { data: { id: userId } },
      practice_attempts: { error: 'database unavailable' },
    })

    const result = await handleMyLearning(request(), deps(database))

    expect(result.status).toBe(503)
    expect(result.headers?.['Cache-Control']).toBe('private, no-store')
  })

  it('fails closed when persisted evidence violates the release identity contract', async () => {
    const database = createMockDb({
      'auth:getUser': { data: { id: userId } },
      practice_attempts: { data: [{ ...attemptRow, content_revision: 'not-a-revision' }] },
      practice_review_queue: { data: [] },
    })

    const result = await handleMyLearning(request(), deps(database))

    expect(result.status).toBe(503)
    expect(result.headers?.['Cache-Control']).toBe('private, no-store')
  })
})
