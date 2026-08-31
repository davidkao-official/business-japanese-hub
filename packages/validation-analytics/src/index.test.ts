import { describe, expect, it, vi } from 'vitest'
import {
  createBrowserValidationAnalytics,
  noopValidationAnalytics,
  type ValidationAnalyticsEvent,
  type ValidationAnalyticsFetcher,
} from './index'

const EVENT_ID = '018f1f58-6f58-4b6c-8f93-a4d8da5711d0'

function createFetcher() {
  return vi.fn<ValidationAnalyticsFetcher>(() => Promise.resolve({ ok: true }))
}

describe('browser validation analytics', () => {
  it('posts an exact UUID-tagged event with keepalive and returns immediately', () => {
    const fetcher = createFetcher()
    const analytics = createBrowserValidationAnalytics({
      functionsBaseUrl: 'https://project.supabase.co/functions/v1/',
      fetcher,
      createEventId: () => EVENT_ID,
    })

    expect(analytics.track({ event: 'case_started', scenarioId: 'rookie-survival' })).toBeUndefined()
    expect(fetcher).toHaveBeenCalledWith(
      'https://project.supabase.co/functions/v1/product-analytics',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: EVENT_ID,
          event: 'case_started',
          scenarioId: 'rookie-survival',
        }),
        keepalive: true,
      },
    )
  })

  it('sends only the bounded outcome category on case outcome events', () => {
    const fetcher = createFetcher()
    const analytics = createBrowserValidationAnalytics({
      functionsBaseUrl: 'https://project.supabase.co/functions/v1',
      fetcher,
      createEventId: () => EVENT_ID,
    })

    analytics.track({
      event: 'case_outcome',
      scenarioId: 'rookie-survival',
      outcomeCategory: 'mixed',
    })

    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({
      eventId: EVENT_ID,
      event: 'case_outcome',
      scenarioId: 'rookie-survival',
      outcomeCategory: 'mixed',
    })
  })

  it('sends only the bounded direction on cross-product link events', () => {
    const fetcher = createFetcher()
    const analytics = createBrowserValidationAnalytics({
      functionsBaseUrl: 'https://project.supabase.co/functions/v1',
      fetcher,
      createEventId: () => EVENT_ID,
    })

    analytics.track({
      event: 'cross_product_link_clicked',
      scenarioId: 'rookie-survival',
      direction: 'career_game_to_library',
    })

    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({
      eventId: EVENT_ID,
      event: 'cross_product_link_clicked',
      scenarioId: 'rookie-survival',
      direction: 'career_game_to_library',
    })
  })

  it.each(['case_viewed', 'case_completed', 'case_replayed'] as const)(
    'supports the exact simple case event %s',
    (event) => {
      const fetcher = createFetcher()
      const analytics = createBrowserValidationAnalytics({
        functionsBaseUrl: 'https://project.supabase.co/functions/v1',
        fetcher,
        createEventId: () => EVENT_ID,
      })

      analytics.track({ event, scenarioId: 'rookie-survival' })

      expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({
        eventId: EVENT_ID,
        event,
        scenarioId: 'rookie-survival',
      })
    },
  )

  it('derives the function endpoint from Supabase and degrades to noop when unconfigured', () => {
    const fetcher = createFetcher()
    const configured = createBrowserValidationAnalytics({
      supabaseUrl: 'https://project.supabase.co/',
      fetcher,
      createEventId: () => EVENT_ID,
    })

    configured.track({ event: 'case_viewed', scenarioId: 'rookie-survival' })
    expect(fetcher.mock.calls[0]![0]).toBe(
      'https://project.supabase.co/functions/v1/product-analytics',
    )

    const unavailable = createBrowserValidationAnalytics({ fetcher })
    expect(unavailable).toBe(noopValidationAnalytics)
    expect(() =>
      unavailable.track({ event: 'case_viewed', scenarioId: 'rookie-survival' }),
    ).not.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('never throws or exposes rejected delivery promises', async () => {
    const rejected = vi.fn<ValidationAnalyticsFetcher>(() => Promise.reject(new Error('offline')))
    const rejectionSafe = createBrowserValidationAnalytics({
      functionsBaseUrl: 'https://project.supabase.co/functions/v1',
      fetcher: rejected,
      createEventId: () => EVENT_ID,
    })
    expect(() =>
      rejectionSafe.track({ event: 'case_completed', scenarioId: 'rookie-survival' }),
    ).not.toThrow()
    await Promise.resolve()

    const throwingFetcher = createBrowserValidationAnalytics({
      functionsBaseUrl: 'https://project.supabase.co/functions/v1',
      fetcher: () => {
        throw new Error('offline')
      },
      createEventId: () => EVENT_ID,
    })
    expect(() =>
      throwingFetcher.track({ event: 'case_completed', scenarioId: 'rookie-survival' }),
    ).not.toThrow()

    const throwingId = createBrowserValidationAnalytics({
      functionsBaseUrl: 'https://project.supabase.co/functions/v1',
      fetcher: createFetcher(),
      createEventId: () => {
        throw new Error('crypto unavailable')
      },
    })
    expect(() =>
      throwingId.track({ event: 'case_completed', scenarioId: 'rookie-survival' }),
    ).not.toThrow()
  })

  it('drops malformed, unbounded, or non-exact runtime events before delivery', () => {
    const fetcher = createFetcher()
    const analytics = createBrowserValidationAnalytics({
      functionsBaseUrl: 'https://project.supabase.co/functions/v1',
      fetcher,
      createEventId: () => EVENT_ID,
    })
    const trackUnknown = (event: unknown) =>
      analytics.track(event as ValidationAnalyticsEvent)

    trackUnknown({ event: 'case_viewed', scenarioId: 'rookie-survival', url: '/private' })
    trackUnknown({ event: 'case_viewed', scenarioId: 'Rookie Survival' })
    trackUnknown({ event: 'case_viewed', scenarioId: `a${'b'.repeat(64)}` })
    trackUnknown({
      event: 'case_outcome',
      scenarioId: 'rookie-survival',
      outcomeCategory: 'excellent',
    })
    trackUnknown({
      event: 'cross_product_link_clicked',
      scenarioId: 'rookie-survival',
      direction: 'unknown',
    })

    expect(fetcher).not.toHaveBeenCalled()

    const invalidEventId = createBrowserValidationAnalytics({
      functionsBaseUrl: 'https://project.supabase.co/functions/v1',
      fetcher,
      createEventId: () => 'not-a-uuid',
    })
    invalidEventId.track({ event: 'case_viewed', scenarioId: 'rookie-survival' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('fails closed on unsafe endpoint configuration while allowing local HTTP development', () => {
    const fetcher = createFetcher()
    const unsafe = createBrowserValidationAnalytics({
      functionsBaseUrl: 'javascript:alert(1)',
      supabaseUrl: 'http://production.example',
      fetcher,
    })
    expect(unsafe).toBe(noopValidationAnalytics)

    const local = createBrowserValidationAnalytics({
      supabaseUrl: 'http://127.0.0.1:54321',
      fetcher,
      createEventId: () => EVENT_ID,
    })
    local.track({ event: 'case_viewed', scenarioId: 'rookie-survival' })
    expect(fetcher.mock.calls[0]![0]).toBe(
      'http://127.0.0.1:54321/functions/v1/product-analytics',
    )
  })
})
