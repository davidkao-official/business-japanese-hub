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
const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
const originalGetBoundingClientRectDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'getBoundingClientRect',
)
const originalScrollHeightDescriptor = Object.getOwnPropertyDescriptor(
  document.documentElement,
  'scrollHeight',
)
const measuredTopByBlockId = new Map<string, number>()
const measuredRectReadCountByBlockId = new Map<string, number>()
const originalWindowGeometry = new Map(
  ['innerHeight', 'scrollY'].map((key) => [key, Object.getOwnPropertyDescriptor(window, key)]),
)

afterEach(() => {
  vi.restoreAllMocks()
  measuredTopByBlockId.clear()
  measuredRectReadCountByBlockId.clear()
  for (const [key, descriptor] of originalWindowGeometry) {
    if (descriptor) Object.defineProperty(window, key, descriptor)
    else Reflect.deleteProperty(window, key)
  }
  if (originalScrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView)
  } else {
    delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView
  }
  if (originalGetBoundingClientRectDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      'getBoundingClientRect',
      originalGetBoundingClientRectDescriptor,
    )
  } else {
    delete (HTMLElement.prototype as { getBoundingClientRect?: unknown }).getBoundingClientRect
  }
  if (originalScrollHeightDescriptor) {
    Object.defineProperty(document.documentElement, 'scrollHeight', originalScrollHeightDescriptor)
  } else {
    delete (document.documentElement as { scrollHeight?: unknown }).scrollHeight
  }
})

function LocationProbe() {
  const location = useLocation()
  return (
    <output data-testid="location" data-entry-key={location.key}>
      {location.pathname}{location.search}{location.hash}
    </output>
  )
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

function installScrollIntoViewSpy(
  onScroll?: (target: HTMLElement, options?: ScrollIntoViewOptions) => void,
) {
  const scrollIntoView = vi.fn(function (this: HTMLElement, options?: ScrollIntoViewOptions) {
    onScroll?.(this, options)
  })
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  })
  return scrollIntoView
}

function setMeasuredBlockTops(currentBlockId: string) {
  const blockIds = [...document.querySelectorAll<HTMLElement>('[data-block-anchor]')]
    .map((block) => block.dataset.blockId)
    .filter((blockId): blockId is string => Boolean(blockId))
  setMeasuredBlockTopsForIds(blockIds, currentBlockId)
}

function setMeasuredBlockTopsForIds(blockIds: readonly string[], currentBlockId: string) {
  const currentIndex = blockIds.indexOf(currentBlockId)
  if (currentIndex === -1) throw new Error(`Missing test block ${currentBlockId}`)

  for (const [index, blockId] of blockIds.entries()) {
    const top = index < currentIndex ? (index - currentIndex) * 100 : index === currentIndex ? 0 : 600 + index * 100
    measuredTopByBlockId.set(blockId, top)
  }

  // A dynamic prototype model is keyed by semantic block id, so replacement
  // DOM nodes after a ReaderShell owner remount inherit the measured viewport.
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: function (this: HTMLElement) {
      const blockId = this.dataset.blockId
      const top = blockId ? measuredTopByBlockId.get(blockId) : undefined
      if (blockId) {
        measuredRectReadCountByBlockId.set(
          blockId,
          (measuredRectReadCountByBlockId.get(blockId) ?? 0) + 1,
        )
      }
      if (top === undefined) return originalGetBoundingClientRect.call(this)
      return {
        x: 0,
        y: top,
        top,
        left: 0,
        right: 600,
        bottom: top + 40,
        width: 600,
        height: 40,
        toJSON: () => ({}),
      } as DOMRect
    },
  })
}

function measuredBlockRectReadCount(blockId: string) {
  return measuredRectReadCountByBlockId.get(blockId) ?? 0
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

  it('saves, leaves, and restores through the actual BookPage Continue action', async () => {
    const scrollIntoView = installScrollIntoViewSpy()
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    let persisted: ReadingState | null = null
    const entitlement = {
      bookId: meetingBook.id,
      provider: 'manual' as const,
      grantedAt: '2026-10-01T00:00:00.000Z',
    }
    const base = createMockRepository({ entitlements: { [meetingBook.id]: entitlement } })
    const repository = {
      ...base,
      getReadingState: vi.fn(async () => persisted),
      saveReadingState: vi.fn(async (state: {
        bookId: string
        chapterId: string
        blockId?: string | null
        offset?: number | null
      }) => {
        persisted = { ...state, updatedAt: '2026-10-08T05:00:00.000Z' }
      }),
    }
    renderWithAppProviders(<ReaderRoutes />, {
      initialEntries: ['/books/meeting-japanese'],
      session: user,
      repository,
    })

    fireEvent.click(await screen.findByRole('link', { name: '読み始める' }))
    const firstChapter = meetingBook.chapters[0]
    const savedBlockId = 'mj-ch01-blk-03'
    if (!firstChapter || !firstChapter.blocks.some((block) => block.id === savedBlockId)) {
      throw new Error('meeting-japanese first chapter with block 03 is required')
    }
    expect(await screen.findByRole('heading', { name: firstChapter.title })).toBeInTheDocument()
    setMeasuredBlockTops(savedBlockId)
    fireEvent.scroll(window)
    await waitFor(() =>
      expect(repository.saveReadingState).toHaveBeenCalledWith(
        expect.objectContaining({ chapterId: firstChapter.id, blockId: savedBlockId }),
      ),
    )
    expect(persisted).toMatchObject({ chapterId: firstChapter.id, blockId: savedBlockId })

    fireEvent.click(screen.getByRole('link', { name: '書籍へ戻る' }))
    expect(await screen.findByRole('heading', { name: meetingBook.title })).toBeInTheDocument()
    const continueLink = await screen.findByRole('link', { name: '続きを読む' })
    scrollIntoView.mockClear()
    vi.mocked(repository.saveReadingState).mockClear()
    fireEvent.click(continueLink)

    expect(await screen.findByRole('heading', { name: firstChapter.title })).toBeInTheDocument()
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
    const restoredBlock = document.getElementById(`block-${savedBlockId}`)
    expect(scrollIntoView.mock.contexts).toContain(restoredBlock)
    expect(restoredBlock).toHaveFocus()
    await waitFor(() =>
      expect(vi.mocked(repository.saveReadingState).mock.calls[0]?.[0]).toMatchObject({
        chapterId: firstChapter.id,
        blockId: savedBlockId,
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

  it.each([
    { entry: 'direct chapter A → B', startsOnContinue: false, navigateVia: 'none', signOutFirst: false },
    { entry: 'direct chapter A → signed out → B', startsOnContinue: false, navigateVia: 'none', signOutFirst: true },
    { entry: 'Continue → Next A → B', startsOnContinue: true, navigateVia: 'next', signOutFirst: false },
    { entry: 'Continue → Next A → signed out → B', startsOnContinue: true, navigateVia: 'next', signOutFirst: true },
    { entry: 'Continue → TOC A → B', startsOnContinue: true, navigateVia: 'toc', signOutFirst: false },
    { entry: 'Continue → TOC A → signed out → B', startsOnContinue: true, navigateVia: 'toc', signOutFirst: true },
  ] as const)(
    'does not persist owner A’s later viewport as owner B after $entry',
    async ({ startsOnContinue, navigateVia, signOutFirst }) => {
      const scrollIntoView = installScrollIntoViewSpy()
      const nextOwnerRead = deferred<ReadingState | null>()
      const startPosition = savedPosition({ chapterId: 'bm-ch-1', blockId: 'bm-ch1-blk-02' })
      let stateReads = 0
      let resetEventBlockId: string | null = null
      let inheritedViewportBlockId = 'bm-ch2-blk-03'
      let resetWasInstant = false
      const base = createMockRepository()
      const repository = {
        ...base,
        getReadingState: vi.fn((bookId: string) => {
          if (bookId !== secondBook.id) return Promise.resolve(null)
          stateReads += 1
          return stateReads === 1
            ? Promise.resolve(startsOnContinue ? startPosition : null)
            : nextOwnerRead.promise
        }),
      }
      const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(
        (arg0?: ScrollToOptions | number, y?: number) => {
          void y
          if (!resetEventBlockId) return
          const options = typeof arg0 === 'object' && arg0 !== null ? arg0 : undefined
          resetWasInstant = options?.behavior === 'instant'
          // An omitted/auto reset emits an early smooth-scroll event while the
          // window still measures A's later block. An instant reset lands at the
          // new owner's opening block before emitting its event.
          setMeasuredBlockTops(resetWasInstant ? resetEventBlockId : inheritedViewportBlockId)
          queueMicrotask(() => fireEvent.scroll(window))
        },
      )
      const initialEntry = startsOnContinue
        ? '/books/email-manners/read/email-basics?resume=1'
        : '/books/email-manners/read/subject-and-opening'
      const rendered = renderWithAppProviders(<ReaderRoutes />, {
        initialEntries: [initialEntry],
        session: user,
        repository,
      })

      const startHeading = startsOnContinue ? 'メールの基本構成' : '件名と冒頭の作法'
      expect(await screen.findByRole('heading', { name: startHeading })).toBeInTheDocument()
      if (navigateVia !== 'none') {
        if (navigateVia === 'next') {
          fireEvent.click(screen.getByRole('link', { name: /件名と冒頭の作法/ }))
        } else {
          fireEvent.click(screen.getByRole('button', { name: '目次' }))
          fireEvent.click(
            within(screen.getByRole('dialog', { name: '目次' })).getByRole('link', {
              name: /件名と冒頭の作法/,
            }),
          )
        }
        expect(await screen.findByRole('heading', { name: '件名と冒頭の作法' })).toBeInTheDocument()
      }

      setMeasuredBlockTops('bm-ch2-blk-03')
      fireEvent.scroll(window)
      await waitFor(() =>
        expect(repository.saveReadingState).toHaveBeenCalledWith(
          expect.objectContaining({ chapterId: 'bm-ch-2', blockId: 'bm-ch2-blk-03' }),
        ),
      )
      expect(document.getElementById('block-bm-ch2-blk-03')?.getBoundingClientRect().top).toBe(0)
      vi.mocked(repository.saveReadingState).mockClear()

      // A's browser viewport is later in chapter 2. A remount/reset scroll
      // emits an asynchronous scroll event at the new owner's opening block.
      resetEventBlockId = 'bm-ch2-blk-01'
      if (signOutFirst) {
        act(() => rendered.authClient.emitAuthStateChange(null))
        expect(await screen.findByRole('heading', { name: '件名と冒頭の作法' })).toBeInTheDocument()
        await act(async () => Promise.resolve())
        if (!resetWasInstant) {
          const resetMeasureCount = measuredBlockRectReadCount('bm-ch2-blk-01')
          setMeasuredBlockTops('bm-ch2-blk-01')
          fireEvent.scroll(window)
          await waitFor(() =>
            expect(measuredBlockRectReadCount('bm-ch2-blk-01')).toBeGreaterThan(resetMeasureCount),
          )
        }
        inheritedViewportBlockId = 'bm-ch2-blk-04'
        const anonymousMeasureCount = measuredBlockRectReadCount(inheritedViewportBlockId)
        setMeasuredBlockTops(inheritedViewportBlockId)
        fireEvent.scroll(window)
        await waitFor(() =>
          expect(measuredBlockRectReadCount(inheritedViewportBlockId)).toBeGreaterThan(
            anonymousMeasureCount,
          ),
        )
      }
      const readsBeforeOwnerB = vi.mocked(repository.getReadingState).mock.calls.length
      const inheritedMeasureCount = measuredBlockRectReadCount(inheritedViewportBlockId)
      act(() =>
        rendered.authClient.emitAuthStateChange({ id: 'owner-b', email: 'owner-b@example.com' }),
      )
      await waitFor(() =>
        expect(vi.mocked(repository.getReadingState).mock.calls.length).toBe(readsBeforeOwnerB + 1),
      )
      await act(async () => Promise.resolve())
      if (!resetWasInstant) {
        await waitFor(() =>
          expect(measuredBlockRectReadCount(inheritedViewportBlockId)).toBeGreaterThan(
            inheritedMeasureCount,
          ),
        )
      }
      expect(screen.getByRole('heading', { name: '件名と冒頭の作法' })).toBeInTheDocument()
      expect(
        document
          .getElementById(`block-${resetWasInstant ? 'bm-ch2-blk-01' : inheritedViewportBlockId}`)
          ?.getBoundingClientRect().top,
      ).toBe(0)
      expect(repository.saveReadingState).not.toHaveBeenCalled()

      await act(async () => {
        nextOwnerRead.resolve(savedPosition({ chapterId: 'bm-ch-2', blockId: 'bm-ch2-blk-02' }))
        await nextOwnerRead.promise
      })
      await waitFor(() => expect(repository.getReadingState).toHaveBeenCalled())
      if (!resetWasInstant) {
        // Finish the modeled reset after the held owner read has settled.
        const resetMeasureCount = measuredBlockRectReadCount('bm-ch2-blk-01')
        setMeasuredBlockTops('bm-ch2-blk-01')
        fireEvent.scroll(window)
        await waitFor(() =>
          expect(measuredBlockRectReadCount('bm-ch2-blk-01')).toBeGreaterThan(resetMeasureCount),
        )
        expect(document.getElementById('block-bm-ch2-blk-01')?.getBoundingClientRect().top).toBe(0)
      }
      expect(repository.saveReadingState).not.toHaveBeenCalled()

      // A returning account must not reactivate its pre-transition snapshot
      // when the intervening owner never made a reading action.
      if (navigateVia === 'none' && !signOutFirst) {
        const readsBeforeReturningOwner = vi.mocked(repository.getReadingState).mock.calls.length
        act(() => rendered.authClient.emitAuthStateChange(user))
        await waitFor(() =>
          expect(vi.mocked(repository.getReadingState).mock.calls.length).toBe(
            readsBeforeReturningOwner + 1,
          ),
        )
        await act(async () => Promise.resolve())
        expect(screen.getByRole('heading', { name: '件名と冒頭の作法' })).toBeInTheDocument()
        expect(scrollIntoView.mock.contexts).not.toContain(
          document.getElementById('block-bm-ch2-blk-03'),
        )
        expect(repository.saveReadingState).not.toHaveBeenCalled()

        const readsBeforeBReturns = vi.mocked(repository.getReadingState).mock.calls.length
        act(() =>
          rendered.authClient.emitAuthStateChange({ id: 'owner-b', email: 'owner-b@example.com' }),
        )
        await waitFor(() =>
          expect(vi.mocked(repository.getReadingState).mock.calls.length).toBe(
            readsBeforeBReturns + 1,
          ),
        )
        await act(async () => Promise.resolve())
        expect(repository.saveReadingState).not.toHaveBeenCalled()
      }

      // A later scroll performed after B's state is ready is a genuine B action.
      setMeasuredBlockTops('bm-ch2-blk-04')
      fireEvent.scroll(window)
      await waitFor(() =>
        expect(repository.saveReadingState).toHaveBeenCalledWith(
          expect.objectContaining({ chapterId: 'bm-ch-2', blockId: 'bm-ch2-blk-04' }),
        ),
      )
      expect(scrollTo).toHaveBeenCalled()
    },
  )

  it.each([
    { order: 'read before reset event', baselineBlock: 'bm-ch2-blk-01', readFirst: true },
    { order: 'read before reset event', baselineBlock: 'bm-ch2-blk-02', readFirst: true },
    { order: 'reset event before read', baselineBlock: 'bm-ch2-blk-01', readFirst: false },
    { order: 'reset event before read', baselineBlock: 'bm-ch2-blk-02', readFirst: false },
  ])(
    'preserves B’s stored row with $order and measured top baseline $baselineBlock',
    async ({ baselineBlock, readFirst }) => {
      installScrollIntoViewSpy()
      const nextOwnerRead = deferred<ReadingState | null>()
      const priorBPosition = savedPosition({ chapterId: 'bm-ch-2', blockId: 'bm-ch2-blk-04' })
      let storedBPosition = priorBPosition
      let ownerBActive = false
      let scrollY = 0
      Object.defineProperties(window, {
        innerHeight: { configurable: true, value: 1000 },
        scrollY: { configurable: true, get: () => scrollY },
      })
      Object.defineProperty(document.documentElement, 'scrollHeight', {
        configurable: true,
        value: 6000,
      })

      let nextFrameId = 0
      const frames = new Map<number, FrameRequestCallback>()
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
        frames.set(++nextFrameId, callback)
        return nextFrameId
      })
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => frames.delete(id))
      const flushScrollFrame = () => {
        expect(frames.size).toBeGreaterThan(0)
        act(() => {
          const pending = [...frames.values()]
          frames.clear()
          pending.forEach((callback) => callback(0))
        })
      }

      let pendingResetEvent: (() => void) | undefined
      const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
        if (!ownerBActive) return
        // Instant scrolling changes geometry now, but its native event can run
        // after B's async read. At scrollY=0 a tall viewport can already place
        // the reading line beyond the second short block, not the first block.
        scrollY = 0
        setMeasuredBlockTops('bm-ch2-blk-01')
        measuredTopByBlockId.set('bm-ch2-blk-01', 100)
        measuredTopByBlockId.set('bm-ch2-blk-02', baselineBlock.endsWith('02') ? 200 : 400)
        pendingResetEvent = () => fireEvent.scroll(window)
      })
      const repository = createMockRepository()
      vi.mocked(repository.getReadingState).mockImplementation(() =>
        ownerBActive ? nextOwnerRead.promise : Promise.resolve(null),
      )
      vi.mocked(repository.saveReadingState).mockImplementation(async (state) => {
        if (ownerBActive) storedBPosition = { ...state, updatedAt: priorBPosition.updatedAt }
      })
      const rendered = renderWithAppProviders(<ReaderRoutes />, {
        initialEntries: ['/books/email-manners/read/subject-and-opening'],
        session: user,
        repository,
      })
      expect(await screen.findByRole('heading', { name: '件名と冒頭の作法' })).toBeInTheDocument()
      await waitFor(() => expect(repository.saveReadingState).toHaveBeenCalled())
      scrollY = 900
      setMeasuredBlockTops('bm-ch2-blk-03')
      fireEvent.scroll(window)
      flushScrollFrame()
      expect(repository.saveReadingState).toHaveBeenCalledWith(
        expect.objectContaining({ blockId: 'bm-ch2-blk-03' }),
      )
      vi.mocked(repository.saveReadingState).mockClear()

      ownerBActive = true
      act(() => rendered.authClient.emitAuthStateChange({ id: 'owner-b', email: 'owner-b@example.com' }))
      await waitFor(() => expect(repository.getReadingState).toHaveBeenCalledTimes(2))
      expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' })
      expect(pendingResetEvent).toBeDefined()
      expect(window.scrollY).toBe(0)
      expect(document.getElementById(`block-${baselineBlock}`)?.getBoundingClientRect().top)
        .toBeLessThan(window.innerHeight * 0.3)
      expect(repository.saveReadingState).not.toHaveBeenCalled()

      const resolveBRead = async () => {
        await act(async () => {
          nextOwnerRead.resolve(priorBPosition)
          await nextOwnerRead.promise
        })
      }
      const deliverResetEvent = () => {
        const previousMeasurements = measuredBlockRectReadCount(baselineBlock)
        pendingResetEvent!()
        flushScrollFrame()
        expect(measuredBlockRectReadCount(baselineBlock)).toBeGreaterThan(previousMeasurements)
      }
      if (readFirst) await resolveBRead()
      else deliverResetEvent()
      expect(repository.saveReadingState).not.toHaveBeenCalled()
      if (readFirst) deliverResetEvent()
      else await resolveBRead()
      expect(repository.saveReadingState).not.toHaveBeenCalled()
      expect(storedBPosition).toEqual(priorBPosition)

      // A separate, later B scroll must still save the newly read block.
      scrollY = 900
      setMeasuredBlockTops('bm-ch2-blk-03')
      fireEvent.scroll(window)
      flushScrollFrame()
      expect(repository.saveReadingState).toHaveBeenCalledTimes(1)
      expect(storedBPosition).toEqual(expect.objectContaining({ blockId: 'bm-ch2-blk-03' }))
    },
  )

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

  it('does not persist an intermediate position while a programmatic resume scroll is in flight', async () => {
    const scrollIntoView = installScrollIntoViewSpy()
    const repository = createMockRepository({ readingStates: { [secondBook.id]: savedPosition() } })
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 5000,
    })
    renderWithAppProviders(<ReaderRoutes />, {
      initialEntries: ['/books/email-manners/read?resume=1'],
      session: user,
      repository,
    })

    expect(await screen.findByRole('heading', { name: '依頼と締めの表現' })).toBeInTheDocument()
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
    const scrollOptions = scrollIntoView.mock.calls[0]?.[0]
    const restoredProgress = Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'))
    vi.mocked(repository.saveReadingState).mockClear()

    if (scrollOptions?.behavior === 'instant') {
      // The harness completes an instant scroll at the requested anchor before
      // the detector can observe any intermediate position.
      setMeasuredBlockTops('bm-ch3-blk-02')
      expect(document.getElementById('block-bm-ch3-blk-02')?.getBoundingClientRect().top).toBe(0)
    } else {
      // CSSOM `auto` follows computed smooth scrolling. Model a mid-animation
      // event at the chapter opening, before the saved target is reached. The
      // detector may measure this transient geometry, but must not regress the
      // visible progress or persist it as the restored location.
      const openingReadCount = measuredBlockRectReadCount('bm-ch3-blk-01')
      setMeasuredBlockTops('bm-ch3-blk-01')
      fireEvent.scroll(window)
      await waitFor(() =>
        expect(measuredBlockRectReadCount('bm-ch3-blk-01')).toBeGreaterThan(openingReadCount),
      )
      expect(repository.saveReadingState).not.toHaveBeenCalledWith(
        expect.objectContaining({ chapterId: 'bm-ch-3', blockId: 'bm-ch3-blk-01' }),
      )
      expect(Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'))).toBe(restoredProgress)
      const targetReadCount = measuredBlockRectReadCount('bm-ch3-blk-02')
      setMeasuredBlockTops('bm-ch3-blk-02')
      fireEvent.scroll(window)
      await waitFor(() =>
        expect(measuredBlockRectReadCount('bm-ch3-blk-02')).toBeGreaterThan(targetReadCount),
      )
    }
    expect(
      vi.mocked(repository.saveReadingState).mock.calls.some(
        ([state]) => state.chapterId === 'bm-ch-3' && state.blockId === 'bm-ch3-blk-01',
      ),
    ).toBe(false)
    if (scrollOptions?.behavior === 'instant') {
      expect(Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'))).toBe(restoredProgress)
      expect(repository.saveReadingState).not.toHaveBeenCalled()
    }
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
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' })
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

  it.each(['next', 'toc'] as const)(
    'preserves the latest same-owner paid semantic anchor across Continue → %s → held refresh',
    async (navigation) => {
      vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
      const scrollIntoView = installScrollIntoViewSpy((target) => {
        const blockId = target.dataset.blockId
        if (blockId) setMeasuredBlockTops(blockId)
      })
      const currentChapter = meetingBook.chapters.find((chapter) => chapter.id === 'mj-ch-02')
      const destination = meetingBook.chapters.find((chapter) => chapter.id === 'mj-ch-03')
      if (!currentChapter || !destination || destination.blocks.length < 5) {
        throw new Error('meeting-japanese chapter 2 and 3 with five blocks are required')
      }
      const destinationBlock = destination.blocks[2]
      const olderBlock = destination.blocks[0]
      const entitlement = {
        bookId: meetingBook.id,
        provider: 'manual' as const,
        grantedAt: '2026-10-01T00:00:00.000Z',
      }
      const refreshedEntitlement = deferred<typeof entitlement | null>()
      const refreshedReadingState = deferred<ReadingState | null>()
      let entitlementReads = 0
      let readingStateReads = 0
      const base = createMockRepository({ entitlements: { [meetingBook.id]: entitlement } })
      const repository = {
        ...base,
        getEntitlement: vi.fn(() =>
          entitlementReads++ === 0 ? Promise.resolve(entitlement) : refreshedEntitlement.promise,
        ),
        getReadingState: vi.fn(() =>
          readingStateReads++ === 0
            ? Promise.resolve(meetingPosition({ blockId: 'mj-ch02-blk-11' }))
            : refreshedReadingState.promise,
        ),
      }
      const rendered = renderWithAppProviders(<ReaderRoutes />, {
        initialEntries: [`/books/meeting-japanese/read/${currentChapter.slug}?resume=1`],
        session: user,
        repository,
      })

      expect(await screen.findByRole('heading', { name: currentChapter.title })).toBeInTheDocument()
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
      if (navigation === 'next') {
        fireEvent.click(screen.getByRole('link', { name: new RegExp(destination.title) }))
      } else {
        fireEvent.click(screen.getByRole('button', { name: '目次' }))
        fireEvent.click(
          within(screen.getByRole('dialog', { name: '目次' })).getByRole('link', {
            name: new RegExp(destination.title),
          }),
        )
      }
      expect(await screen.findByRole('heading', { name: destination.title })).toBeInTheDocument()

      setMeasuredBlockTops(destinationBlock.id)
      fireEvent.scroll(window)
      await waitFor(() =>
        expect(repository.saveReadingState).toHaveBeenCalledWith(
          expect.objectContaining({ chapterId: destination.id, blockId: destinationBlock.id }),
        ),
      )
      const progressBeforeRefresh = screen.getByRole('progressbar').getAttribute('aria-valuenow')
      expect(progressBeforeRefresh).not.toBeNull()
      expect(Number(progressBeforeRefresh)).toBeGreaterThan(0)
      scrollIntoView.mockClear()
      vi.mocked(repository.saveReadingState).mockClear()

      act(() => rendered.authClient.emitAuthStateChange({ ...user }))
      expect(await screen.findByText('確認中…')).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: destination.title })).not.toBeInTheDocument()
      await waitFor(() => expect(repository.getEntitlement).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(repository.getReadingState).toHaveBeenCalledTimes(2))
      // Removing paid DOM collapses the document and clamps the browser to the
      // chapter opening. A correct semantic remount restores the live block.
      setMeasuredBlockTopsForIds(
        destination.blocks.map((block) => block.id),
        olderBlock.id,
      )
      expect(measuredTopByBlockId.get(olderBlock.id)).toBe(0)
      expect(measuredTopByBlockId.get(destinationBlock.id)).not.toBe(0)
      await act(async () => {
        refreshedEntitlement.resolve(entitlement)
        refreshedReadingState.resolve(
          meetingPosition({ chapterId: destination.id, blockId: olderBlock.id }),
        )
        await Promise.all([refreshedEntitlement.promise, refreshedReadingState.promise])
      })

      expect(await screen.findByRole('heading', { name: destination.title })).toBeInTheDocument()
      expect(document.querySelector('.reader-shell')).toBeInTheDocument()
      expect(document.getElementById(`block-${destinationBlock.id}`)?.getBoundingClientRect().top).toBe(0)
      await waitFor(() =>
        expect(screen.getByRole('progressbar')).toHaveAttribute(
          'aria-valuenow',
          String(progressBeforeRefresh),
        ),
      )
      expect(repository.saveReadingState).not.toHaveBeenCalled()
      expect(scrollIntoView.mock.contexts).toContain(document.getElementById(`block-${destinationBlock.id}`))
      expect(scrollIntoView.mock.contexts).not.toContain(document.getElementById(`block-${olderBlock.id}`))

      const laterBlock = destination.blocks[4]
      if (!laterBlock) throw new Error('meeting-japanese destination later block is required')
      setMeasuredBlockTops(laterBlock.id)
      fireEvent.scroll(window)
      await waitFor(() =>
        expect(repository.saveReadingState).toHaveBeenCalledWith(
          expect.objectContaining({ chapterId: destination.id, blockId: laterBlock.id }),
        ),
      )
      const progressAfterUserScroll = screen.getByRole('progressbar').getAttribute('aria-valuenow')
      expect(progressAfterUserScroll).not.toBeNull()
      const priorEntryKey = screen.getByTestId('location').getAttribute('data-entry-key')
      scrollIntoView.mockClear()
      vi.mocked(repository.saveReadingState).mockClear()

      fireEvent.click(screen.getByRole('button', { name: '目次' }))
      fireEvent.click(
        within(screen.getByRole('dialog', { name: '目次' })).getByRole('link', {
          name: new RegExp(destination.title),
        }),
      )
      await waitFor(() =>
        expect(screen.getByTestId('location').getAttribute('data-entry-key')).not.toBe(priorEntryKey),
      )
      expect(document.getElementById(`block-${laterBlock.id}`)?.getBoundingClientRect().top).toBe(0)
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-valuenow',
        String(progressAfterUserScroll),
      )
      expect(
        vi.mocked(repository.saveReadingState).mock.calls.every(
          ([state]) => state.chapterId === destination.id && state.blockId === laterBlock.id,
        ),
      ).toBe(true)
      expect(repository.saveReadingState).not.toHaveBeenCalledWith(
        expect.objectContaining({ chapterId: destination.id, blockId: destinationBlock.id }),
      )
      expect(scrollIntoView.mock.contexts).not.toContain(document.getElementById(`block-${destinationBlock.id}`))
    },
  )

  it.each(['next', 'toc'] as const)(
    'denies a paid %s destination when the same-owner refresh revokes access',
    async (navigation) => {
      vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
      const scrollIntoView = installScrollIntoViewSpy()
      const currentChapter = meetingBook.chapters.find((chapter) => chapter.id === 'mj-ch-02')
      const destination = meetingBook.chapters.find((chapter) => chapter.id === 'mj-ch-03')
      if (!currentChapter || !destination) throw new Error('meeting-japanese chapter 2 and 3 are required')
      const entitlement = {
        bookId: meetingBook.id,
        provider: 'manual' as const,
        grantedAt: '2026-10-01T00:00:00.000Z',
      }
      const refreshedEntitlement = deferred<typeof entitlement | null>()
      const refreshedReadingState = deferred<ReadingState | null>()
      let entitlementReads = 0
      let readingStateReads = 0
      const base = createMockRepository({ entitlements: { [meetingBook.id]: entitlement } })
      const repository = {
        ...base,
        getEntitlement: vi.fn(() =>
          entitlementReads++ === 0 ? Promise.resolve(entitlement) : refreshedEntitlement.promise,
        ),
        getReadingState: vi.fn(() =>
          readingStateReads++ === 0
            ? Promise.resolve(meetingPosition({ blockId: 'mj-ch02-blk-11' }))
            : refreshedReadingState.promise,
        ),
      }
      const rendered = renderWithAppProviders(<ReaderRoutes />, {
        initialEntries: [`/books/meeting-japanese/read/${currentChapter.slug}?resume=1`],
        session: user,
        repository,
      })

      expect(await screen.findByRole('heading', { name: currentChapter.title })).toBeInTheDocument()
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
      if (navigation === 'next') {
        fireEvent.click(screen.getByRole('link', { name: new RegExp(destination.title) }))
      } else {
        fireEvent.click(screen.getByRole('button', { name: '目次' }))
        fireEvent.click(
          within(screen.getByRole('dialog', { name: '目次' })).getByRole('link', {
            name: new RegExp(destination.title),
          }),
        )
      }
      expect(await screen.findByRole('heading', { name: destination.title })).toBeInTheDocument()
      const revokedBlock = destination.blocks[2]
      setMeasuredBlockTops(revokedBlock.id)
      fireEvent.scroll(window)
      await waitFor(() =>
        expect(repository.saveReadingState).toHaveBeenCalledWith(
          expect.objectContaining({ chapterId: destination.id, blockId: revokedBlock.id }),
        ),
      )

      act(() => rendered.authClient.emitAuthStateChange({ ...user }))
      expect(await screen.findByText('確認中…')).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: destination.title })).not.toBeInTheDocument()
      await waitFor(() => expect(repository.getEntitlement).toHaveBeenCalledTimes(2))
      await waitFor(() => expect(repository.getReadingState).toHaveBeenCalledTimes(2))
      await act(async () => {
        refreshedEntitlement.resolve(null)
        refreshedReadingState.resolve(meetingPosition({ chapterId: destination.id, blockId: revokedBlock.id }))
        await Promise.all([refreshedEntitlement.promise, refreshedReadingState.promise])
      })

      expect(await screen.findByRole('heading', { name: meetingBook.title })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: destination.title })).not.toBeInTheDocument()
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
      expect(document.querySelector('.reader-gate')).toBeInTheDocument()
      expect(scrollIntoView.mock.contexts).not.toContain(document.getElementById(`block-${revokedBlock.id}`))
    },
  )

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
