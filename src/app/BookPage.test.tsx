import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithAppProviders, createMockRepository } from '../test/appProviders'
import type { PurchaseExecutor } from '../lib/purchase/types'
import { BookPage } from './BookPage'

/**
 * These unit tests isolate the §8.3 CTA matrix with the compact synthetic paid
 * fixture; production commercial-Book coverage lives in catalog, storefront,
 * and commercial reader-access integration tests.
 */
vi.mock('../reader/catalog', async () => {
  const { paidKeigoBook } = await import('../content/fixtures/paid-test-books')
  const { secondBook } = await import('../content/fixtures/second-book')
  return {
    getBookBySlug: (slug: string) => {
      if (slug === paidKeigoBook.slug) return paidKeigoBook
      if (slug === secondBook.slug) return secondBook
      return undefined
    },
    getCatalogEntry: (slug: string) => {
      if (slug === paidKeigoBook.slug) return { book: paidKeigoBook, previewBoundary: { chapterId: 'ch-1' } }
      if (slug === secondBook.slug) return { book: secondBook }
      return undefined
    },
  }
})

const user = { id: 'u-1', email: 'reader@example.com' }
const paidKeigoId = 'book-test-paid-keigo'
const retiredNotice = 'この書籍の続きは現在提供していません。以前にご購入いただいた方は、ログインすると続きを読めます。'

function expectNoPurchase() {
  expect(screen.queryByRole('button', { name: /購入する/ })).not.toBeInTheDocument()
  expect(screen.queryByText(/¥880|USD\s*12/)).not.toBeInTheDocument()
  expect(screen.queryByText('決済は準備中です。')).not.toBeInTheDocument()
}

function granted(bookId: string) {
  return { bookId, provider: 'manual' as const, grantedAt: '2026-08-01T00:00:00.000Z' }
}

interface RenderBookOptions {
  session?: typeof user | null
  repository?: ReturnType<typeof createMockRepository>
  purchaseExecutor?: PurchaseExecutor
}

function renderBook(slug: string, options: RenderBookOptions = {}) {
  return renderWithAppProviders(
    <Routes>
      <Route path="/books/:slug" element={<BookPage />} />
    </Routes>,
    {
      initialEntries: [`/books/${slug}`],
      session: options.session ?? null,
      repository: options.repository ?? null,
      purchaseExecutor: options.purchaseExecutor,
    },
  )
}

describe('book detail — paid CTA state matrix (§8.3)', () => {
  it('signed-out non-owners see historical access, free reading and the existing login entry', async () => {
    renderBook('keigo-essentials')

    expect(await screen.findByText(retiredNotice)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '試し読み' })).toHaveAttribute(
      'href', '/books/keigo-essentials/read/keigo-basics',
    )
    expect(screen.getByRole('link', { name: '無料で読める教材を見る' })).toHaveAttribute('href', '/read')
    expectNoPurchase()
    fireEvent.click(await screen.findByRole('button', { name: 'ログイン' }))
    expect(screen.getByRole('textbox', { name: 'メールアドレス' })).toBeInTheDocument()
  })

  it('signed-in non-owners see the same reading paths without another login entry or checkout', async () => {
    const purchaseExecutor = vi.fn()
    const repository = createMockRepository()
    renderBook('keigo-essentials', { session: user, repository, purchaseExecutor })

    expect(await screen.findByText(retiredNotice)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '試し読み' })).toHaveAttribute(
      'href', '/books/keigo-essentials/read/keigo-basics',
    )
    expect(screen.getByRole('link', { name: '無料で読める教材を見る' })).toHaveAttribute('href', '/read')
    expect(screen.queryByRole('button', { name: 'ログイン' })).not.toBeInTheDocument()
    expectNoPurchase()
    expect(purchaseExecutor).not.toHaveBeenCalled()
  })

  it.each([false, true])('keeps a neutral reserved layout until ownership resolves to %s', async (owned) => {
    const repository = createMockRepository()
    let resolveEntitlement!: (value: ReturnType<typeof granted> | null) => void
    vi.mocked(repository.getEntitlement).mockReturnValue(new Promise((resolve) => { resolveEntitlement = resolve }))
    const { container } = renderBook('keigo-essentials', { session: user, repository })

    // Auth restore and then the deferred repository read must both stay neutral.
    expect(screen.getByRole('status')).toHaveTextContent('確認中…')
    expectNoPurchase()
    await waitFor(() => expect(repository.getEntitlement).toHaveBeenCalledWith(paidKeigoId))
    const reserve = container.querySelector('.book-actions__reserve')
    expect(reserve).toHaveAttribute('aria-hidden', 'true')
    expect(reserve?.querySelector('a, button, input')).toBeNull()
    expect(screen.queryByText(retiredNotice)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '試し読み' })).toHaveAttribute(
      'href', '/books/keigo-essentials/read/keigo-basics',
    )

    await act(async () => resolveEntitlement(owned ? granted(paidKeigoId) : null))
    if (owned) {
      expect(await screen.findByRole('link', { name: '読み始める' })).toBeInTheDocument()
      expect(screen.getByText('取得済み')).toBeInTheDocument()
      expect(screen.queryByText(retiredNotice)).not.toBeInTheDocument()
    } else {
      expect(await screen.findByText(retiredNotice)).toBeInTheDocument()
    }
    expect(container.querySelector('.book-actions__reserve')).toBe(reserve)
    expectNoPurchase()
  })

  it('paid + owned + progress → 続きを読む to the resume chapter', async () => {
    const repository = createMockRepository({
      entitlements: { [paidKeigoId]: granted(paidKeigoId) },
      readingStates: {
        [paidKeigoId]: {
          bookId: paidKeigoId,
          chapterId: 'ch-2',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      },
    })
    renderBook('keigo-essentials', { session: user, repository })

    const resume = await screen.findByRole('link', { name: '続きを読む' })
    expect(resume).toHaveAttribute('href', '/books/keigo-essentials/read/keigo-in-meetings?resume=1')
    expect(screen.queryByRole('button', { name: /購入する/ })).not.toBeInTheDocument()
  })

  it('paid + owned + unread → 読み始める', async () => {
    const repository = createMockRepository({ entitlements: { [paidKeigoId]: granted(paidKeigoId) } })
    renderBook('keigo-essentials', { session: user, repository })

    const start = await screen.findByRole('link', { name: '読み始める' })
    expect(start).toHaveAttribute('href', '/books/keigo-essentials/read/keigo-basics')
    expect(screen.getByRole('link', { name: '目次を見る' })).toHaveAttribute('href', '#book-toc')
    expect(screen.getByText('取得済み')).toBeInTheDocument()
    expect(screen.queryByText(retiredNotice)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '無料で読める教材を見る' })).not.toBeInTheDocument()
    expectNoPurchase()
  })
})

describe('book detail — free Prototype', () => {
  it('shows Japanese as a display name in book metadata', async () => {
    renderBook('email-manners')

    await waitFor(() => expect(screen.getByText('日本語')).toBeInTheDocument())
    expect(screen.queryByText('ja')).not.toBeInTheDocument()
  })

  it('free tier shows 無料 and a free-reading CTA, never a purchase affordance', async () => {
    renderBook('email-manners')

    await waitFor(() => expect(screen.getByRole('link', { name: '読み始める' })).toBeInTheDocument())
    expect(screen.getByText('無料')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /購入する/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '試し読み' })).not.toBeInTheDocument()
  })

  it('free books show a free-reading note, never a purchase-preview note', async () => {
    renderBook('email-manners')

    await waitFor(() => expect(screen.getByRole('link', { name: '読み始める' })).toBeInTheDocument())
    expect(screen.getByText('この本は全章を無料でお読みいただけます。')).toBeInTheDocument()
    expect(screen.queryByText('購入の前に、無料プレビューをお試しください。')).not.toBeInTheDocument()
  })

  it('renders publisher-like sections: about, audience, toc, publication', async () => {
    renderBook('email-manners')

    expect(screen.getByRole('heading', { name: 'この本について' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '想定読者' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '目次' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '書籍情報' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /メールの基本構成/ })).toBeInTheDocument()
  })
})

describe('book detail — not-found', () => {
  it('shows a quiet not-found state for an unknown book (with the slug)', async () => {
    renderBook('not-a-book')

    expect(screen.getByRole('heading', { name: 'この書籍は見つかりませんでした。' })).toBeInTheDocument()
    expect(screen.getByTestId('book-slug')).toHaveTextContent('not-a-book')
  })

  it('does not issue user-state requests for an unknown book', async () => {
    // Regression (CodeRabbit): an unknown slug must not trigger entitlement /
    // reading-state fetches against the backend.
    const repository = createMockRepository()
    renderBook('not-a-book', { session: user, repository })

    await screen.findByRole('heading', { name: 'この書籍は見つかりませんでした。' })
    expect(repository.getEntitlement).not.toHaveBeenCalled()
    expect(repository.getReadingState).not.toHaveBeenCalled()
  })

})
