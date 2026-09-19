import { describe, expect, it } from 'vitest'
import { MAX_BODY_BYTES } from './handler.ts'
import { requestWithBody } from './request.ts'

describe('practice-attempts entry', () => {
  it('passes the actual POST body into the normalized handler request', async () => {
    const body = JSON.stringify({ contentId: 'fixture', answer: 'two' })
    const request = await requestWithBody(new Request('https://example.test/practice-attempts', { method: 'POST', body }))
    expect(request.bodyText).toBe(body)
    expect(request.method).toBe('POST')
  })

  it('rejects a declared oversized body before reading it', async () => {
    const request = new Request('https://example.test/practice-attempts', {
      method: 'POST', headers: { 'content-length': String(MAX_BODY_BYTES + 1) }, body: '{}',
    })
    await expect(requestWithBody(request)).rejects.toThrow('request body too large')
  })

  it('rejects a streamed body as soon as it exceeds the bound', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_BODY_BYTES))
        controller.enqueue(new Uint8Array(1))
        controller.close()
      },
    })
    const request = new Request('https://example.test/practice-attempts', { method: 'POST', body, duplex: 'half' as never })
    await expect(requestWithBody(request)).rejects.toThrow('request body too large')
  })
})
