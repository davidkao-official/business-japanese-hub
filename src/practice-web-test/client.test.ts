import { describe, expect, it, vi } from 'vitest'

const createBrowserPlatformServicesMock = vi.hoisted(() => vi.fn())
vi.mock('@business-japanese-hub/platform-auth', () => ({ createBrowserPlatformServices: createBrowserPlatformServicesMock }))

import { fetchPracticePayload } from './client'

describe('practice payload client', () => {
  it('fails closed when session restoration rejects', async () => {
    createBrowserPlatformServicesMock.mockReturnValue({
      client: { auth: { getSession: vi.fn().mockRejectedValue(new Error('session restore failed')) } },
    })

    await expect(fetchPracticePayload('practice-web-test-spi-v1', 'a'.repeat(64))).resolves.toEqual({ kind: 'unavailable' })
  })

  it('requests member content without a browser cache', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://edge.test/functions/v1')
    const getSession = vi.fn().mockResolvedValue({ data: { session: { access_token: 'synthetic-token' } } })
    createBrowserPlatformServicesMock.mockReturnValue({ client: { auth: { getSession } } })
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 })
    vi.stubGlobal('fetch', fetchMock)

    await fetchPracticePayload('practice-web-test-spi-v1', 'a'.repeat(64))

    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cache: 'no-store' }))
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })
})
