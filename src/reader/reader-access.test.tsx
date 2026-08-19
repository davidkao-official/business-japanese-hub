/**
 * Reader access-control tests (issue #6 / #31): the entitlement gate meets the
 * Universal Reader. Verifies paid-boundary denial, public preview without
 * sign-in, owned access, block-prefix boundaries, malformed-boundary denial,
 * resume routing, and free-tier public reading.
 *
 * This focused suite uses a compact synthetic paid fixture to exercise extra
 * boundary shapes. The authored commercial Book's production integration is
 * covered separately in commercial-reader-access.test.tsx.
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { createMockRepository, renderWithAppProviders } from '../test/appProviders'
import { paidKeigoBook } from '../content/fixtures/paid-test-books'
import { ReaderGate } from './ReaderGate'
import { ReaderPage } from './ReaderPage'
import { ReaderShell } from './ReaderShell'

vi.mock('./catalog', async () => {
  const { paidKeigoBook: paid } = await import('../content/fixtures/paid-test-books')
  const { secondBook: freeEmail } = await import('../content/fixtures/second-book')
  return {
    getBookBySlug: (slug: string) => {
      if (slug === paid.slug) return paid
      if (slug === freeEmail.slug) return freeEmail
      return undefined
    },
    getCatalogEntry: (slug: string) => {
      if (slug === paid.slug) return { book: paid, previewBoundary: { chapterId: 'ch-1' } }
      if (slug === freeEmail.slug) return { book: freeEmail }
      return undefined
    },
  }
})

const user = { id: 'u-1', email: 'reader@example.com' }
const paidKeigoId = paidKeigoBook.id

function granted(bookId: string) {
  return { bookId, provider: 'manual' as const, grantedAt: '2026-08-01T00:00:00.000Z' }
}

function renderReaderRoute(
  initialEntry: string,
  options: {
    repository?: ReturnType<typeof createMockRepository>
    session?: typeof user | null
  } = {},
) {
  return renderWithAppProviders(
    <Routes>
      <Route path="/books/:slug/read" element={<ReaderPage />} />
      <Route path="/books/:slug/read/:chapterSlug" element={<ReaderPage />} />
    </Routes>,
    {
      initialEntries: [initialEntry],
      session: options.session ?? null,
      repository: options.repository ?? null,
    },
  )
}

describe('reader entitlement gate', () => {
  it('denies a paid chapter beyond the preview boundary (no content flashes)', async () => {
    renderReaderRoute('/books/keigo-essentials/read/keigo-in-meetings')

    expect(await screen.findByText('この先はプレビューの範囲外です。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /購入する/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '会議での敬語' })).not.toBeInTheDocument()
  })

  it('renders the preview chapter without sign-in (public preview has no friction)', async () => {
    renderReaderRoute('/books/keigo-essentials/read/keigo-basics')

    expect(
      await screen.findByRole('heading', { level: 1, name: '敬語の基本' }),
    ).toBeInTheDocument()
  })

  it('renders a paid chapter once the book is owned', async () => {
    const repository = createMockRepository({ entitlements: { [paidKeigoId]: granted(paidKeigoId) } })
    renderReaderRoute('/books/keigo-essentials/read/keigo-in-meetings', { session: user, repository })

    expect(
      await screen.findByRole('heading', { level: 1, name: '会議での敬語' }),
    ).toBeInTheDocument()
  })

  it('renders every free Prototype chapter anonymously (tier: free, no gate)', async () => {
    // The free Prototype book has no preview boundary: chapter 3 (beyond where
    // a paid boundary would cut) must render without sign-in or ownership.
    renderReaderRoute('/books/email-manners/read/requests-and-closings')

    expect(
      await screen.findByRole('heading', { level: 1, name: '依頼と締めの表現' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('この先はプレビューの範囲外です。')).not.toBeInTheDocument()
  })
})

describe('block-level preview boundary', () => {
  it('hides blocks beyond the boundary and marks the cut (incl. the marginalia rail)', () => {
    const { container } = render(
      <MemoryRouter>
        <ReaderShell
          book={paidKeigoBook}
          chapter={paidKeigoBook.chapters[0]}
          previewBoundary={{ chapterId: 'ch-1', blockId: 'ch1-blk-03' }}
        />
      </MemoryRouter>,
    )

    // Blocks up to ch1-blk-03 are readable…
    expect(screen.getByText('敬語とは')).toBeInTheDocument()
    expect(screen.getByText(/誰が、誰に向かって、何を/)).toBeInTheDocument()
    // …the vocabulary block beyond the boundary is not rendered…
    expect(screen.queryByRole('button', { name: '敬語' })).not.toBeInTheDocument()
    // …and the inline boundary marker is shown.
    expect(screen.getByText('ここから先は購入後にお読みいただけます。')).toBeInTheDocument()
    // Paid content must not leak sideways into the marginalia rail either.
    expect(container.querySelector('.reader-marginalia')).toBeNull()
  })

  it('denies everything for a malformed boundary (unknown block id)', () => {
    render(
      <MemoryRouter>
        <ReaderShell
          book={paidKeigoBook}
          chapter={paidKeigoBook.chapters[0]}
          previewBoundary={{ chapterId: 'ch-1', blockId: 'does-not-exist' }}
        />
      </MemoryRouter>,
    )

    // Deny-by-default: a boundary that does not resolve hides all content.
    expect(screen.getByText('ここから先は購入後にお読みいただけます。')).toBeInTheDocument()
    expect(screen.queryByText('敬語とは')).not.toBeInTheDocument()
  })
})

describe('reader gate surface', () => {
  it('shows the locked message when a paid book offers no preview', () => {
    render(
      <MemoryRouter>
        <ReaderGate book={paidKeigoBook} hasPreview={false} />
      </MemoryRouter>,
    )

    expect(screen.getByText('この書籍は購入後に読むことができます。')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '試し読み' })).not.toBeInTheDocument()
  })
})

describe('resume routing', () => {
  it('routes /read into the persisted reading-state chapter', async () => {
    const repository = createMockRepository({
      entitlements: { [paidKeigoId]: granted(paidKeigoId) },
      readingStates: {
        [paidKeigoId]: { bookId: paidKeigoId, chapterId: 'ch-2', updatedAt: '2026-08-01T00:00:00.000Z' },
      },
    })
    renderReaderRoute('/books/keigo-essentials/read', { session: user, repository })

    expect(
      await screen.findByRole('heading', { level: 1, name: '会議での敬語' }),
    ).toBeInTheDocument()
  })

  it('falls back to the first readable chapter when the saved position is no longer readable', async () => {
    // Reading state points at a paid chapter, but ownership is gone → resume
    // must not route past the boundary.
    const repository = createMockRepository({
      readingStates: {
        [paidKeigoId]: { bookId: paidKeigoId, chapterId: 'ch-2', updatedAt: '2026-08-01T00:00:00.000Z' },
      },
    })
    renderReaderRoute('/books/keigo-essentials/read', { session: user, repository })

    expect(
      await screen.findByRole('heading', { level: 1, name: '敬語の基本' }),
    ).toBeInTheDocument()
  })

  it('resumes a free Prototype book without sign-in', async () => {
    renderReaderRoute('/books/email-manners/read')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'メールの基本構成' }),
    ).toBeInTheDocument()
  })
})
