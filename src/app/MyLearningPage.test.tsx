import { act, cleanup, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MyLearningPage } from './MyLearningPage'
import { renderWithAppProviders } from '../test/appProviders'
import type {
  PracticeLearningSnapshot,
  PracticeReviewItem,
} from '../lib/learning/practiceMyLearning'
import type { PracticeLearningFetchResult } from '../lib/learning/practiceMyLearningClient'

const revision = '62361e0be9ecc7792a55c0a670bc126621eaea4196fd8407ded2882cf342506c'

const review: PracticeReviewItem = {
  contentId: 'practice-web-test-spi-v1',
  contentRevision: revision,
  questionId: 'question-1',
  questionVersion: 2,
  testFamily: 'spi',
  domain: 'verbal',
  category: 'vocabulary-in-context',
  practiceMode: 'untimed-learning',
  createdAt: '2026-09-19T00:01:00.000Z',
}

function snapshot(overrides: Partial<PracticeLearningSnapshot> = {}): PracticeLearningSnapshot {
  return {
    recentAttempts: [],
    actionableMistakes: [],
    weakArea: null,
    nextAction: { kind: 'start-practice' },
    ...overrides,
  }
}

function mockSnapshot(value: PracticeLearningSnapshot): void {
  vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', 'https://functions.example.test')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ source: 'practice-web-test', snapshot: value }), { status: 200 })))
}

function continuationSnapshot(category: string): PracticeLearningSnapshot {
  const item = { ...review, category }
  return snapshot({
    recentAttempts: [{ ...item, correct: true }],
    nextAction: { kind: 'continue-practice', item },
  })
}

describe('My Learning page', () => {
  it('shows a sign-in direction without requesting member evidence when signed out', async () => {
    renderWithAppProviders(<MyLearningPage />)

    await waitFor(() => expect(screen.getByRole('heading', { name: '登入後查看你的學習紀錄' })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: '前往 Web Test 練習入口' })).toHaveAttribute('href', '/practice/web-test')
  })

  it('shows a useful active-member empty state without fake statistics', async () => {
    mockSnapshot(snapshot())
    renderWithAppProviders(<MyLearningPage />, {
      session: { id: 'member-1', email: 'member@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })

    await waitFor(() => expect(screen.getByRole('heading', { name: '從下一題開始建立你的學習紀錄' })).toBeInTheDocument())
    expect(screen.getByText('目前還沒有已儲存的 Practice 作答。')).toBeInTheDocument()
    expect(screen.queryByText(/正答率|弱點|連續|百分位/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '開始 Web Test 練習' })).toHaveAttribute('href', '/practice/web-test')
  })

  it('does not render a loaded user A snapshot after an in-place switch to user B', async () => {
    const fetchSnapshot = vi.fn()
      .mockResolvedValueOnce({ kind: 'ok' as const, snapshot: continuationSnapshot('vocabulary-in-context') })
      .mockImplementationOnce(() => new Promise<PracticeLearningFetchResult>(() => {}))
    const rendered = renderWithAppProviders(<MyLearningPage fetchSnapshot={fetchSnapshot} />, {
      session: { id: 'member-a', email: 'a@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })

    await waitFor(() => expect(screen.getAllByText('文脈語彙').length).toBeGreaterThan(0))
    act(() => rendered.authClient.emitAuthStateChange({ id: 'member-b', email: 'b@example.com' }))
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(2))

    expect(screen.queryByText('文脈語彙')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '載入你的學習紀錄' })).toBeInTheDocument()
  })

  it('ignores a late user A result after the page switches to user B', async () => {
    let resolveA!: (result: PracticeLearningFetchResult) => void
    const requestA = new Promise<PracticeLearningFetchResult>((resolve) => { resolveA = resolve })
    const fetchSnapshot = vi.fn()
      .mockImplementationOnce(() => requestA)
      .mockResolvedValueOnce({ kind: 'ok' as const, snapshot: continuationSnapshot('semantic-relation') })
    const rendered = renderWithAppProviders(<MyLearningPage fetchSnapshot={fetchSnapshot} />, {
      session: { id: 'member-a', email: 'a@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })

    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(1))
    act(() => rendered.authClient.emitAuthStateChange({ id: 'member-b', email: 'b@example.com' }))
    await waitFor(() => expect(screen.getAllByText('語句關係').length).toBeGreaterThan(0))
    act(() => resolveA({ kind: 'ok', snapshot: continuationSnapshot('vocabulary-in-context') }))
    await Promise.resolve()

    expect(screen.getAllByText('語句關係').length).toBeGreaterThan(0)
    expect(screen.queryByText('文脈語彙')).not.toBeInTheDocument()
  })

  it('surfaces a persisted mistake as the primary exact review action', async () => {
    mockSnapshot(snapshot({
      recentAttempts: [{ ...review, correct: false }],
      actionableMistakes: [review],
      nextAction: { kind: 'review-mistake', item: review },
    }))
    renderWithAppProviders(<MyLearningPage />, {
      session: { id: 'member-1', email: 'member@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })

    await waitFor(() => expect(screen.getAllByRole('link', { name: '複習這一題' })[0]).toBeInTheDocument())
    expect(screen.getByText('最近答錯的題目')).toBeInTheDocument()
    expect(screen.getAllByText('文脈語彙').length).toBeGreaterThan(0)
    expect(screen.queryByText('vocabulary-in-context')).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: '複習這一題' })[0]).toHaveAttribute(
      'href',
      '/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning&review=question-1&reviewVersion=2',
    )
  })

  it('uses a deterministic current-category continuation when no mistake is actionable', async () => {
    const continuation = { ...review, correct: true }
    mockSnapshot(snapshot({
      recentAttempts: [continuation],
      nextAction: { kind: 'continue-practice', item: review },
      weakArea: null,
    }))
    renderWithAppProviders(<MyLearningPage />, {
      session: { id: 'member-1', email: 'member@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })

    await waitFor(() => expect(screen.getByRole('link', { name: '繼續這個類別' })).toBeInTheDocument())
    expect(screen.getByText('接著練習「文脈語彙」；系統沒有保存單一 session 位置。')).toBeInTheDocument()
    expect(screen.queryByText(/vocabulary-in-context/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '繼續這個類別' })).toHaveAttribute(
      'href',
      '/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning',
    )
  })

  it('states when weak-area evidence is insufficient', async () => {
    mockSnapshot(snapshot({ recentAttempts: [{ ...review, correct: false }] }))
    renderWithAppProviders(<MyLearningPage />, {
      session: { id: 'member-1', email: 'member@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })

    await waitFor(() => expect(screen.getByText('目前的作答樣本還不足以支持分類訊號。')).toBeInTheDocument())
  })

  it('renders the weak-area label from the discovery catalog', async () => {
    mockSnapshot(snapshot({
      recentAttempts: [{ ...review, correct: false }],
      weakArea: {
        domain: 'verbal',
        category: 'vocabulary-in-context',
        sampleCount: 5,
        incorrectCount: 2,
        accuracyPercent: 60,
        latestAt: review.createdAt,
      },
    }))
    renderWithAppProviders(<MyLearningPage />, {
      session: { id: 'member-1', email: 'member@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })

    await waitFor(() => expect(screen.getByText('文脈語彙：最近 5 題中有 2 題答錯，正答率 60%。')).toBeInTheDocument())
    expect(screen.queryByText(/vocabulary-in-context/)).not.toBeInTheDocument()
  })

  it('does not expose an unresolved category slug in user-facing copy', async () => {
    const unknown = { ...review, category: 'internal-only-category' }
    mockSnapshot(snapshot({
      recentAttempts: [{ ...unknown, correct: true }],
      nextAction: { kind: 'continue-practice', item: unknown },
    }))
    renderWithAppProviders(<MyLearningPage />, {
      session: { id: 'member-1', email: 'member@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })

    await waitFor(() => expect(screen.getByText('目前分類')).toBeInTheDocument())
    expect(screen.getAllByText('目前分類').length).toBeGreaterThan(0)
    expect(screen.queryByText(/internal-only-category/)).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('這筆紀錄目前無法安全開啟，請從最新的 Web Test 入口選擇練習範圍。')
  })

  it('shows the endpoint non-member state when membership access is cached as active', async () => {
    const fetchSnapshot = vi.fn().mockResolvedValue({ kind: 'non-member' as const })
    renderWithAppProviders(<MyLearningPage fetchSnapshot={fetchSnapshot} />, {
      session: { id: 'member-1', email: 'member@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })

    await waitFor(() => expect(screen.getByRole('heading', { name: 'My Learning 是 Plus 會員學習紀錄' })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: '了解 Plus' })).toHaveAttribute('href', '/plus')
    expect(screen.queryByRole('heading', { name: '學習紀錄暫時無法取得' })).not.toBeInTheDocument()
  })

  it('shows the endpoint signed-out state when auth still has a cached user', async () => {
    const fetchSnapshot = vi.fn().mockResolvedValue({ kind: 'signed-out' as const })
    renderWithAppProviders(<MyLearningPage fetchSnapshot={fetchSnapshot} />, {
      session: { id: 'member-1', email: 'member@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })

    await waitFor(() => expect(screen.getByRole('heading', { name: '登入後查看你的學習紀錄' })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: '前往 Web Test 練習入口' })).toHaveAttribute('href', '/practice/web-test')
    expect(screen.queryByRole('heading', { name: '學習紀錄暫時無法取得' })).not.toBeInTheDocument()
  })

  it('renders membership and endpoint failures as truthful recovery states', async () => {
    const membership = { getAccess: vi.fn().mockResolvedValue('non-member') }
    renderWithAppProviders(<MyLearningPage />, {
      session: { id: 'member-1', email: 'member@example.com' },
      membershipAccessRepository: membership,
    })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'My Learning 是 Plus 會員學習紀錄' })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: '了解 Plus' })).toHaveAttribute('href', '/plus')

    cleanup()
    const fetchSnapshot = vi.fn().mockResolvedValue({ kind: 'unavailable' as const })
    renderWithAppProviders(<MyLearningPage fetchSnapshot={fetchSnapshot} />, {
      session: { id: 'member-1', email: 'member@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('heading', { name: '學習紀錄暫時無法取得' })).toBeInTheDocument())
    expect(fetchSnapshot).toHaveBeenCalled()
  })
})
