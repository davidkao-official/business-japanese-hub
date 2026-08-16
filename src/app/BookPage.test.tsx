import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithAppProviders, createMockRepository } from '../test/appProviders'
import type { PurchaseExecutor } from '../lib/purchase/types'
import { BookPage } from './BookPage'

/**
 * The production catalog only registers free Prototype books, so the paid
 * §8.3 CTA-matrix tests resolve `keigo-essentials` to the paid synthetic
 * fixture via a catalog mock; free Prototype behavior uses `email-manners`.
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
  it('paid + unowned + preview → 購入する / 試し読み', async () => {
    renderBook('keigo-essentials')

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /購入する/ })).toBeInTheDocument(),
    )
    expect(screen.getByRole('link', { name: '試し読み' })).toHaveAttribute(
      'href',
      '/books/keigo-essentials/read/keigo-basics',
    )
    expect(screen.getByText('¥880')).toBeInTheDocument()
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
    expect(resume).toHaveAttribute('href', '/books/keigo-essentials/read/keigo-in-meetings')
    expect(screen.queryByRole('button', { name: /購入する/ })).not.toBeInTheDocument()
  })

  it('paid + owned + unread → 読み始める', async () => {
    const repository = createMockRepository({ entitlements: { [paidKeigoId]: granted(paidKeigoId) } })
    renderBook('keigo-essentials', { session: user, repository })

    const start = await screen.findByRole('link', { name: '読み始める' })
    expect(start).toHaveAttribute('href', '/books/keigo-essentials/read/keigo-basics')
  })
})

describe('book detail — free Prototype', () => {
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

describe('book detail — not-found + purchase seam', () => {
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

  it('the paid 購入する CTA reports that payment is not available yet (#9 swaps the executor)', async () => {
    renderBook('keigo-essentials')

    const buy = await screen.findByRole('button', { name: /購入する/ })
    fireEvent.click(buy)
    // Declare JP, then proceed only after the exact versioned disclosures have
    // been rendered. The executor must not be reached before this confirmation.
    fireEvent.click(screen.getByRole('button', { name: '日本の消費者' }))
    fireEvent.click(screen.getByRole('button', { name: '同意して購入する' }))

    expect(await screen.findByText('決済は準備中です。')).toBeInTheDocument()
  })

  it('degrades to the unavailable note when the purchase executor rejects (never stuck pending)', async () => {
    renderBook('keigo-essentials', {
      purchaseExecutor: async () => {
        throw new Error('checkout offline')
      },
    })

    const buy = await screen.findByRole('button', { name: /購入する/ })
    fireEvent.click(buy)
    fireEvent.click(screen.getByRole('button', { name: '日本の消費者' }))
    fireEvent.click(screen.getByRole('button', { name: '同意して購入する' }))

    expect(await screen.findByText('決済は準備中です。')).toBeInTheDocument()
    // The CTA must not stay disabled/pending after a rejection.
    expect(screen.getByRole('button', { name: /購入する/ })).not.toBeDisabled()
  })
})
