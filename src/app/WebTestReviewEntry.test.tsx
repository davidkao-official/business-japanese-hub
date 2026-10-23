import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router-dom'
import { WebTestFamilyPage, WebTestHubPage } from './WebTestHubPage'
import { renderWithAppProviders } from '../test/appProviders'
import type { PracticeLearningSnapshot, PracticeReviewItem } from '../lib/learning/practiceMyLearning'
import { FREE_SPI_SAMPLE_CONTENT_ID, FREE_SPI_SAMPLE_REVISION } from '../practice-web-test/freeSample'

const user = { id: 'learner-a', email: 'learner@example.test' }
const review: PracticeReviewItem = {
  contentId: FREE_SPI_SAMPLE_CONTENT_ID,
  contentRevision: FREE_SPI_SAMPLE_REVISION,
  questionId: 'saved-mistake',
  questionVersion: 2,
  testFamily: 'spi',
  domain: 'verbal',
  category: 'vocabulary-in-context',
  practiceMode: 'untimed-learning',
  createdAt: '2026-10-23T00:00:00.000Z',
}

function response(items: PracticeReviewItem[] = []) {
  const snapshot: PracticeLearningSnapshot = {
    recentAttempts: [],
    actionableMistakes: items,
    weakArea: null,
    nextAction: items[0] ? { kind: 'review-mistake', item: items[0] } : { kind: 'start-practice' },
  }
  return new Response(JSON.stringify({ source: 'practice-web-test', snapshot }), { status: 200 })
}

function renderHub(path = '/practice/web-test', session: typeof user | null = user) {
  return renderWithAppProviders(<Routes>
    <Route path="/practice/web-test" element={<WebTestHubPage />} />
    <Route path="/practice/web-test/:family" element={<WebTestFamilyPage />} />
  </Routes>, { initialEntries: [path], session })
}

function reviewEntry() {
  return within(screen.getByRole('region', { name: '間違えた問題・復習' }))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('Web Test hub review entry', () => {
  it.each(['/practice/web-test', '/practice/web-test/spi'])('offers the existing sign-in flow without a queue request at %s', async (path) => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    renderHub(path, null)

    expect(await reviewEntry().findByText('解答の保存と、間違えた問題の復習にはログインが必要です。')).toBeInTheDocument()
    expect(reviewEntry().getByRole('link', { name: 'ログインして復習する' })).toHaveAttribute('href', '/my-learning')
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getAllByRole('link', { name: /言語・非言語から選ぶ|公開中の単元を見る/ }).length).toBeGreaterThan(0)
  })

  it('keeps practice navigation available while loading and after a queue error', async () => {
    let resolve!: (value: Response) => void
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test')
    const fetch = vi.fn(() => new Promise<Response>((done) => { resolve = done }))
    vi.stubGlobal('fetch', fetch)
    renderHub()

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    expect(reviewEntry().getByRole('status')).toHaveTextContent('復習リストを読み込んでいます。')
    expect(screen.getByRole('link', { name: /言語・非言語から選ぶ/ })).toBeInTheDocument()

    await act(async () => { resolve(new Response('', { status: 503 })) })
    expect(reviewEntry().getByRole('status')).toHaveTextContent('復習リストを読み込めません。')
    expect(reviewEntry().queryByText(/保存済みの間違えた問題：/)).not.toBeInTheDocument()
    expect(reviewEntry().getByRole('link', { name: '学習記録を開く' })).toHaveAttribute('href', '/my-learning')
    expect(screen.getByRole('link', { name: /言語・非言語から選ぶ/ })).toBeInTheDocument()
  })

  it('shows a truthful empty state for a signed-in Free account', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()))
    renderHub()

    expect(await reviewEntry().findByText('現在確認できる、保存済みの間違えた問題はありません。分野を選んで練習しましょう。')).toBeInTheDocument()
    expect(reviewEntry().queryByRole('link')).not.toBeInTheDocument()
    expect(reviewEntry().queryByText(/保存済みの間違えた問題：|正答率|連続|mastery|streak/i)).not.toBeInTheDocument()
  })

  it.each(['/practice/web-test', '/practice/web-test/spi'])('shows the real queue count and links to the existing practice review section at %s', async (path) => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test')
    const fetch = vi.fn().mockResolvedValue(response([review, { ...review, questionId: 'another-mistake' }]))
    vi.stubGlobal('fetch', fetch)
    renderHub(path)

    expect(await reviewEntry().findByText('保存済みの間違えた問題：2問')).toBeInTheDocument()
    expect(reviewEntry().getByText('復習リストには最新50問まで表示されます。')).toBeInTheDocument()
    expect(reviewEntry().getByRole('link', { name: '学習記録で間違えた問題を復習する' }))
      .toHaveAttribute('href', '/my-learning#my-learning-review-title')
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith('https://functions.example.test/my-learning', expect.objectContaining({
      method: 'GET', cache: 'no-store', headers: { Authorization: expect.stringMatching(/^Bearer /) },
    }))
  })

  it('shows the sign-in prompt when the authenticated read returns an expired session', async () => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })))
    renderHub()
    expect(await reviewEntry().findByRole('link', { name: 'ログインして復習する' })).toHaveAttribute('href', '/my-learning')
    expect(reviewEntry().queryByText(/保存済みの間違えた問題：/)).not.toBeInTheDocument()
  })

  it('discards the previous account count and ignores a late response after sign-out', async () => {
    let resolveB!: (value: Response) => void
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test')
    const fetch = vi.fn().mockResolvedValueOnce(response([review]))
      .mockImplementationOnce(() => new Promise<Response>((done) => { resolveB = done }))
    vi.stubGlobal('fetch', fetch)
    const rendered = renderHub()
    await reviewEntry().findByText('保存済みの間違えた問題：1問')

    act(() => rendered.authClient.emitAuthStateChange({ id: 'learner-b', email: 'b@example.test' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(reviewEntry().getByRole('status')).toHaveTextContent('復習リストを読み込んでいます。')
    expect(reviewEntry().queryByText(/保存済みの間違えた問題：/)).not.toBeInTheDocument()

    act(() => rendered.authClient.emitAuthStateChange(null))
    await act(async () => { resolveB(response([review])) })
    expect(reviewEntry().getByRole('link', { name: 'ログインして復習する' })).toBeInTheDocument()
    expect(reviewEntry().queryByText(/保存済みの間違えた問題：/)).not.toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
