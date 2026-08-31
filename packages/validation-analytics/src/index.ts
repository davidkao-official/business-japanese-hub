export type ValidationAnalyticsEvent =
  | {
      event: 'case_viewed' | 'case_started' | 'case_completed' | 'case_replayed'
      scenarioId: string
    }
  | {
      event: 'case_outcome'
      scenarioId: string
      outcomeCategory: 'strong' | 'mixed' | 'risky'
    }
  | {
      event: 'cross_product_link_clicked'
      scenarioId: string
      direction: 'library_to_career_game' | 'career_game_to_library'
    }

export type RecordedValidationAnalyticsEvent = ValidationAnalyticsEvent & {
  eventId: string
}

export const VALIDATION_ANALYTICS_SCENARIO_ID_MAX_LENGTH = 64

const STABLE_SCENARIO_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SIMPLE_CASE_EVENTS = new Set([
  'case_viewed',
  'case_started',
  'case_completed',
  'case_replayed',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function isScenarioId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= VALIDATION_ANALYTICS_SCENARIO_ID_MAX_LENGTH
    && STABLE_SCENARIO_ID.test(value)
}

function parseEventWithPrefix(
  value: unknown,
  prefixKeys: readonly string[],
): ValidationAnalyticsEvent | null {
  if (!isRecord(value) || !isScenarioId(value.scenarioId)) return null
  if (typeof value.event === 'string' && SIMPLE_CASE_EVENTS.has(value.event)) {
    return hasExactKeys(value, [...prefixKeys, 'event', 'scenarioId'])
      ? { event: value.event as 'case_viewed' | 'case_started' | 'case_completed' | 'case_replayed', scenarioId: value.scenarioId }
      : null
  }
  if (value.event === 'case_outcome') {
    return hasExactKeys(value, [...prefixKeys, 'event', 'scenarioId', 'outcomeCategory'])
      && (value.outcomeCategory === 'strong'
        || value.outcomeCategory === 'mixed'
        || value.outcomeCategory === 'risky')
      ? {
          event: value.event,
          scenarioId: value.scenarioId,
          outcomeCategory: value.outcomeCategory,
        }
      : null
  }
  if (value.event === 'cross_product_link_clicked') {
    return hasExactKeys(value, [...prefixKeys, 'event', 'scenarioId', 'direction'])
      && (value.direction === 'library_to_career_game'
        || value.direction === 'career_game_to_library')
      ? { event: value.event, scenarioId: value.scenarioId, direction: value.direction }
      : null
  }
  return null
}

export function parseValidationAnalyticsEvent(value: unknown): ValidationAnalyticsEvent | null {
  return parseEventWithPrefix(value, [])
}

export function parseRecordedValidationAnalyticsEvent(
  value: unknown,
): RecordedValidationAnalyticsEvent | null {
  if (!isRecord(value) || typeof value.eventId !== 'string' || !UUID.test(value.eventId)) return null
  const event = parseEventWithPrefix(value, ['eventId'])
  return event ? { eventId: value.eventId, ...event } : null
}

export interface ValidationAnalytics {
  track(event: ValidationAnalyticsEvent): void
}

export const noopValidationAnalytics: ValidationAnalytics = Object.freeze({
  track(): void {},
})

export interface ValidationAnalyticsFetcher {
  (input: string, init: RequestInit): unknown
}

export interface BrowserValidationAnalyticsOptions {
  functionsBaseUrl?: string | null
  supabaseUrl?: string | null
  fetcher?: ValidationAnalyticsFetcher
  createEventId?: () => string
}

function safeBaseUrl(raw: string): string | null {
  try {
    const url = new URL(raw)
    const localHttp = url.protocol === 'http:'
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    if ((url.protocol !== 'https:' && !localHttp)
      || url.username
      || url.password
      || url.search
      || url.hash) return null
    return url.toString().replace(/\/+$/, '')
  } catch {
    return null
  }
}

function endpointFrom(options: BrowserValidationAnalyticsOptions): string | null {
  const functionsBaseUrl = options.functionsBaseUrl?.trim()
  if (functionsBaseUrl) {
    const base = safeBaseUrl(functionsBaseUrl)
    return base ? `${base}/product-analytics` : null
  }

  const supabaseUrl = options.supabaseUrl?.trim()
  if (supabaseUrl) {
    const base = safeBaseUrl(supabaseUrl)
    return base ? `${base}/functions/v1/product-analytics` : null
  }
  return null
}

export function createBrowserValidationAnalytics(
  options: BrowserValidationAnalyticsOptions = {},
): ValidationAnalytics {
  const endpoint = endpointFrom(options)
  if (!endpoint) return noopValidationAnalytics

  const fetcher = options.fetcher ?? ((input, init) => globalThis.fetch(input, init))
  const createEventId = options.createEventId ?? (() => globalThis.crypto.randomUUID())

  return {
    track(event): void {
      try {
        const parsedEvent = parseValidationAnalyticsEvent(event)
        if (!parsedEvent) return
        const recordedEvent = parseRecordedValidationAnalyticsEvent({
          eventId: createEventId(),
          ...parsedEvent,
        })
        if (!recordedEvent) return
        const body = JSON.stringify(recordedEvent)
        const pending = fetcher(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        })
        void Promise.resolve(pending).catch(() => undefined)
      } catch {
        // Validation telemetry must never interrupt product navigation or play.
      }
    },
  }
}
