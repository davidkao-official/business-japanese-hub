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
})
