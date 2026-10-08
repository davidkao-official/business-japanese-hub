/**
 * Reader resume intent regressions for issue #197 Part A.
 *
 * Continue is a one-time restoration request. A direct chapter URL is a
 * deliberate navigation request and must not be overridden by saved state.
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { AuthProvider } from '@business-japanese-hub/platform-auth'
import type { SessionUser } from '@business-japanese-hub/platform-auth'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BookPage } from '../app/BookPage'
import { LibraryPage } from '../app/LibraryPage'
import { secondBook } from '../content/fixtures/second-book'
import { getBookBySlug } from './catalog'
import { createMockAuthClient, createMockRepository, renderWithAppProviders } from '../test/appProviders'
import { AppearanceProvider } from '../lib/appearance/AppearanceContext'
import { MembershipAccessProvider } from '../lib/membership/MembershipAccessContext'
import { PurchaseProvider } from '../lib/purchase/PurchaseContext'
import { UserStateProvider } from '../lib/persistence/UserStateContext'
import type { ReadingState } from '../lib/persistence/types'
import type { Book } from '../content/types'
import { Layout } from '../components/Layout'
import { ReaderPage } from './ReaderPage'

const user = { id: 'resume-user', email: 'reader@example.com' }
const maybeMeetingBook = getBookBySlug('meeting-japanese')
if (!maybeMeetingBook) throw new Error('meeting-japanese released Book is required by reader resume tests')
const meetingBook: Book = maybeMeetingBook
const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')

afterEach(() => {
  vi.restoreAllMocks()
  if (originalScrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView)
  } else {
    delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView
  }
})

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}{location.hash}</output>
}

function SnapshotHashLink() {
  const location = useLocation()
  return (
    <Link
      to={{ pathname: '/books/email-manners/read/requests-and-closings', hash: '#block-bm-ch3-blk-01' }}
      state={location.state}
    >
      Test snapshot hash
    </Link>
  )
}

function ReaderRoutes() {
  return (
    <>
      <LocationProbe />
      <nav aria-label="Test routes">
        <Link to="/books/email-manners/read/email-basics">Test explicit chapter</Link>
        <Link to="/books/email-manners/read/requests-and-closings?resume=1">Test new Continue entry</Link>
        <Link to="/books/meeting-japanese/read/meeting-purpose">Test different book</Link>
        <SnapshotHashLink />
      </nav>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/library" element={<LibraryPage />} />
          <Route
            path="/books/:slug"
            element={
              <>
                <BookPage />
                <Link to="/library">Test navigation: Library</Link>
              </>
            }
          />
        </Route>
        <Route path="/books/:slug/read" element={<ReaderPage />} />
        <Route path="/books/:slug/read/:chapterSlug" element={<ReaderPage />} />
      </Routes>
    </>
  )
}

function installScrollIntoViewSpy() {
  const scrollIntoView = vi.fn()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  })
  return scrollIntoView
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, resolve, reject }
}

function renderWithDelayedAuth(
  ui: ReactElement,
  options: { initialEntry: string; repository: ReturnType<typeof createMockRepository> | null },
) {
  const pending = deferred<SessionUser | null>()
  const authClient = createMockAuthClient(null)
  authClient.getSession = vi.fn(() => pending.promise)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppearanceProvider>
      <AuthProvider authClient={authClient}>
        <MembershipAccessProvider repository={null}>
          <UserStateProvider repository={options.repository}>
            <PurchaseProvider>
              <MemoryRouter initialEntries={[options.initialEntry]}>{children}</MemoryRouter>
            </PurchaseProvider>
          </UserStateProvider>
        </MembershipAccessProvider>
      </AuthProvider>
    </AppearanceProvider>
  )
  return { ...render(ui, { wrapper }), authClient, pending }
}

function savedPosition(overrides: Partial<ReadingState> = {}): ReadingState {
  return {
    bookId: secondBook.id,
    chapterId: 'bm-ch-3',
    blockId: 'bm-ch3-blk-02',
    offset: 19,
    updatedAt: '2026-10-07T12:00:00.000Z',
    ...overrides,
  }
}

function meetingPosition(overrides: Partial<ReadingState> = {}): ReadingState {
  return {
    bookId: meetingBook.id,
    chapterId: 'mj-ch-02',
    blockId: 'mj-ch02-blk-02',
    updatedAt: '2026-10-07T12:00:00.000Z',
    ...overrides,
  }
}

describe('reader resume intent', () => {
  it('waits for a delayed signed-in free-book resume read before fallback or persistence', async () => {
    installScrollIntoViewSpy()
    const pending = deferred<ReadingState | null>()
    const base = createMockRepository()
    const repository = {
      ...base,
      getReadingState: vi.fn(() => pending.promise),
    }
    renderWithAppProviders(<ReaderRoutes />, {
      initialEntries: ['/books/email-manners/read'],
      session: user,
      repository,
    })

    expect(await screen.findByText('確認中…')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'メールの基本構成' })).not.toBeInTheDocument()
    expect(repository.saveReadingState).not.toHaveBeenCalled()

    pending.resolve(savedPosition())

    expect(await screen.findByRole('heading', { name: '依頼と締めの表現' })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/read/requests-and-closings'),
    )
    expect(vi.mocked(repository.saveReadingState).mock.calls[0]?.[0]).toMatchObject(
      { chapterId: 'bm-ch-3', blockId: 'bm-ch3-blk-02', offset: 19 },
    )
    expect(
      vi.mocked(repository.saveReadingState).mock.calls.slice(0, 2).every(
        ([state]) => state.chapterId === 'bm-ch-3' && state.blockId === 'bm-ch3-blk-02',
      ),
    ).toBe(true)
  })

  it('uses first-readable fallback only after a pending explicit resume is confirmed absent', async () => {
    const pending = deferred<ReadingState | null>()
    const base = createMockRepository()
    const repository = {
      ...base,
      getReadingState: vi.fn(() => pending.promise),
    }
    renderWithAppProviders(<ReaderRoutes />, {
      initialEntries: ['/books/email-manners/read/requests-and-closings?resume=1'],
      session: user,
      repository,
    })

    expect(await screen.findByText('確認中…')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'メールの基本構成' })).not.toBeInTheDocument()
    pending.resolve(null)

    expect(await screen.findByRole('heading', { name: 'メールの基本構成' })).toBeInTheDocument()
  })

  it('waits for configured auth restoration before mounting the Reader, then honors a direct chapter', async () => {
    const pendingReading = deferred<ReadingState | null>()
    const base = createMockRepository()
    const repository = {
      ...base,
      getReadingState: vi.fn(() => pendingReading.promise),
    }
    const rendered = renderWithDelayedAuth(<ReaderRoutes />, {
      initialEntry: '/books/email-manners/read/email-basics',
      repository,
    })

    expect(screen.getByText('確認中…')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'メールの基本構成' })).not.toBeInTheDocument()
    await act(async () => {
      rendered.pending.resolve(user)
      await rendered.pending.promise
    })
    expect(await screen.findByRole('heading', { name: 'メールの基本構成' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/read/email-basics')
    expect(repository.saveReadingState).not.toHaveBeenCalled()
    pendingReading.resolve(savedPosition())
    expect(await screen.findByRole('heading', { name: 'メールの基本構成' })).toBeInTheDocument()
  })

  it('does not wait for auth when there is no repository or resume synchronization', async () => {
    const rendered = renderWithDelayedAuth(<ReaderRoutes />, {
      initialEntry: '/books/email-manners/read',
      repository: null,
    })

    expect(await screen.findByRole('heading', { name: 'メールの基本構成' })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/read/email-basics')
    await act(async () => {
      rendered.pending.resolve(user)
      await rendered.pending.promise
    })
    expect(await screen.findByRole('heading', { name: 'メールの基本構成' })).toBeInTheDocument()
  })

  it('keeps a failed resume read distinct from a confirmed-empty state', async () => {
    const base = createMockRepository()
    const repository = {
      ...base,
      getReadingState: vi.fn(async () => {
        throw new Error('reading state unavailable')
      }),
    }
    renderWithAppProviders(<ReaderRoutes />, {
      initialEntries: ['/books/email-manners/read?resume=1'],
      session: user,
      repository,
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('ライブラリの読み込み中にエラーが発生しました。')
    expect(screen.queryByRole('heading', { name: 'メールの基本構成' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ライブラリへ戻る' })).toHaveAttribute('href', '/library')
    expect(screen.getByRole('alert')).not.toHaveTextContent('reading state unavailable')
    expect(repository.saveReadingState).not.toHaveBeenCalled()
  })

  it('saves a Reader position, leaves, then restores it through Library Continue', async () => {
    const scrollIntoView = installScrollIntoViewSpy()
    const base = createMockRepository({
      entitlements: {
        [secondBook.id]: {
          bookId: secondBook.id,
          provider: 'manual',
          grantedAt: '2026-10-01T00:00:00.000Z',
        },
      },
    })
    let persisted: ReadingState | null = null
    const repository = {
      ...base,
      getReadingState: vi.fn(async () => persisted),
      saveReadingState: vi.fn(async (state: { bookId: string; chapterId: string; blockId?: string | null }) => {
        persisted = {
          ...state,
          updatedAt: '2026-10-08T04:00:00.000Z',
        }
      }),
    }
    renderWithAppProviders(<ReaderRoutes />, {
      initialEntries: ['/books/email-manners/read/email-basics'],
      session: user,
      repository,
    })

    expect(await screen.findByRole('heading', { name: 'メールの基本構成' })).toBeInTheDocument()
    const blocks = [...document.querySelectorAll<HTMLElement>('[data-block-anchor]')]
    const tops: Record<string, number> = {
      'bm-ch1-blk-01': 0,
      'bm-ch1-blk-02': 100,
      'bm-ch1-blk-03': 200,
      'bm-ch1-blk-04': 400,
    }
    for (const block of blocks) {
      const top = tops[block.dataset.blockId ?? ''] ?? 800
      block.getBoundingClientRect = () => ({
        x: 0, y: top, top, left: 0, right: 600, bottom: top + 40, width: 600, height: 40,
        toJSON: () => ({}),
      }) as DOMRect
    }
    fireEvent.scroll(window)
    await waitFor(() =>
      expect(repository.saveReadingState).toHaveBeenCalledWith(
        expect.objectContaining({ chapterId: 'bm-ch-1', blockId: 'bm-ch1-blk-03' }),
      ),
    )
    expect(persisted).toMatchObject({ chapterId: 'bm-ch-1', blockId: 'bm-ch1-blk-03' })

    fireEvent.click(screen.getByRole('link', { name: '書籍へ戻る' }))
    expect(await screen.findByRole('heading', { name: 'ビジネスメールの作法' })).toBeInTheDocument()
    // The production Header has no Library destination; this harness link
    // models entering the real Library route after leaving the Book page.
    fireEvent.click(screen.getByRole('link', { name: 'Test navigation: Library' }))
    // The same book also appears in the owned shelf. Scope to the dedicated
    // Continue-reading section so this follows the intended featured CTA.
    const continueRegion = await screen.findByRole('region', { name: '続きを読む' })
    const continueLink = within(continueRegion).getByRole('link', {
      name: /ビジネスメールの作法.*続きを読む/,
    })
    scrollIntoView.mockClear()
    vi.mocked(repository.saveReadingState).mockClear()
    fireEvent.click(continueLink)

    expect(await screen.findByRole('heading', { name: 'メールの基本構成' })).toBeInTheDocument()
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
    const restoredBlock = document.getElementById('block-bm-ch1-blk-03')
    expect(scrollIntoView.mock.contexts).toContain(restoredBlock)
    expect(restoredBlock).toHaveFocus()
    await waitFor(() =>
      expect(vi.mocked(repository.saveReadingState).mock.calls[0]?.[0]).toMatchObject({
        chapterId: 'bm-ch-1',
        blockId: 'bm-ch1-blk-03',
      }),
    )
  })

  it('does not restore a saved block over a deliberate chapter URL', async () => {
    const scrollIntoView = installScrollIntoViewSpy()
    const repository = createMockRepository({ readingStates: { [secondBook.id]: savedPosition() } })
    renderWithAppProviders(<ReaderRoutes />, {
      initialEntries: ['/books/email-manners/read/email-basics'],
      session: user,
      repository,
    })

    expect(await screen.findByRole('heading', { name: 'メールの基本構成' })).toBeInTheDocument()
    await waitFor(() => expect(repository.getReadingState).toHaveBeenCalledWith(secondBook.id))
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(screen.getByTestId('location')).toHaveTextContent('/read/email-basics')
  })

  it('lets a deliberate chapter navigation supersede a pending resume read', async () => {
    const pending = deferred<ReadingState | null>()
    const scrollIntoView = installScrollIntoViewSpy()
    const base = createMockRepository()
    const repository = { ...base, getReadingState: vi.fn(() => pending.promise) }
    renderWithAppProviders(<ReaderRoutes />, {
      initialEntries: ['/books/email-manners/read?resume=1'],
      session: user,
      repository,
    })

    expect(await screen.findByText('確認中…')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Test explicit chapter' }))
    expect(await screen.findByRole('heading', { name: 'メールの基本構成' })).toBeInTheDocument()
    pending.resolve(savedPosition())

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/read/email-basics'))
    expect(screen.getByRole('heading', { name: 'メールの基本構成' })).toBeInTheDocument()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('ignores a late resume read after switching to a different book', async () => {
    const pending = deferred<ReadingState | null>()
    const base = createMockRepository()
    const repository = {
      ...base,
      getReadingState: vi.fn((bookId: string) =>
        bookId === secondBook.id ? pending.promise : Promise.resolve(null),
      ),
      getEntitlement: vi.fn(async (bookId: string) =>
        bookId === meetingBook.id
          ? { bookId, provider: 'manual' as const, grantedAt: '2026-10-01T00:00:00.000Z' }
          : null,
      ),
    }
    renderWithAppProviders(<ReaderRoutes />, {
      initialEntries: ['/books/email-manners/read?resume=1'],
      session: user,
      repository,
    })

    expect(await screen.findByText('確認中…')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Test different book' }))
    pending.resolve(savedPosition())
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/books/meeting-japanese/read/meeting-purpose'),
    )
    expect(await screen.findByRole('heading', { name: '成果から逆算する会議設計' })).toBeInTheDocument()
    await waitFor(() => expect(repository.saveReadingState).toHaveBeenCalled())
    const savedAfterSwitch = vi.mocked(repository.saveReadingState).mock.calls.map(([state]) => state)
    expect(savedAfterSwitch.length).toBeGreaterThan(0)
    expect(savedAfterSwitch.every((state) => state.bookId === meetingBook.id && state.chapterId === 'mj-ch-1')).toBe(true)
    expect(savedAfterSwitch.some((state) => state.blockId?.startsWith('bm-'))).toBe(false)
  })

  it('gives a readable block hash priority over a saved Continue position', async () => {
    const scrollIntoView = installScrollIntoViewSpy()
    const repository = createMockRepository({ readingStates: { [secondBook.id]: savedPosition() } })
    renderWithAppProviders(<ReaderRoutes />, {
      initialEntries: ['/books/email-manners/read?resume=1#block-bm-ch1-blk-02'],
      session: user,
      repository,
    })

    expect(await screen.findByRole('heading', { name: 'メールの基本構成' })).toBeInTheDocument()
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
    expect(scrollIntoView.mock.contexts).toContain(document.getElementById('block-bm-ch1-blk-02'))
    expect(scrollIntoView.mock.contexts).not.toContain(document.getElementById('block-bm-ch3-blk-02'))
  })

  it('gives a deliberate hash priority over a consumed live viewport snapshot', async () => {
    const scrollIntoView = installScrollIntoViewSpy()
    const repository = createMockRepository({ readingStates: { [secondBook.id]: savedPosition() } })
    renderWithAppProviders(<ReaderRoutes />, {
      initialEntries: ['/books/email-manners/read/requests-and-closings?resume=1'],
      session: user,
      repository,
    })

    expect(await screen.findByRole('heading', { name: '依頼と締めの表現' })).toBeInTheDocument()
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
    scrollIntoView.mockClear()
    fireEvent.click(screen.getByRole('link', { name: 'Test snapshot hash' }))

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
    expect(scrollIntoView.mock.contexts).toContain(document.getElementById('block-bm-ch3-blk-01'))
    expect(scrollIntoView.mock.contexts).not.toContain(document.getElementById('block-bm-ch3-blk-02'))
  })

  it('does not restore a consumed live anchor after paid access is revoked', async () => {
    const scrollIntoView = installScrollIntoViewSpy()
    const refreshedEntitlement = deferred<{
      bookId: string
      provider: 'manual'
      grantedAt: string
    } | null>()
    const granted = {
      bookId: meetingBook.id,
      provider: 'manual' as const,
      grantedAt: '2026-10-01T00:00:00.000Z',
    }
    let entitlementReads = 0
    const base = createMockRepository({
      entitlements: { [meetingBook.id]: granted },
      readingStates: { [meetingBook.id]: meetingPosition({ blockId: 'mj-ch02-blk-11' }) },
    })
    const repository = {
      ...base,
      getEntitlement: vi.fn(() =>
        entitlementReads++ === 0 ? Promise.resolve(granted) : refreshedEntitlement.promise,
      ),
    }
    const rendered = renderWithAppProviders(<ReaderRoutes />, {
      initialEntries: ['/books/meeting-japanese/read/enter-the-conversation?resume=1'],
      session: user,
      repository,
    })

    expect(await screen.findByRole('heading', { name: '発言の入口をつくる' })).toBeInTheDocument()
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
    scrollIntoView.mockClear()
    act(() => rendered.authClient.emitAuthStateChange({ ...user }))
    expect(await screen.findByText('確認中…')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '発言の入口をつくる' })).not.toBeInTheDocument()
    await waitFor(() => expect(repository.getEntitlement).toHaveBeenCalledTimes(2))
    await act(async () => {
      refreshedEntitlement.resolve(null)
      await refreshedEntitlement.promise
    })

    expect(await screen.findByRole('heading', { name: meetingBook.title })).toBeInTheDocument()
    expect(document.querySelector('.reader-gate')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('falls back to a deleted block chapter start without losing whole-book progress', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const repository = createMockRepository({
      readingStates: {
        [secondBook.id]: savedPosition({ blockId: 'removed-block', offset: 9876 }),
      },
    })
    renderWithAppProviders(<ReaderRoutes />, {
      initialEntries: ['/books/email-manners/read?resume=1'],
      session: user,
      repository,
    })

    expect(await screen.findByRole('heading', { name: '依頼と締めの表現' })).toBeInTheDocument()
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
    const progress = screen.getByRole('progressbar')
    expect(Number(progress.getAttribute('aria-valuenow'))).toBeGreaterThan(0)
    await waitFor(() =>
      expect(repository.saveReadingState).toHaveBeenCalledWith(
        expect.objectContaining({
          chapterId: 'bm-ch-3',
          blockId: '',
          offset: undefined,
        }),
      ),
    )
  })

  it('falls back to first-readable when the saved chapter no longer exists', async () => {
    const repository = createMockRepository({
      readingStates: {
        [secondBook.id]: savedPosition({ chapterId: 'removed-chapter', blockId: 'removed-block' }),
      },
    })
    renderWithAppProviders(<ReaderRoutes />, {
      initialEntries: ['/books/email-manners/read?resume=1'],
      session: user,
      repository,
    })

    expect(await screen.findByRole('heading', { name: 'メールの基本構成' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '依頼と締めの表現' })).not.toBeInTheDocument()
    await waitFor(() => expect(repository.saveReadingState).toHaveBeenCalled())
    expect(
      vi.mocked(repository.saveReadingState).mock.calls.every(([state]) => state.chapterId === 'bm-ch-1'),
    ).toBe(true)
  })

  it('falls back from a saved gated chapter to the first readable chapter', async () => {
    const repository = createMockRepository({
      readingStates: { [meetingBook.id]: meetingPosition() },
    })
    renderWithAppProviders(<ReaderRoutes />, {
      initialEntries: ['/books/meeting-japanese/read/enter-the-conversation?resume=1'],
      session: user,
      repository,
    })

    expect(await screen.findByRole('heading', { name: '成果から逆算する会議設計' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '発言の入口をつくる' })).not.toBeInTheDocument()
    await waitFor(() => expect(repository.saveReadingState).toHaveBeenCalled())
    expect(vi.mocked(repository.saveReadingState).mock.calls.every(([state]) => state.chapterId === 'mj-ch-1')).toBe(true)
  })

  it('does not replay a consumed restore after a same-user session refresh', async () => {
    const scrollIntoView = installScrollIntoViewSpy()
    const repository = createMockRepository({ readingStates: { [secondBook.id]: savedPosition() } })
    const rendered = renderWithAppProviders(<ReaderRoutes />, {
      initialEntries: ['/books/email-manners/read/email-basics?resume=1'],
      session: user,
      repository,
    })

    expect(await screen.findByRole('heading', { name: '依頼と締めの表現' })).toBeInTheDocument()
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
    const callsAfterRestore = vi.mocked(repository.saveReadingState).mock.calls.length
    act(() => rendered.authClient.emitAuthStateChange({ ...user }))
    await waitFor(() => expect(repository.getReadingState).toHaveBeenCalledTimes(2))
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(vi.mocked(repository.saveReadingState).mock.calls.slice(callsAfterRestore)).toEqual([])
    expect(screen.getByTestId('location')).toHaveTextContent('/read/requests-and-closings')
  })

  it('preserves the consumed viewport through a paid same-user ownership refresh', async () => {
    const scrollIntoView = installScrollIntoViewSpy()
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const refreshedEntitlement = deferred<{
      bookId: string
      provider: 'manual'
      grantedAt: string
    } | null>()
    const refreshedReadingState = deferred<ReadingState | null>()
    const entitlement = {
      bookId: meetingBook.id,
      provider: 'manual' as const,
      grantedAt: '2026-10-01T00:00:00.000Z',
    }
    const stablePosition = meetingPosition({ blockId: 'mj-ch02-blk-11' })
    const base = createMockRepository({
      entitlements: {
        [meetingBook.id]: entitlement,
      },
      readingStates: { [meetingBook.id]: stablePosition },
    })
    let entitlementReads = 0
    let readingStateReads = 0
    const repository = {
      ...base,
      getEntitlement: vi.fn(() =>
        entitlementReads++ === 0 ? Promise.resolve(entitlement) : refreshedEntitlement.promise,
      ),
      getReadingState: vi.fn(() =>
        readingStateReads++ === 0 ? Promise.resolve(stablePosition) : refreshedReadingState.promise,
      ),
    }
    const rendered = renderWithAppProviders(<ReaderRoutes />, {
      initialEntries: ['/books/meeting-japanese/read/enter-the-conversation?resume=1'],
      session: user,
      repository,
    })

    expect(await screen.findByRole('heading', { name: '発言の入口をつくる' })).toBeInTheDocument()
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
    const tops: Record<string, number> = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [
        `mj-ch02-blk-${String(index + 1).padStart(2, '0')}`,
        -100 + index * 10,
      ]),
    )
    tops['mj-ch02-blk-11'] = 0
    tops['mj-ch02-blk-12'] = 100
    for (const block of document.querySelectorAll<HTMLElement>('[data-block-anchor]')) {
      const top = tops[block.dataset.blockId ?? ''] ?? 800
      block.getBoundingClientRect = () => ({
        x: 0, y: top, top, left: 0, right: 600, bottom: top + 40, width: 600, height: 40,
        toJSON: () => ({}),
      }) as DOMRect
    }
    fireEvent.scroll(window)
    await waitFor(() =>
      expect(repository.saveReadingState).toHaveBeenCalledWith(
        expect.objectContaining({ bookId: meetingBook.id, chapterId: 'mj-ch-02', blockId: 'mj-ch02-blk-12' }),
      ),
    )
    const progressBeforeRefresh = screen.getByRole('progressbar').getAttribute('aria-valuenow')
    expect(progressBeforeRefresh).not.toBeNull()
    expect(Number(progressBeforeRefresh)).toBeGreaterThan(0)
    scrollIntoView.mockClear()
    scrollTo.mockClear()
    vi.mocked(repository.saveReadingState).mockClear()
    act(() => rendered.authClient.emitAuthStateChange({ ...user }))
    expect(await screen.findByText('確認中…')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '発言の入口をつくる' })).not.toBeInTheDocument()
    await waitFor(() => expect(repository.getEntitlement).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(repository.getReadingState).toHaveBeenCalledTimes(2))
    await act(async () => {
      refreshedEntitlement.resolve(entitlement)
      refreshedReadingState.resolve(stablePosition)
      await Promise.all([refreshedEntitlement.promise, refreshedReadingState.promise])
    })
    expect(await screen.findByRole('heading', { name: '発言の入口をつくる' })).toBeInTheDocument()
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts).toContain(document.getElementById('block-mj-ch02-blk-12'))
    expect(scrollIntoView.mock.contexts).not.toContain(document.getElementById('block-mj-ch02-blk-11'))
    expect(scrollTo).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(progressBeforeRefresh)),
    )
    expect(vi.mocked(repository.saveReadingState).mock.calls).toEqual([])
  })

  it('does not carry the consumed owner viewport into a different account', async () => {
    const scrollIntoView = installScrollIntoViewSpy()
    const ownerBState = savedPosition({ chapterId: 'bm-ch-1', blockId: 'bm-ch1-blk-02' })
    let readCount = 0
    const base = createMockRepository()
    const repository = {
      ...base,
      getReadingState: vi.fn(async () => (readCount++ === 0 ? savedPosition() : ownerBState)),
    }
    const rendered = renderWithAppProviders(<ReaderRoutes />, {
      initialEntries: ['/books/email-manners/read/requests-and-closings?resume=1'],
      session: user,
      repository,
    })

    expect(await screen.findByRole('heading', { name: '依頼と締めの表現' })).toBeInTheDocument()
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
    vi.mocked(repository.saveReadingState).mockClear()
    act(() => rendered.authClient.emitAuthStateChange({ id: 'different-reader', email: 'other@example.com' }))

    await waitFor(() => expect(repository.getReadingState).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('heading', { name: '依頼と締めの表現' })).toBeInTheDocument()
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(repository.saveReadingState).not.toHaveBeenCalled()
    expect(screen.getByTestId('location')).toHaveTextContent('/read/requests-and-closings')
  })

  it('does not replay restoration during settings and reflow and saves the measured block', async () => {
    const scrollIntoView = installScrollIntoViewSpy()
    const repository = createMockRepository({ readingStates: { [secondBook.id]: savedPosition() } })
    renderWithAppProviders(<ReaderRoutes />, {
      initialEntries: ['/books/email-manners/read/requests-and-closings?resume=1'],
      session: user,
      repository,
    })

    expect(await screen.findByRole('heading', { name: '依頼と締めの表現' })).toBeInTheDocument()
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
    vi.mocked(repository.saveReadingState).mockClear()
    const tops: Record<string, number> = {
      'bm-ch3-blk-01': 0,
      'bm-ch3-blk-02': 100,
      'bm-ch3-blk-03': 200,
    }
    for (const block of document.querySelectorAll<HTMLElement>('[data-block-anchor]')) {
      const top = tops[block.dataset.blockId ?? ''] ?? 800
      block.getBoundingClientRect = () => ({
        x: 0, y: top, top, left: 0, right: 600, bottom: top + 40, width: 600, height: 40,
        toJSON: () => ({}),
      }) as DOMRect
    }
    fireEvent.click(screen.getByRole('button', { name: '表示設定' }))
    fireEvent.click(screen.getByRole('button', { name: '大' }))
    fireEvent.resize(window)

    await waitFor(() =>
      expect(repository.saveReadingState).toHaveBeenCalledWith(
        expect.objectContaining({ chapterId: 'bm-ch-3', blockId: 'bm-ch3-blk-03' }),
      ),
    )
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: '依頼と締めの表現' })).toBeInTheDocument()
    expect(
      vi.mocked(repository.saveReadingState).mock.calls.every(
        ([state]) => state.chapterId === 'bm-ch-3' && Boolean(state.blockId),
      ),
    ).toBe(true)
  })

  it('clears a prior end-of-book state when a fresh middle-block resume arrives in the same Shell', async () => {
    const scrollIntoView = installScrollIntoViewSpy()
    const repository = createMockRepository({ readingStates: { [secondBook.id]: savedPosition() } })
    renderWithAppProviders(<ReaderRoutes />, {
      initialEntries: ['/books/email-manners/read/requests-and-closings'],
      session: user,
      repository,
    })

    expect(await screen.findByRole('heading', { name: '依頼と締めの表現' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100'))
    fireEvent.click(screen.getByRole('link', { name: 'Test new Continue entry' }))

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
    await waitFor(() => expect(Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'))).toBeLessThan(100))
    expect(scrollIntoView.mock.contexts).toContain(document.getElementById('block-bm-ch3-blk-02'))
  })

  it('does not carry a consumed restore into a signed-out session', async () => {
    const scrollIntoView = installScrollIntoViewSpy()
    const repository = createMockRepository({ readingStates: { [secondBook.id]: savedPosition() } })
    const rendered = renderWithAppProviders(<ReaderRoutes />, {
      initialEntries: ['/books/email-manners/read/requests-and-closings?resume=1'],
      session: user,
      repository,
    })

    expect(await screen.findByRole('heading', { name: '依頼と締めの表現' })).toBeInTheDocument()
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
    vi.mocked(repository.saveReadingState).mockClear()
    act(() => rendered.authClient.emitAuthStateChange(null))
    expect(await screen.findByRole('heading', { name: '依頼と締めの表現' })).toBeInTheDocument()
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(repository.saveReadingState).not.toHaveBeenCalled()
  })
})
