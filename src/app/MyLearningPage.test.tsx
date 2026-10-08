import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MyLearningPage } from './MyLearningPage'
import { renderWithAppProviders } from '../test/appProviders'
import { getActiveLocale } from '../i18n/strings'
import type {
  PracticeLearningSnapshot,
  PracticeReviewItem,
} from '../lib/learning/practiceMyLearning'
import type { PracticeLearningFetchResult } from '../lib/learning/practiceMyLearningClient'
import type { ReadingSave, ReadingSavesResult } from '../reading/savesClient'
import { sampleReadingItem } from '../reading/fixtures/sample-reading'
import type { WorkplaceSave, WorkplaceSavesResult } from '../workplace-learn/savesClient'
import { sampleWorkplaceLearnItem } from '../workplace-learn/sample'

const hookLearningUiOverrides = vi.hoisted(() => ({
  current: null as Partial<import('../i18n/learningUi').LearningUiStrings> | null,
}))
vi.mock('../i18n/strings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../i18n/strings')>()
  return {
    ...actual,
    useStrings: (...args: Parameters<typeof actual.useStrings>) => {
      const strings = actual.useStrings(...args)
      const overrides = hookLearningUiOverrides.current
      return overrides ? { ...strings, learningUi: { ...strings.learningUi, ...overrides } } : strings
    },
  }
})

afterEach(() => {
  hookLearningUiOverrides.current = null
})

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
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    const body = url.includes('/reading-saves') || url.includes('/workplace-saves')
      ? { items: [] }
      : { source: 'practice-web-test', snapshot: value }
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
  }))
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

    await waitFor(() => expect(screen.getByRole('heading', { name: "ログインして学習記録を確認" })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: "Web テストを練習する" })).toHaveAttribute('href', '/practice/web-test')
  })

  it('shows a useful active-member empty state without fake statistics', async () => {
    mockSnapshot(snapshot())
    renderWithAppProviders(<MyLearningPage />, {
      session: { id: 'member-1', email: 'member@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })

    await waitFor(() => expect(screen.getByRole('heading', { name: "最初の一問から、記録を始めましょう" })).toBeInTheDocument())
    expect(screen.getByText("保存済みの解答はまだありません。")).toBeInTheDocument()
    expect(screen.queryByText(/正答率|弱點|連續|百分位/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: "Web テストを始める" })).toHaveAttribute('href', '/practice/web-test')
  })

  it('keeps the page shell around a ready snapshot', async () => {
    mockSnapshot(snapshot())
    renderWithAppProviders(<MyLearningPage />, {
      session: { id: 'member-1', email: 'member@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })

    await waitFor(() => expect(screen.getByRole('link', { name: "Web テストを始める" })).toBeInTheDocument())
    expect(screen.getByRole('heading', { level: 1, name: "前回の学びを、次の練習へ" })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 }).closest('section')).toHaveClass('page', 'my-learning-page')
  })

  it('does not render a loaded user A snapshot after an in-place switch to user B', async () => {
    const fetchSnapshot = vi.fn()
      .mockResolvedValueOnce({ kind: 'ok' as const, snapshot: continuationSnapshot('vocabulary-in-context') })
      .mockImplementationOnce(() => new Promise<PracticeLearningFetchResult>(() => {}))
    const rendered = renderWithAppProviders(<MyLearningPage fetchSnapshot={fetchSnapshot} />, {
      session: { id: 'member-a', email: 'a@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })

    await waitFor(() => expect(screen.getAllByText("文脈と語句の意味").length).toBeGreaterThan(0))
    act(() => rendered.authClient.emitAuthStateChange({ id: 'member-b', email: 'b@example.com' }))
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalledTimes(2))

    expect(fetchSnapshot).toHaveBeenNthCalledWith(1, expect.any(Function), 'member-a')
    expect(fetchSnapshot).toHaveBeenNthCalledWith(2, expect.any(Function), 'member-b')

    expect(screen.queryByText("文脈と語句の意味")).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: "学習記録を読み込んでいます" })).toBeInTheDocument()
  })

  it('binds membership access to the current owner during an in-place A to B switch', async () => {
    const getAccess = vi.fn().mockResolvedValue('active')
    const rendered = renderWithAppProviders(<MyLearningPage fetchSnapshot={vi.fn().mockResolvedValue({ kind: 'unavailable' })} />, {
      session: { id: 'member-a', email: 'a@example.com' },
      membershipAccessRepository: { getAccess },
    })

    await waitFor(() => expect(getAccess).toHaveBeenCalledTimes(1))
    act(() => rendered.authClient.emitAuthStateChange({ id: 'member-b', email: 'b@example.com' }))
    await waitFor(() => expect(getAccess).toHaveBeenCalledTimes(2))

    expect(getAccess).toHaveBeenNthCalledWith(1, 'member-a')
    expect(getAccess).toHaveBeenNthCalledWith(2, 'member-b')
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
    await waitFor(() => expect(screen.getAllByText("二語の関係").length).toBeGreaterThan(0))
    act(() => resolveA({ kind: 'ok', snapshot: continuationSnapshot('vocabulary-in-context') }))
    await Promise.resolve()

    expect(screen.getAllByText("二語の関係").length).toBeGreaterThan(0)
    expect(screen.queryByText("文脈と語句の意味")).not.toBeInTheDocument()
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

    await waitFor(() => expect(screen.getAllByRole('link', { name: "この問題を復習" })[0]).toBeInTheDocument())
    expect(screen.getByText("最近間違えた問題")).toBeInTheDocument()
    expect(screen.queryByText(/#117/)).not.toBeInTheDocument()
    expect(screen.getAllByText("文脈と語句の意味").length).toBeGreaterThan(0)
    expect(screen.queryByText('vocabulary-in-context')).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: "この問題を復習" })[0]).toHaveAttribute(
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

    await waitFor(() => expect(screen.getByRole('link', { name: "この単元を練習" })).toBeInTheDocument())
    expect(screen.getByText("「文脈と語句の意味」を練習しましょう。前回の途中位置からの再開には対応していません。")).toBeInTheDocument()
    expect(screen.queryByText(/vocabulary-in-context/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: "この単元を練習" })).toHaveAttribute(
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

    await waitFor(() => expect(screen.getByText("分野ごとの傾向を示すには、まだ解答数が足りません。")).toBeInTheDocument())
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

    await waitFor(() => expect(screen.getByText("文脈と語句の意味：最近の 5 問中 2 問が不正解（正答率 60%）。")).toBeInTheDocument())
    expect(screen.queryByText(/vocabulary-in-context/)).not.toBeInTheDocument()
  })

  it('keeps a known category label for an immutable attempt from an earlier release', async () => {
    const earlierReleaseAttempt = {
      ...review,
      contentRevision: 'a'.repeat(64),
      correct: true,
    }
    mockSnapshot(snapshot({ recentAttempts: [earlierReleaseAttempt] }))
    renderWithAppProviders(<MyLearningPage />, {
      session: { id: 'member-1', email: 'member@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })

    await waitFor(() => expect(screen.getByText("文脈と語句の意味")).toBeInTheDocument())
    expect(screen.queryByText("この単元")).not.toBeInTheDocument()
    expect(screen.getByText("公開中の単元を選び、解答を積み重ねましょう。")).toBeInTheDocument()
    expect(screen.queryByText('完成一題後，這裡才會出現你的實際作答紀錄。')).not.toBeInTheDocument()
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

    await waitFor(() => expect(screen.getByText("この単元")).toBeInTheDocument())
    expect(screen.getAllByText("この単元").length).toBeGreaterThan(0)
    expect(screen.queryByText(/internal-only-category/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('status').some((status) => status.textContent?.includes("この記録の問題は現在開けません。Web テストの一覧から、練習する単元を選んでください。"))).toBe(true)
  })

  it('uses the hook-supplied UI snapshot for a primary review action', async () => {
    hookLearningUiOverrides.current = {
      myReviewTitle: 'Hook snapshot review title',
      myReviewBody: 'Hook snapshot review body',
      myReviewQuestion: 'Hook snapshot review action',
    }
    mockSnapshot(snapshot({
      recentAttempts: [{ ...review, correct: false }],
      actionableMistakes: [review],
      nextAction: { kind: 'review-mistake', item: review },
    }))
    renderWithAppProviders(<MyLearningPage />, {
      session: { id: 'member-1', email: 'member@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Hook snapshot review title' })).toBeInTheDocument())
    expect(screen.getByText('Hook snapshot review body')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Hook snapshot review action' })[0]).toHaveAttribute(
      'href',
      '/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning&review=question-1&reviewVersion=2',
    )
    expect(getActiveLocale()).toBe('ja')
  })

  it('uses the hook-supplied snapshot for continuation text and unknown-category summaries', async () => {
    hookLearningUiOverrides.current = {
      myContinueTitle: 'Hook snapshot continue title',
      myContinueAction: 'Hook snapshot continue action',
      myContinueBody: (category) => `Hook snapshot continue body for ${category}`,
      myUnknownCategory: 'Hook snapshot unknown category',
      myWeakAreaSummary: (category, sampleCount, incorrectCount, accuracyPercent) =>
        `Hook snapshot weak area: ${category}; ${sampleCount} answers; ${incorrectCount} incorrect; ${accuracyPercent}%`,
    }
    const unknown = { ...review, category: 'future-category' }
    mockSnapshot(snapshot({
      recentAttempts: [{ ...review, correct: true }],
      actionableMistakes: [unknown],
      nextAction: { kind: 'continue-practice', item: review },
      weakArea: {
        domain: 'verbal',
        category: 'future-category',
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

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Hook snapshot continue title' })).toBeInTheDocument())
    expect(screen.getByText('Hook snapshot continue body for 文脈と語句の意味')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Hook snapshot continue action' })).toHaveAttribute(
      'href',
      '/practice/web-test/spi/verbal/vocabulary-in-context?mode=untimed-learning',
    )
    expect(screen.getAllByText('Hook snapshot unknown category').length).toBeGreaterThan(0)
    expect(screen.getByText('Hook snapshot weak area: Hook snapshot unknown category; 5 answers; 2 incorrect; 60%')).toBeInTheDocument()
    expect(screen.queryByText('future-category')).not.toBeInTheDocument()
    expect(getActiveLocale()).toBe('ja')
  })

  it('shows the endpoint non-member state when membership access is cached as active', async () => {
    const fetchSnapshot = vi.fn().mockResolvedValue({ kind: 'non-member' as const })
    renderWithAppProviders(<MyLearningPage fetchSnapshot={fetchSnapshot} />, {
      session: { id: 'member-1', email: 'member@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })

    await waitFor(() => expect(screen.getByRole('heading', { name: "学習記録は Plus 会員向けの機能です" })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: "Plus について" })).toHaveAttribute('href', '/plus')
    expect(screen.queryByRole('heading', { name: "解答記録を読み込めません" })).not.toBeInTheDocument()
  })

  it('shows the endpoint signed-out state when auth still has a cached user', async () => {
    const fetchSnapshot = vi.fn().mockResolvedValue({ kind: 'signed-out' as const })
    renderWithAppProviders(<MyLearningPage fetchSnapshot={fetchSnapshot} />, {
      session: { id: 'member-1', email: 'member@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })

    await waitFor(() => expect(screen.getByRole('heading', { name: "ログインして学習記録を確認" })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: "Web テストを練習する" })).toHaveAttribute('href', '/practice/web-test')
    expect(screen.queryByRole('heading', { name: "解答記録を読み込めません" })).not.toBeInTheDocument()
  })

  it('renders membership and endpoint failures as truthful recovery states', async () => {
    const membership = { getAccess: vi.fn().mockResolvedValue('non-member') }
    renderWithAppProviders(<MyLearningPage />, {
      session: { id: 'member-1', email: 'member@example.com' },
      membershipAccessRepository: membership,
    })
    await waitFor(() => expect(screen.getByRole('heading', { name: "学習記録は Plus 会員向けの機能です" })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: "Plus について" })).toHaveAttribute('href', '/plus')

    cleanup()
    const fetchSnapshot = vi.fn().mockResolvedValue({ kind: 'unavailable' as const })
    renderWithAppProviders(<MyLearningPage fetchSnapshot={fetchSnapshot} />, {
      session: { id: 'member-1', email: 'member@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })
    await waitFor(() => expect(fetchSnapshot).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('heading', { name: "解答記録を読み込めません" })).toBeInTheDocument())
    expect(fetchSnapshot).toHaveBeenCalled()
  })

  it('shows only current catalog Reading links and lets a stale save be removed by ID', async () => {
    const staleId = 'retired-private-id'
    const items: ReadingSave[] = [
      { itemId: sampleReadingItem.id, revision: null, savedAt: '2026-09-19T10:00:00.000Z' },
      { itemId: staleId, revision: 'a'.repeat(64), savedAt: '2026-09-18T10:00:00.000Z' },
    ]
    const fetchSaves = vi.fn()
      .mockResolvedValueOnce({ kind: 'ok' as const, items })
      .mockResolvedValueOnce({ kind: 'ok' as const, items: items.slice(0, 1) })
    const deleteSave = vi.fn(async () => ({ kind: 'ok' as const }))
    renderWithAppProviders(<MyLearningPage fetchSnapshot={vi.fn().mockResolvedValue({ kind: 'ok', snapshot: snapshot() })} fetchSaves={fetchSaves} deleteSave={deleteSave} />, {
      session: { id: 'member-1', email: 'member@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })
    const sampleLink = await screen.findByRole('link', { name: sampleReadingItem.title })
    expect(sampleLink).toHaveAttribute('href', `/read/${sampleReadingItem.slug}`)
    expect(screen.getByText("この保存済みの項目は、現在開けません。")).toBeInTheDocument()
    expect(screen.queryByText(staleId)).not.toBeInTheDocument()
    expect(screen.queryByText('a'.repeat(64))).not.toBeInTheDocument()
    const removeButtons = screen.getAllByRole('button', { name: "保存を解除" })
    fireEvent.click(removeButtons[1]!)
    await waitFor(() => expect(deleteSave).toHaveBeenCalledWith(staleId, expect.any(Function), 'member-1', expect.any(AbortSignal)))
    await waitFor(() => expect(screen.queryByText("この保存済みの項目は、現在開けません。")).not.toBeInTheDocument())
  })

  it('refetches the capped list after removal so the next older save appears', async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => ({
      itemId: `retired-reading-${index}`,
      revision: 'c'.repeat(64),
      savedAt: '2026-09-20T10:00:00.000Z',
    }))
    const nextPage = [
      ...firstPage.slice(1),
      { itemId: sampleReadingItem.id, revision: null, savedAt: '2026-08-01T10:00:00.000Z' },
    ]
    const fetchSaves = vi.fn()
      .mockResolvedValueOnce({ kind: 'ok' as const, items: firstPage })
      .mockResolvedValueOnce({ kind: 'ok' as const, items: nextPage })
    const deleteSave = vi.fn().mockResolvedValue({ kind: 'ok' as const })
    renderWithAppProviders(<MyLearningPage fetchSnapshot={vi.fn().mockResolvedValue({ kind: 'ok', snapshot: snapshot() })} fetchSaves={fetchSaves} deleteSave={deleteSave} />, {
      session: { id: 'member-1', email: 'member@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })
    expect(await screen.findAllByText("この保存済みの項目は、現在開けません。")).toHaveLength(50)
    fireEvent.click(screen.getAllByRole('button', { name: "保存を解除" })[0]!)
    expect(await screen.findByRole('link', { name: sampleReadingItem.title })).toHaveAttribute('href', `/read/${sampleReadingItem.slug}`)
    expect(fetchSaves).toHaveBeenCalledTimes(2)
    expect(deleteSave).toHaveBeenCalledWith('retired-reading-0', expect.any(Function), 'member-1', expect.any(AbortSignal))
  })

  it('keeps Reading saves visible when the Practice evidence request fails', async () => {
    const fetchSnapshot = vi.fn().mockResolvedValue({ kind: 'unavailable' as const })
    const fetchSaves = vi.fn().mockResolvedValue({
      kind: 'ok' as const,
      items: [{ itemId: sampleReadingItem.id, revision: null, savedAt: '2026-09-19T10:00:00.000Z' }],
    })
    renderWithAppProviders(<MyLearningPage fetchSnapshot={fetchSnapshot} fetchSaves={fetchSaves} />, {
      session: { id: 'member-1', email: 'member@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })
    expect(await screen.findByRole('heading', { name: "解答記録を読み込めません" })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: sampleReadingItem.title })).toHaveAttribute('href', `/read/${sampleReadingItem.slug}`)
  })

  it('shows Reading empty and retryable error states independently', async () => {
    const fetchSaves = vi.fn()
      .mockResolvedValueOnce({ kind: 'unavailable' as const })
      .mockResolvedValueOnce({ kind: 'ok' as const, items: [] })
    renderWithAppProviders(<MyLearningPage fetchSnapshot={vi.fn().mockResolvedValue({ kind: 'ok', snapshot: snapshot() })} fetchSaves={fetchSaves} />, {
      session: { id: 'member-1', email: 'member@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })
    expect(await screen.findByText("保存した記事を読み込めません。")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('heading', { name: "最近保存した記事（最大 50 件）" }).closest('section')!.querySelector('button')!)
    expect(await screen.findByText("保存した記事はまだありません。")).toBeInTheDocument()
    expect(fetchSaves).toHaveBeenCalledTimes(2)
  })

  it('aborts prior Reading list work and ignores a late result after account switch', async () => {
    let resolveA!: (result: ReadingSavesResult) => void
    let signalA: AbortSignal | undefined
    const requestA = new Promise<ReadingSavesResult>((resolve) => { resolveA = resolve })
    const fetchSaves = vi.fn((_token: () => Promise<string | null>, ownerId: string, signal?: AbortSignal) => {
      if (ownerId === 'member-a') { signalA = signal; return requestA }
      return Promise.resolve({ kind: 'ok' as const, items: [] })
    })
    const rendered = renderWithAppProviders(<MyLearningPage fetchSnapshot={vi.fn().mockImplementation(() => new Promise(() => {}))} fetchSaves={fetchSaves} />, {
      session: { id: 'member-a', email: 'a@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })
    await waitFor(() => expect(fetchSaves).toHaveBeenCalledTimes(1))
    act(() => rendered.authClient.emitAuthStateChange({ id: 'member-b', email: 'b@example.com' }))
    await waitFor(() => expect(fetchSaves).toHaveBeenCalledTimes(2))
    expect(signalA?.aborted).toBe(true)
    act(() => resolveA({ kind: 'ok', items: [{ itemId: sampleReadingItem.id, revision: null, savedAt: '2026-09-19T10:00:00.000Z' }] }))
    await Promise.resolve()
    expect(screen.queryByRole('link', { name: sampleReadingItem.title })).not.toBeInTheDocument()
  })

  it('aborts Reading list work and clears saved state immediately on sign-out', async () => {
    let resolveList!: (result: ReadingSavesResult) => void
    let listSignal: AbortSignal | undefined
    const fetchSaves = vi.fn((_token: () => Promise<string | null>, _ownerId: string, signal?: AbortSignal) => {
      listSignal = signal
      return new Promise<ReadingSavesResult>((resolve) => { resolveList = resolve })
    })
    const rendered = renderWithAppProviders(<MyLearningPage fetchSnapshot={vi.fn().mockImplementation(() => new Promise(() => {}))} fetchSaves={fetchSaves} />, {
      session: { id: 'member-a', email: 'a@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })
    await waitFor(() => expect(fetchSaves).toHaveBeenCalledTimes(1))
    act(() => rendered.authClient.emitAuthStateChange(null))
    await waitFor(() => expect(screen.getByRole('heading', { name: "ログインして学習記録を確認" })).toBeInTheDocument())
    expect(listSignal?.aborted).toBe(true)
    act(() => resolveList({ kind: 'ok', items: [{ itemId: sampleReadingItem.id, revision: null, savedAt: '2026-09-19T10:00:00.000Z' }] }))
    await Promise.resolve()
    expect(screen.queryByRole('link', { name: sampleReadingItem.title })).not.toBeInTheDocument()
  })

  it('clears the Reading list when the server reports membership unavailable', async () => {
    const fetchSaves = vi.fn().mockResolvedValue({ kind: 'forbidden' as const })
    renderWithAppProviders(<MyLearningPage fetchSnapshot={vi.fn().mockResolvedValue({ kind: 'ok', snapshot: snapshot() })} fetchSaves={fetchSaves} />, {
      session: { id: 'member-1', email: 'member@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })
    expect(await screen.findByText("現在、Plus の会員資格を確認できません。")).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: sampleReadingItem.title })).not.toBeInTheDocument()
  })

  it('links only current catalog-matched Workplace saves and lets stale preferences be removed', async () => {
    const active: WorkplaceSave = {
      itemId: sampleWorkplaceLearnItem.id, kind: 'lesson', revision: null,
      savedAt: '2026-09-20T10:00:00.000Z', current: true,
    }
    const stale: WorkplaceSave = {
      itemId: 'retired-workplace-lesson', kind: 'lesson', revision: 'f'.repeat(64),
      savedAt: '2026-09-19T10:00:00.000Z', current: false,
    }
    const fetchWorkplaceItems = vi.fn<(...args: Parameters<(typeof import('../workplace-learn/savesClient'))['fetchWorkplaceSaves']>) => Promise<WorkplaceSavesResult>>()
      .mockResolvedValueOnce({ kind: 'ok', items: [active, stale] })
      .mockResolvedValueOnce({ kind: 'ok', items: [active] })
    const deleteWorkplaceItem = vi.fn().mockResolvedValue({ kind: 'ok' as const })
    renderWithAppProviders(<MyLearningPage
      fetchSnapshot={vi.fn().mockResolvedValue({ kind: 'ok', snapshot: snapshot() })}
      fetchWorkplaceItems={fetchWorkplaceItems}
      deleteWorkplaceItem={deleteWorkplaceItem}
    />, {
      session: { id: 'member-1', email: 'member@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })

    expect(await screen.findByRole('link', { name: sampleWorkplaceLearnItem.title })).toHaveAttribute('href', `/learn/workplace/${sampleWorkplaceLearnItem.slug}`)
    expect(screen.getByText("この保存済みの項目は、現在開けません。")).toBeInTheDocument()
    expect(screen.getByText(/後で見返すために保存した教材です。学習の完了や理解度を示すものではありません。/)).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: "保存を解除" }).at(-1)!)
    await waitFor(() => expect(screen.queryByText("この保存済みの項目は、現在開けません。")).not.toBeInTheDocument())
    expect(deleteWorkplaceItem).toHaveBeenCalledWith(stale.itemId, expect.any(Function), 'member-1', expect.any(AbortSignal))
  })

  it('ignores a late Workplace save list after an in-place account switch', async () => {
    let resolveA!: (result: WorkplaceSavesResult) => void
    let signalA: AbortSignal | undefined
    const fetchWorkplaceItems = vi.fn((_token: () => Promise<string | null>, ownerId: string, signal?: AbortSignal) => {
      if (ownerId === 'member-a') {
        signalA = signal
        return new Promise<WorkplaceSavesResult>((resolve) => { resolveA = resolve })
      }
      return Promise.resolve({ kind: 'ok' as const, items: [] })
    })
    const rendered = renderWithAppProviders(<MyLearningPage
      fetchSnapshot={vi.fn().mockImplementation(() => new Promise(() => {}))}
      fetchWorkplaceItems={fetchWorkplaceItems}
    />, {
      session: { id: 'member-a', email: 'a@example.com' },
      membershipAccessRepository: { getAccess: vi.fn().mockResolvedValue('active') },
    })
    await waitFor(() => expect(fetchWorkplaceItems).toHaveBeenCalledTimes(1))
    act(() => rendered.authClient.emitAuthStateChange({ id: 'member-b', email: 'b@example.com' }))
    await waitFor(() => expect(fetchWorkplaceItems).toHaveBeenCalledTimes(2))
    expect(signalA?.aborted).toBe(true)
    act(() => resolveA({ kind: 'ok', items: [{ itemId: sampleWorkplaceLearnItem.id, kind: 'lesson', revision: null, savedAt: '2026-09-20T10:00:00.000Z', current: true }] }))
    await Promise.resolve()
    expect(screen.queryByRole('link', { name: sampleWorkplaceLearnItem.title })).not.toBeInTheDocument()
  })
})
