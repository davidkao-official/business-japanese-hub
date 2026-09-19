import { afterEach, describe, expect, it, vi } from 'vitest'
import { PRACTICE_ATTEMPT_TIMEOUT_MS } from '../../practice-web-test/client'
import { fetchPracticeLearningSnapshot } from './practiceMyLearningClient'

const revision = 'a'.repeat(64)

const snapshot = {
  recentAttempts: [{
    contentId: 'practice-web-test-spi-v1',
    contentRevision: revision,
    questionId: 'question-1',
    questionVersion: 1,
    testFamily: 'spi',
    domain: 'verbal',
    category: 'vocabulary-in-context',
    practiceMode: 'untimed-learning',
    correct: false,
    createdAt: '2026-09-19T00:00:00.000Z',
  }],
  actionableMistakes: [{
    contentId: 'practice-web-test-spi-v1',
    contentRevision: revision,
    questionId: 'question-1',
    questionVersion: 1,
    testFamily: 'spi',
    domain: 'verbal',
    category: 'vocabulary-in-context',
    practiceMode: 'untimed-learning',
    createdAt: '2026-09-19T00:00:00.000Z',
  }],
  weakArea: null,
  nextAction: { kind: 'review-mistake', item: {
    contentId: 'practice-web-test-spi-v1',
    contentRevision: revision,
    questionId: 'question-1',
    questionVersion: 1,
    testFamily: 'spi',
    domain: 'verbal',
    category: 'vocabulary-in-context',
    practiceMode: 'untimed-learning',
    createdAt: '2026-09-19T00:00:00.000Z',
  } },
} as const

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('fetchPracticeLearningSnapshot', () => {
  it('does not request evidence without a session token', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchPracticeLearningSnapshot(vi.fn().mockResolvedValue(null))

    expect(result).toEqual({ kind: 'signed-out' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    [401, 'signed-out'],
    [403, 'non-member'],
    [503, 'unavailable'],
  ] as const)('maps HTTP %s to a truthful state', async (status, kind) => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })))

    const result = await fetchPracticeLearningSnapshot(vi.fn().mockResolvedValue('token'))

    expect(result).toEqual({ kind })
  })

  it('accepts only the bounded server response shape', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test/')
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ source: 'practice-web-test', snapshot }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchPracticeLearningSnapshot(vi.fn().mockResolvedValue('token'))

    expect(result).toEqual({ kind: 'ok', snapshot })
    expect(fetchMock).toHaveBeenCalledWith('https://functions.example.test/my-learning', expect.objectContaining({
      headers: { Authorization: 'Bearer token' },
      cache: 'no-store',
    }))
  })

  it('rejects response data that tries to add fields to evidence', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test')
    const forged = {
      ...snapshot,
      recentAttempts: [{ ...snapshot.recentAttempts[0], submittedAnswer: 'secret' }],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ source: 'practice-web-test', snapshot: forged }), { status: 200 })))

    const result = await fetchPracticeLearningSnapshot(vi.fn().mockResolvedValue('token'))

    expect(result).toEqual({ kind: 'unavailable' })
  })

  it.each([
    ['token retrieval', () => new Promise<string | null>(() => {})],
    ['HTTP fetch', async () => {
      vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test')
      vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
      return 'token'
    }],
    ['response parsing', async () => {
      vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test')
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, ok: true, json: () => new Promise<never>(() => {}) }))
      return 'token'
    }],
  ])('maps a stalled %s to unavailable', async (_stage, getAccessToken) => {
    vi.useFakeTimers()
    const result = fetchPracticeLearningSnapshot(getAccessToken)

    await vi.advanceTimersByTimeAsync(PRACTICE_ATTEMPT_TIMEOUT_MS)

    await expect(result).resolves.toEqual({ kind: 'unavailable' })
  })
})
