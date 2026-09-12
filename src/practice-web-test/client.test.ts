import { describe, expect, it, vi } from 'vitest'

import { fetchPracticePayload, submitPracticeAttempt } from './client'

const jwtFor = (sub: string) => `header.${btoa(JSON.stringify({ sub })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.signature`

describe('practice payload client', () => {
  it('fails closed when session restoration rejects', async () => {
    await expect(fetchPracticePayload('practice-web-test-spi-v1', 'a'.repeat(64), vi.fn().mockRejectedValue(new Error('session restore failed')), 'member-a')).resolves.toEqual({ kind: 'unavailable' })
  })

  it('requests member content without a browser cache', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.test/functions/v1')
    const getAccessToken = vi.fn().mockResolvedValue(jwtFor('member-a'))
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 })
    vi.stubGlobal('fetch', fetchMock)

    await fetchPracticePayload('practice-web-test-spi-v1', 'a'.repeat(64), getAccessToken, 'member-a')

    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cache: 'no-store' }))
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('does not fetch when the session returns a token for another user', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.test/functions/v1')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const input = { contentId: 'practice-web-test-spi-v1', revision: 'a'.repeat(64), questionId: 'question-01', questionVersion: 1, answer: 'a', responseTimeMs: 1, clientIdempotencyKey: 'key' }

    await expect(submitPracticeAttempt(input, vi.fn().mockResolvedValue(jwtFor('member-b')), 'member-a')).resolves.toEqual({ kind: 'unavailable' })
    await expect(fetchPracticePayload('practice-web-test-spi-v1', 'a'.repeat(64), vi.fn().mockResolvedValue(jwtFor('member-b')), 'member-a')).resolves.toEqual({ kind: 'unavailable' })
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('submits only the bounded versioned attempt allowlist', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.test/functions/v1')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: vi.fn().mockResolvedValue({ persisted: true }) })
    vi.stubGlobal('fetch', fetchMock)

    const input = {
      contentId: 'practice-web-test-spi-v1', revision: 'a'.repeat(64), questionId: 'question-01', questionVersion: 3,
      answer: 'choice-b', responseTimeMs: 1234, clientIdempotencyKey: '70000000-0000-4000-8000-000000000001',
      checkpointResponses: [{ checkpointId: 'checkpoint-01', checkpointVersion: 2, response: 4 }],
      userId: 'must-not-cross', correct: true, category: 'private-category', mode: 'private-mode', diagnosis: 'must-not-cross',
    }
    await expect(submitPracticeAttempt(input, vi.fn().mockResolvedValue(jwtFor('member-a')), 'member-a')).resolves.toEqual({ kind: 'ok' })

    const [, request] = fetchMock.mock.calls[0]!
    const wireBody = JSON.parse(request.body as string) as Record<string, unknown>
    expect(Object.keys(wireBody).sort()).toEqual([
      'answer', 'checkpointResponses', 'clientIdempotencyKey', 'contentId', 'questionId', 'questionVersion', 'responseTimeMs', 'revision',
    ])
    expect(wireBody).toEqual({
      contentId: 'practice-web-test-spi-v1', revision: 'a'.repeat(64), questionId: 'question-01', questionVersion: 3,
      answer: 'choice-b', responseTimeMs: 1234, clientIdempotencyKey: '70000000-0000-4000-8000-000000000001',
      checkpointResponses: [{ checkpointId: 'checkpoint-01', checkpointVersion: 2, response: 4 }],
    })
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('does not write while signed out or when access is denied', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.test/functions/v1')
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403 })
    vi.stubGlobal('fetch', fetchMock)
    const input = { contentId: 'practice-web-test-spi-v1', revision: 'a'.repeat(64), questionId: 'question-01', questionVersion: 1, answer: 'a', responseTimeMs: 1, clientIdempotencyKey: 'key' }
    await expect(submitPracticeAttempt(input, vi.fn().mockResolvedValue(null), 'member-a')).resolves.toEqual({ kind: 'signed-out' })
    expect(fetchMock).not.toHaveBeenCalled()
    await expect(submitPracticeAttempt(input, vi.fn().mockResolvedValue(jwtFor('member-a')), 'member-a')).resolves.toEqual({ kind: 'forbidden' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('does not claim persistence for a failed or incomplete response', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.test/functions/v1')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: vi.fn().mockResolvedValue({ recorded: true }) })
    vi.stubGlobal('fetch', fetchMock)
    const input = { contentId: 'practice-web-test-spi-v1', revision: 'a'.repeat(64), questionId: 'question-01', questionVersion: 1, answer: 'a', responseTimeMs: 1, clientIdempotencyKey: 'key' }
    await expect(submitPracticeAttempt(input, vi.fn().mockResolvedValue(jwtFor('member-a')), 'member-a')).resolves.toEqual({ kind: 'unavailable' })
    fetchMock.mockRejectedValueOnce(new Error('network down'))
    await expect(submitPracticeAttempt(input, vi.fn().mockResolvedValue(jwtFor('member-a')), 'member-a')).resolves.toEqual({ kind: 'unavailable' })
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('aborts a stalled attempt request and returns unavailable for retry', async () => {
    vi.useFakeTimers()
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.test/functions/v1')
    const fetchMock = vi.fn((_url: string, request: RequestInit) => new Promise<never>((_, reject) => {
      request.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
    }))
    vi.stubGlobal('fetch', fetchMock)
    const input = { contentId: 'practice-web-test-spi-v1', revision: 'a'.repeat(64), questionId: 'question-01', questionVersion: 1, answer: 'a', responseTimeMs: 1, clientIdempotencyKey: 'key' }
    const pending = submitPracticeAttempt(input, vi.fn().mockResolvedValue(jwtFor('member-a')), 'member-a')
    await vi.advanceTimersByTimeAsync(10_000)
    await expect(pending).resolves.toEqual({ kind: 'unavailable' })
    expect(fetchMock.mock.calls[0]![1]?.signal?.aborted).toBe(true)
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('times out a session token lookup and returns unavailable for retry', async () => {
    vi.useFakeTimers()
    const token = new Promise<string | null>(() => {})
    const pending = submitPracticeAttempt(
      { contentId: 'practice-web-test-spi-v1', revision: 'a'.repeat(64), questionId: 'question-01', questionVersion: 1, answer: 'a', responseTimeMs: 1, clientIdempotencyKey: 'key' },
      () => token,
      'member-a',
    )
    await vi.advanceTimersByTimeAsync(10_000)
    await expect(pending).resolves.toEqual({ kind: 'unavailable' })
    vi.useRealTimers()
  })
})
