import { describe, expect, it } from 'vitest'
import { requestWithBody } from './request.ts'

describe('practice-attempts entry', () => {
  it('passes the actual POST body into the normalized handler request', async () => {
    const body = JSON.stringify({ contentId: 'fixture', answer: 'two' })
    const request = await requestWithBody(new Request('https://example.test/practice-attempts', { method: 'POST', body }))
    expect(request.bodyText).toBe(body)
    expect(request.method).toBe('POST')
  })
})
