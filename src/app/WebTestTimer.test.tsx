import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithAppProviders } from '../test/appProviders'
import { WebTestRunnerEntryPage } from './WebTestHubPage'
import { WEB_TEST_STOPWATCH_STORAGE_KEY, WebTestStopwatch, type WebTestStopwatchHandle } from '../components/WebTestStopwatch'

const fetchPracticePayloadMock = vi.hoisted(() => vi.fn().mockResolvedValue({ kind: 'signed-out' }))
const submitPracticeAttemptMock = vi.hoisted(() => vi.fn().mockResolvedValue({ kind: 'ok' }))
vi.mock('../practice-web-test/client', () => ({ fetchPracticePayload: fetchPracticePayloadMock, submitPracticeAttempt: submitPracticeAttemptMock }))

const SAMPLE_UNIT_PATH = '/practice/web-test/spi/nonverbal/rate-and-work?mode=untimed-learning'

function renderSampleRunner() {
  return renderWithAppProviders(
    <Routes>
      <Route path="/practice/web-test/:family/:domain/:category" element={<WebTestRunnerEntryPage />} />
    </Routes>,
    { initialEntries: [SAMPLE_UNIT_PATH] },
  )
}

function stopwatchReadings(): Array<string | null> {
  return Array.from(document.querySelectorAll('.web-test-hub__stopwatch-readings dd')).map((element) => element.textContent)
}

function answerCurrentQuestion() {
  fireEvent.click(screen.getAllByRole('radio')[0]!)
  fireEvent.click(screen.getByRole('button', { name: '解答する' }))
  fireEvent.click(screen.getByRole('button', { name: '次の問題へ' }))
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('Web Test runner stopwatch', () => {
  it('stays off and shows no timings by default', async () => {
    renderSampleRunner()
    await screen.findByText('1／2 問目')

    expect(screen.getByRole('checkbox', { name: '時間を計る' })).not.toBeChecked()
    expect(screen.queryByText('この問題')).not.toBeInTheDocument()
    expect(screen.queryByText('累計')).not.toBeInTheDocument()
  })

  it('counts the current question and the unit once switched on', async () => {
    renderSampleRunner()
    await screen.findByText('1／2 問目')
    vi.useFakeTimers()

    fireEvent.click(screen.getByRole('checkbox', { name: '時間を計る' }))
    expect(stopwatchReadings()).toEqual(['00:00', '00:00'])

    act(() => { vi.advanceTimersByTime(3_000) })
    expect(stopwatchReadings()).toEqual(['00:03', '00:03'])
    expect(window.localStorage.getItem(WEB_TEST_STOPWATCH_STORAGE_KEY)).toBe('on')
  })

  it('shows its own question time in feedback and restarts the question clock while the unit clock continues', async () => {
    renderSampleRunner()
    await screen.findByText('1／2 問目')
    vi.useFakeTimers()

    fireEvent.click(screen.getByRole('checkbox', { name: '時間を計る' }))
    act(() => { vi.advanceTimersByTime(42_000) })
    fireEvent.click(screen.getAllByRole('radio')[0]!)
    fireEvent.click(screen.getByRole('button', { name: '解答する' }))

    expect(screen.getByText('この問題の解答時間：00:42')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '次の問題へ' }))
    expect(screen.getByText('2／2 問目')).toBeInTheDocument()
    expect(stopwatchReadings()).toEqual(['00:00', '00:42'])
  })

  it('keeps working when the stored preference cannot be read or written', async () => {
    const originalGetItem = Storage.prototype.getItem
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
      if (key === WEB_TEST_STOPWATCH_STORAGE_KEY) throw new Error('storage blocked')
      return originalGetItem.call(this, key)
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === WEB_TEST_STOPWATCH_STORAGE_KEY) throw new Error('storage blocked')
      originalSetItem.call(this, key, value)
    })

    renderSampleRunner()
    await screen.findByText('1／2 問目')

    const toggle = screen.getByRole('checkbox', { name: '時間を計る' })
    expect(toggle).not.toBeChecked()
    fireEvent.click(toggle)
    expect(toggle).toBeChecked()
    expect(screen.getByText('この問題')).toBeInTheDocument()
  })

  it('resets the unit clock immediately when the unit restarts', async () => {
    renderSampleRunner()
    await screen.findByText('1／2 問目')
    vi.useFakeTimers()

    fireEvent.click(screen.getByRole('checkbox', { name: '時間を計る' }))
    act(() => { vi.advanceTimersByTime(3_000) })
    // Finish both questions, then restart well inside the next interval tick.
    answerCurrentQuestion()
    answerCurrentQuestion()
    fireEvent.click(screen.getByRole('button', { name: 'もう一度解く' }))
    await act(async () => {})

    expect(screen.getByText('1／2 問目')).toBeInTheDocument()
    expect(stopwatchReadings()).toEqual(['00:00', '00:00'])
  })

  it('does not report an answer time when the stopwatch was switched on after submitting', async () => {
    renderSampleRunner()
    await screen.findByText('1／2 問目')
    vi.useFakeTimers()

    fireEvent.click(screen.getAllByRole('radio')[0]!)
    fireEvent.click(screen.getByRole('button', { name: '解答する' }))
    expect(screen.queryByText(/この問題の解答時間/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: '時間を計る' }))
    act(() => { vi.advanceTimersByTime(2_000) })
    expect(screen.queryByText(/この問題の解答時間/)).not.toBeInTheDocument()
    expect(stopwatchReadings()).toEqual(['00:02', '00:02'])
  })

  it('starts the next question clock at the transition rather than at the next tick', async () => {
    renderSampleRunner()
    await screen.findByText('1／2 問目')
    vi.useFakeTimers()

    fireEvent.click(screen.getByRole('checkbox', { name: '時間を計る' }))
    act(() => { vi.advanceTimersByTime(3_000) })
    fireEvent.click(screen.getAllByRole('radio')[0]!)
    fireEvent.click(screen.getByRole('button', { name: '解答する' }))
    fireEvent.click(screen.getByRole('button', { name: '次の問題へ' }))

    act(() => { vi.advanceTimersByTime(1_500) })
    // 1.5 s into question 2 the question clock reads 00:01; the unit keeps 00:04.
    expect(stopwatchReadings()).toEqual(['00:01', '00:04'])
  })

  it('removes the stopwatch once the unit is finished', async () => {
    renderSampleRunner()
    await screen.findByText('1／2 問目')
    vi.useFakeTimers()

    fireEvent.click(screen.getByRole('checkbox', { name: '時間を計る' }))
    answerCurrentQuestion()
    answerCurrentQuestion()

    expect(screen.getByRole('heading', { name: '練習が終わりました' })).toBeInTheDocument()
    expect(screen.queryByText('この問題')).not.toBeInTheDocument()
    expect(screen.queryByText('累計')).not.toBeInTheDocument()
  })

  it('owns one interval for the timed question and clears it on unmount', () => {
    vi.useFakeTimers()
    const handleRef: { current: WebTestStopwatchHandle | null } = { current: null }
    const view = render(
      <WebTestStopwatch enabled onEnabledChange={() => {}} questionKey="q1" handleRef={handleRef} />,
    )

    expect(vi.getTimerCount()).toBe(1)
    act(() => { vi.advanceTimersByTime(1_500) })
    expect(document.querySelectorAll('.web-test-hub__stopwatch-readings dd')[0]?.textContent).toBe('00:01')
    expect(handleRef.current?.questionElapsedMs()).toBe(1_500)

    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
