import { describe, expect, it, vi } from 'vitest'

import { fetchPracticePayload } from './client'

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
})
