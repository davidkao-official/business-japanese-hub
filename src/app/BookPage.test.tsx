import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithAppProviders, createMockRepository } from '../test/appProviders'
import type { PurchaseExecutor } from '../lib/purchase/types'
import { BookPage } from './BookPage'
import { sampleBook } from '../content/fixtures/sample-book'

const user = { id: 'u-1', email: 'reader@example.com' }

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

describe('book detail — CTA state matrix', () => {
  it('paid + unowned + preview → 購入する / 試し読み', async () => {
    renderBook(sampleBook.slug)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /購入する/ })).toBeInTheDocument(),
    )
    expect(screen.getByRole('link', { name: '試し読み' })).toHaveAttribute(
      'href',
      `/books/${sampleBook.slug}/read/keigo-basics`,
    )
    expect(screen.getByText('¥880')).toBeInTheDocument()
  })

  it('paid + owned + progress → 続きを読む to the resume chapter', async () => {
    const repository = createMockRepository({
      entitlements: { [sampleBook.id]: granted(sampleBook.id) },
      readingStates: {
        [sampleBook.id]: {
          bookId: sampleBook.id,
          chapterId: 'ch-2',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      },
    })
    renderBook(sampleBook.slug, { session: user, repository })

    const resume = await screen.findByRole('link', { name: '続きを読む' })
    expect(resume).toHaveAttribute('href', `/books/${sampleBook.slug}/read/keigo-in-meetings`)
    expect(screen.queryByRole('button', { name: /購入する/ })).not.toBeInTheDocument()
  })

  it('paid + owned + unread → 読み始める', async () => {
    const repository = createMockRepository({ entitlements: { [sampleBook.id]: granted(sampleBook.id) } })
    renderBook(sampleBook.slug, { session: user, repository })

    const start = await screen.findByRole('link', { name: '読み始める' })
    expect(start).toHaveAttribute('href', `/books/${sampleBook.slug}/read/keigo-basics`)
  })

  it('renders publisher-like sections: about, audience, toc, publication', async () => {
    renderBook(sampleBook.slug)

    expect(screen.getByRole('heading', { name: 'この本について' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '想定読者' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '目次' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '書籍情報' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /敬語の基本/ })).toBeInTheDocument()
  })

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

describe('purchase seam on the detail page', () => {
  it('the 購入する CTA reports that payment is not available yet (#9 swaps the executor)', async () => {
    renderBook(sampleBook.slug)

    const buy = await screen.findByRole('button', { name: /購入する/ })
    fireEvent.click(buy)
    // Declare a consumer jurisdiction to reach the executor (fail-closed gate).
    fireEvent.click(screen.getByRole('button', { name: '日本の消費者' }))

    expect(await screen.findByText('決済は準備中です。')).toBeInTheDocument()
  })

  it('degrades to the unavailable note when the purchase executor rejects (never stuck pending)', async () => {
    renderBook(sampleBook.slug, {
      purchaseExecutor: async () => {
        throw new Error('checkout offline')
      },
    })

    const buy = await screen.findByRole('button', { name: /購入する/ })
    fireEvent.click(buy)
    fireEvent.click(screen.getByRole('button', { name: '日本の消費者' }))

    expect(await screen.findByText('決済は準備中です。')).toBeInTheDocument()
    // The CTA must not stay disabled/pending after a rejection.
    expect(screen.getByRole('button', { name: /購入する/ })).not.toBeDisabled()
  })
})
