import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('npm:@supabase/supabase-js@^2.112.3', () => ({ createClient: vi.fn() }), { virtual: true })

describe('practice-attempts entry', () => {
  beforeEach(() => {
    vi.resetModules()
    Object.defineProperty(globalThis, 'Deno', { configurable: true, value: { serve: vi.fn() } })
  })

  it('passes the actual POST body into the normalized handler request', async () => {
    const { requestWithBody } = await import('./index.ts')
    const body = JSON.stringify({ contentId: 'fixture', answer: 'two' })
    const request = await requestWithBody(new Request('https://example.test/practice-attempts', { method: 'POST', body }))
    expect(request.bodyText).toBe(body)
    expect(request.method).toBe('POST')
  })
})
