import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { useStrings } from '../i18n/strings'

/** Client-only practice clock preference; never sent to the attempt API. */
export const WEB_TEST_STOPWATCH_STORAGE_KEY = 'bjh.web-test.stopwatch'

/** Safe preference read: missing, corrupt or unavailable storage means "off". */
export function readStopwatchEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(WEB_TEST_STOPWATCH_STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

/** Safe preference write: a failed write leaves the in-memory choice for this session. */
export function writeStopwatchEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (enabled) window.localStorage.setItem(WEB_TEST_STOPWATCH_STORAGE_KEY, 'on')
    else window.localStorage.removeItem(WEB_TEST_STOPWATCH_STORAGE_KEY)
  } catch {
    // Storage unavailable — the toggle still works for this page view.
  }
}

/** Elapsed time as mm:ss; minutes are not capped. */
export function formatStopwatch(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/** Read-only handle so the runner can freeze the question time at submission. */
export type WebTestStopwatchHandle = { questionElapsedMs: () => number }

type WebTestStopwatchProps = {
  enabled: boolean
  onEnabledChange: (next: boolean) => void
  /**
   * Identity of the current question. A change remounts the question clock, so
   * the new question starts at 00:00 without waiting for a display tick.
   */
  questionKey: string
  /** Registered while a timed question is on screen; read once at submission. */
  handleRef: RefObject<WebTestStopwatchHandle | null>
}

/**
 * Optional client-only stopwatch for the Web Test runner. Mount it with a unit
 * identity as its React `key` (selection + run number): a new unit remounts the
 * component, which resets the unit clock immediately, independently of ticks.
 */
export function WebTestStopwatch({ enabled, onEnabledChange, questionKey, handleRef }: WebTestStopwatchProps) {
  const ui = useStrings().learningUi
  const [unitStartedAt, setUnitStartedAt] = useState<number | null>(() => enabled ? Date.now() : null)

  const toggle = (next: boolean) => {
    setUnitStartedAt(next ? Date.now() : null)
    onEnabledChange(next)
  }

  return (
    <div className="web-test-hub__stopwatch">
      <label className="web-test-hub__stopwatch-toggle">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => toggle(event.currentTarget.checked)}
        />
        <span>{ui.webStopwatchLabel}</span>
      </label>
      {enabled && unitStartedAt !== null && <>
        <WebTestStopwatchReadings key={questionKey} unitStartedAt={unitStartedAt} handleRef={handleRef} />
        <p className="web-test-hub__stopwatch-note">{ui.webStopwatchNote}</p>
      </>}
    </div>
  )
}

/**
 * The ticking part lives here so the runner above it does not rerender every
 * second, and the interval exists only while a timed question is on screen.
 */
function WebTestStopwatchReadings({ unitStartedAt, handleRef }: {
  unitStartedAt: number
  handleRef: RefObject<WebTestStopwatchHandle | null>
}) {
  const ui = useStrings().learningUi
  const [questionStartedAt] = useState(() => Date.now())
  const [now, setNow] = useState(questionStartedAt)

  useEffect(() => {
    const interval = globalThis.setInterval(() => setNow(Date.now()), 1000)
    return () => globalThis.clearInterval(interval)
  }, [])

  useEffect(() => {
    handleRef.current = { questionElapsedMs: () => Math.max(0, Date.now() - questionStartedAt) }
    return () => { handleRef.current = null }
  }, [handleRef, questionStartedAt])

  return (
    <dl className="web-test-hub__stopwatch-readings">
      <div>
        <dt>{ui.webStopwatchQuestionTime}</dt>
        <dd aria-live="off">{formatStopwatch(Math.max(0, now - questionStartedAt))}</dd>
      </div>
      <div>
        <dt>{ui.webStopwatchUnitTime}</dt>
        <dd aria-live="off">{formatStopwatch(Math.max(0, now - unitStartedAt))}</dd>
      </div>
    </dl>
  )
}
