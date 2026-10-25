import { useEffect, useState } from 'react'
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

export type WebTestStopwatchState = {
  enabled: boolean
  setEnabled: (next: boolean) => void
  questionElapsedMs: number
  unitElapsedMs: number
}

/**
 * Optional stopwatch for the Web Test runner. It keeps time in memory only:
 * the unit clock starts when the toggle is switched on, and the question clock
 * restarts whenever `questionKey` changes. Switching the toggle off clears both.
 */
type StopwatchClock = {
  questionKey: string | null
  questionStartedAt: number | null
  unitStartedAt: number | null
}

const INACTIVE_CLOCK: StopwatchClock = { questionKey: null, questionStartedAt: null, unitStartedAt: null }

export function useWebTestStopwatch(questionKey: string | null): WebTestStopwatchState {
  const [enabled, setEnabledState] = useState(readStopwatchEnabled)
  const [now, setNow] = useState(() => Date.now())
  const [clock, setClock] = useState<StopwatchClock>(() => enabled && questionKey !== null
    ? { questionKey, questionStartedAt: now, unitStartedAt: now }
    : INACTIVE_CLOCK)

  useEffect(() => {
    if (!enabled) return
    const interval = globalThis.setInterval(() => {
      const tickedAt = Date.now()
      setNow(tickedAt)
      // The unit clock keeps its first start; the question clock restarts on change.
      // Outside a running unit (loading, completion) both clocks are idle again.
      setClock((current) => {
        if (questionKey === null) return current === INACTIVE_CLOCK ? current : INACTIVE_CLOCK
        if (current.questionKey === questionKey) return current
        return { questionKey, questionStartedAt: tickedAt, unitStartedAt: current.unitStartedAt ?? tickedAt }
      })
    }, 1000)
    return () => globalThis.clearInterval(interval)
  }, [enabled, questionKey])

  // Until the next tick records the new question, report 00:00 rather than the
  // previous question's running time.
  const questionElapsedMs = !enabled || clock.questionKey !== questionKey || clock.questionStartedAt === null
    ? 0
    : Math.max(0, now - clock.questionStartedAt)
  const unitElapsedMs = !enabled || clock.unitStartedAt === null ? 0 : Math.max(0, now - clock.unitStartedAt)

  return {
    enabled,
    setEnabled: (next: boolean) => {
      setEnabledState(next)
      const startedAt = Date.now()
      setClock(next && questionKey !== null
        ? { questionKey, questionStartedAt: startedAt, unitStartedAt: startedAt }
        : INACTIVE_CLOCK)
      writeStopwatchEnabled(next)
    },
    questionElapsedMs,
    unitElapsedMs,
  }
}

export function WebTestStopwatchPanel({ stopwatch }: { stopwatch: WebTestStopwatchState }) {
  const ui = useStrings().learningUi
  return (
    <div className="web-test-hub__stopwatch">
      <label className="web-test-hub__stopwatch-toggle">
        <input
          type="checkbox"
          checked={stopwatch.enabled}
          onChange={(event) => stopwatch.setEnabled(event.currentTarget.checked)}
        />
        <span>{ui.webStopwatchLabel}</span>
      </label>
      {stopwatch.enabled && <>
        <dl className="web-test-hub__stopwatch-readings">
          <div>
            <dt>{ui.webStopwatchQuestionTime}</dt>
            <dd aria-live="off">{formatStopwatch(stopwatch.questionElapsedMs)}</dd>
          </div>
          <div>
            <dt>{ui.webStopwatchUnitTime}</dt>
            <dd aria-live="off">{formatStopwatch(stopwatch.unitElapsedMs)}</dd>
          </div>
        </dl>
        <p className="web-test-hub__stopwatch-note">{ui.webStopwatchNote}</p>
      </>}
    </div>
  )
}
