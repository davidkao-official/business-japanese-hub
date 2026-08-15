import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithAppProviders, createMockRepository } from '../test/appProviders'
import { LibraryPage } from './LibraryPage'
import { sampleBook } from '../content/fixtures/sample-book'
import { secondBook } from '../content/fixtures/second-book'

const user = { id: 'u-1', email: 'reader@example.com' }

function granted(bookId: string) {
  return { bookId, provider: 'manual' as const, grantedAt: '2026-08-01T00:00:00.000Z' }
}

function renderLibrary(options: { session?: typeof user | null; repository?: ReturnType<typeof createMockRepository> } = {}) {
  return renderWithAppProviders(<LibraryPage />, {
    session: options.session ?? null,
    repository: options.repository ?? null,
  })
}

describe('personal library', () => {
  it('shows the signed-out state without a session', async () => {
    renderLibrary()

    expect(screen.getByRole('heading', { name: 'マイライブラリ' })).toBeInTheDocument()
    expect(
      await screen.findByText('ログインすると、購入した書籍と読書の進捗がここに表示されます。'),
    ).toBeInTheDocument()
  })

  it('shows the empty state when the user owns nothing', async () => {
    renderLibrary({ session: user, repository: createMockRepository() })

    expect(await screen.findByText('まだ書籍を購入していません。')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '書籍を探す' })).toHaveAttribute('href', '/')
  })

  it('puts books with a reading state in the 続きを読む section with a resume href', async () => {
    const repository = createMockRepository({
      entitlements: {
        [sampleBook.id]: granted(sampleBook.id),
        [secondBook.id]: granted(secondBook.id),
      },
      readingStates: {
        [sampleBook.id]: {
          bookId: sampleBook.id,
          chapterId: 'ch-2',
          updatedAt: '2026-08-02T00:00:00.000Z',
        },
      },
    })
    renderLibrary({ session: user, repository })

    expect(
      await screen.findByRole('heading', { name: '続きを読む' }),
    ).toBeInTheDocument()
    // The same title appears in both the continue-reading tile and the owned
    // shelf; the resume href must be present among the title's links.
    const titleLinks = screen.getAllByRole('link', { name: new RegExp(sampleBook.title) })
    expect(titleLinks.map((link) => link.getAttribute('href'))).toContain(
      `/books/${sampleBook.slug}/read/keigo-in-meetings`,
    )
    // Progress indicators are present (thin line + %), never a completion chart.
    expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0)
  })

  it('lists an owned-but-unread book under 所有している本 with a start action', async () => {
    const repository = createMockRepository({
      entitlements: { [secondBook.id]: granted(secondBook.id) },
    })
    renderLibrary({ session: user, repository })

    expect(await screen.findByRole('heading', { name: '所有している本' })).toBeInTheDocument()
    const tile = screen.getByRole('link', { name: new RegExp(secondBook.title) })
    // Unread owned books route into the reader entry (which resolves to the
    // first chapter).
    expect(tile).toHaveAttribute('href', `/books/${secondBook.slug}/read`)
    expect(screen.queryByRole('heading', { name: '続きを読む' })).not.toBeInTheDocument()
  })

  it('surfaces a load failure with a retry that re-runs the fetch', async () => {
    const repository = createMockRepository()
    const failingRepository = {
      ...repository,
      getEntitlement: vi.fn(async () => {
        throw new Error('network down')
      }),
    }
    renderLibrary({ session: user, repository: failingRepository })

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent('ライブラリの読み込み中にエラーが発生しました。')
    const retry = screen.getByRole('button', { name: '再試行' })
    expect(retry).toBeInTheDocument()

    // Re-pointing the mock to succeed and clicking retry recovers.
    ;(failingRepository.getEntitlement as Mock).mockResolvedValue(null)
    fireEvent.click(retry)
    await waitFor(() =>
      expect(screen.getByText('まだ書籍を購入していません。')).toBeInTheDocument(),
    )
  })
})
