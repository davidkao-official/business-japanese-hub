import { describe, expect, it, vi } from 'vitest'

import { fetchPracticePayload, submitPracticeAttempt } from './client'

describe('practice payload client', () => {
  it('fails closed when session restoration rejects', async () => {
    await expect(fetchPracticePayload('practice-web-test-spi-v1', 'a'.repeat(64), vi.fn().mockRejectedValue(new Error('session restore failed')))).resolves.toEqual({ kind: 'unavailable' })
  })

  it('requests member content without a browser cache', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.test/functions/v1')
    const getAccessToken = vi.fn().mockResolvedValue('synthetic-token')
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 })
    vi.stubGlobal('fetch', fetchMock)

    await fetchPracticePayload('practice-web-test-spi-v1', 'a'.repeat(64), getAccessToken)

    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cache: 'no-store' }))
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('submits only the bounded versioned attempt allowlist', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.test/functions/v1')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: vi.fn().mockResolvedValue({ persisted: true }) })
    vi.stubGlobal('fetch', fetchMock)

    await expect(submitPracticeAttempt({
      contentId: 'practice-web-test-spi-v1', revision: 'a'.repeat(64), questionId: 'question-01', questionVersion: 3,
      answer: 'choice-b', responseTimeMs: 1234, clientIdempotencyKey: '70000000-0000-4000-8000-000000000001',
      checkpointResponses: [{ checkpointId: 'checkpoint-01', checkpointVersion: 2, response: 4 }],
    }, vi.fn().mockResolvedValue('synthetic-token'))).resolves.toEqual({ kind: 'ok' })

    const [, request] = fetchMock.mock.calls[0]!
    expect(JSON.parse(request.body as string)).toEqual({
      contentId: 'practice-web-test-spi-v1', revision: 'a'.repeat(64), questionId: 'question-01', questionVersion: 3,
      answer: 'choice-b', responseTimeMs: 1234, clientIdempotencyKey: '70000000-0000-4000-8000-000000000001',
      checkpointResponses: [{ checkpointId: 'checkpoint-01', checkpointVersion: 2, response: 4 }],
    })
    expect(JSON.stringify(JSON.parse(request.body as string))).not.toMatch(/userId|correct|category|mode|diagnosis|promptJa/)
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('does not write while signed out or when access is denied', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.test/functions/v1')
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403 })
    vi.stubGlobal('fetch', fetchMock)
    const input = { contentId: 'practice-web-test-spi-v1', revision: 'a'.repeat(64), questionId: 'question-01', questionVersion: 1, answer: 'a', responseTimeMs: 1, clientIdempotencyKey: 'key' }
    await expect(submitPracticeAttempt(input, vi.fn().mockResolvedValue(null))).resolves.toEqual({ kind: 'signed-out' })
    expect(fetchMock).not.toHaveBeenCalled()
    await expect(submitPracticeAttempt(input, vi.fn().mockResolvedValue('token'))).resolves.toEqual({ kind: 'forbidden' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('does not claim persistence for a failed or incomplete response', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.test/functions/v1')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: vi.fn().mockResolvedValue({ recorded: true }) })
    vi.stubGlobal('fetch', fetchMock)
    const input = { contentId: 'practice-web-test-spi-v1', revision: 'a'.repeat(64), questionId: 'question-01', questionVersion: 1, answer: 'a', responseTimeMs: 1, clientIdempotencyKey: 'key' }
    await expect(submitPracticeAttempt(input, vi.fn().mockResolvedValue('token'))).resolves.toEqual({ kind: 'unavailable' })
    fetchMock.mockRejectedValueOnce(new Error('network down'))
    await expect(submitPracticeAttempt(input, vi.fn().mockResolvedValue('token'))).resolves.toEqual({ kind: 'unavailable' })
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })
})
