import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithAppProviders } from '../test/appProviders'
import { WebTestRunnerEntryPage } from './WebTestHubPage'
import { WEB_TEST_STOPWATCH_STORAGE_KEY } from '../components/WebTestStopwatch'

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

  it('shows the answered question time and restarts the question clock while the unit clock continues', async () => {
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
})
