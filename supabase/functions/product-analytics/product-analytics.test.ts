import { describe, expect, it, vi } from 'vitest'
import type { Logger } from '../_shared/log.ts'
import {
  handleProductAnalytics,
  PRODUCT_ANALYTICS_MAX_BODY_BYTES,
} from './handler.ts'

const EVENT_ID = '018f1f58-6f58-4b6c-8f93-a4d8da5711d0'

function fakeLogger(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

function request(body: unknown) {
  return {
    method: 'POST',
    url: 'https://project.supabase.co/functions/v1/product-analytics',
    headers: { 'content-type': 'application/json' },
    bodyText: JSON.stringify(body),
  }
}

describe('product validation analytics handler', () => {
  it('acknowledges one exact event and writes only its privacy-bounded dimensions', () => {
    const log = fakeLogger()
    const result = handleProductAnalytics(
      request({
        eventId: EVENT_ID,
        event: 'case_outcome',
        scenarioId: 'rookie-survival',
        outcomeCategory: 'strong',
      }),
      { log },
    )

    expect(result).toEqual({
      status: 202,
      headers: { 'Content-Type': 'application/json' },
      body: '{"accepted":true}',
    })
    expect(log.info).toHaveBeenCalledWith(
      {
        eventId: EVENT_ID,
        event: 'case_outcome',
        scenarioId: 'rookie-survival',
        outcomeCategory: 'strong',
      },
      'validation event accepted',
    )
    expect(log.warn).not.toHaveBeenCalled()
    expect(log.error).not.toHaveBeenCalled()
  })

  it('accepts POST only and never logs a rejected method', () => {
    const log = fakeLogger()
    const result = handleProductAnalytics(
      { ...request({}), method: 'GET', bodyText: '' },
      { log },
    )

    expect(result.status).toBe(405)
    expect(JSON.parse(result.body)).toEqual({ error: 'method not allowed; expected POST' })
    expect(log.info).not.toHaveBeenCalled()
  })

  it.each([
    {
      eventId: EVENT_ID,
      event: 'cross_product_link_clicked',
      direction: 'library_to_career_game',
    },
    {
      eventId: EVENT_ID,
      event: 'cross_product_link_clicked',
      scenarioId: 'rookie-survival',
      direction: 'career_game_to_library',
    },
  ])('accepts the exact direction-specific cross-product shape', (event) => {
    const log = fakeLogger()
    const result = handleProductAnalytics(request(event), { log })

    expect(result.status).toBe(202)
    expect(log.info).toHaveBeenCalledWith(event, 'validation event accepted')
  })

  it('rejects declared or actual bodies above the small analytics cap', () => {
    const log = fakeLogger()
    const actual = handleProductAnalytics(
      {
        ...request({}),
        bodyText: 'x'.repeat(PRODUCT_ANALYTICS_MAX_BODY_BYTES + 1),
      },
      { log },
    )
    const declared = handleProductAnalytics(
      {
        ...request({}),
        headers: {
          'content-type': 'application/json',
          'content-length': String(PRODUCT_ANALYTICS_MAX_BODY_BYTES + 1),
        },
      },
      { log },
    )

    expect(actual.status).toBe(413)
    expect(declared.status).toBe(413)
    expect(log.info).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON, non-JSON media, and any non-contract field without logging it', () => {
    const log = fakeLogger()
    const malformed = handleProductAnalytics(
      { ...request({}), bodyText: '{' },
      { log },
    )
    const wrongMedia = handleProductAnalytics(
      { ...request({}), headers: { 'content-type': 'text/plain' } },
      { log },
    )
    const privateFields = handleProductAnalytics(
      request({
        eventId: EVENT_ID,
        event: 'case_started',
        scenarioId: 'rookie-survival',
        userId: 'user-1',
        email: 'private@example.com',
        sessionId: 'session-1',
        checkpointId: 'checkpoint-1',
        choiceId: 'choice-1',
        content: 'private content',
        url: 'https://example.com/private',
        referrer: 'https://example.com',
        clientTimestamp: '2026-09-01T00:00:00Z',
        props: { arbitrary: true },
      }),
      { log },
    )

    expect(malformed.status).toBe(400)
    expect(wrongMedia.status).toBe(415)
    expect(privateFields.status).toBe(400)
    expect(log.info).not.toHaveBeenCalled()
    expect(log.warn).not.toHaveBeenCalled()
    expect(log.error).not.toHaveBeenCalled()
  })

  it.each([
    { eventId: EVENT_ID, event: 'case_opened', scenarioId: 'rookie-survival' },
    { eventId: 'not-a-uuid', event: 'case_viewed', scenarioId: 'rookie-survival' },
    { eventId: EVENT_ID, event: 'case_viewed', scenarioId: 'Rookie Survival' },
    { eventId: EVENT_ID, event: 'case_viewed', scenarioId: `a${'b'.repeat(64)}` },
    { eventId: EVENT_ID, event: 'case_outcome', scenarioId: 'rookie-survival' },
    {
      eventId: EVENT_ID,
      event: 'case_outcome',
      scenarioId: 'rookie-survival',
      outcomeCategory: 'excellent',
    },
    {
      eventId: EVENT_ID,
      event: 'cross_product_link_clicked',
      scenarioId: 'rookie-survival',
      direction: 'library_to_game',
    },
    {
      eventId: EVENT_ID,
      event: 'cross_product_link_clicked',
      scenarioId: 'rookie-survival',
      direction: 'library_to_career_game',
    },
    {
      eventId: EVENT_ID,
      event: 'cross_product_link_clicked',
      direction: 'career_game_to_library',
    },
  ])('rejects values outside the exact event allowlist: $event', (body) => {
    const log = fakeLogger()
    const result = handleProductAnalytics(request(body), { log })

    expect(result.status).toBe(400)
    expect(log.info).not.toHaveBeenCalled()
  })

  it('preserves distinct client event IDs for downstream log deduplication', () => {
    const log = fakeLogger()
    const secondEventId = '018f1f58-6f58-4b6c-8f93-a4d8da5711d1'

    for (const eventId of [EVENT_ID, secondEventId]) {
      handleProductAnalytics(
        request({ eventId, event: 'case_replayed', scenarioId: 'rookie-survival' }),
        { log },
      )
    }

    expect(vi.mocked(log.info).mock.calls.map(([fields]) => fields.eventId)).toEqual([
      EVENT_ID,
      secondEventId,
    ])
  })
})
