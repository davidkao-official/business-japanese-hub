import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { createMockRepository, renderWithAppProviders } from '../test/appProviders'
import { getBookBySlug } from './catalog'
import { ReaderPage } from './ReaderPage'

const commercialBook = getBookBySlug('meeting-japanese')
if (!commercialBook) throw new Error('missing commercial Book')

const previewChapter = commercialBook.chapters[0]!
const paidChapter = commercialBook.chapters[1]!
const user = { id: 'buyer-1', email: 'buyer@example.com' }

function renderReader(
  chapterSlug: string,
  options: {
    session?: typeof user | null
    repository?: ReturnType<typeof createMockRepository> | null
  } = {},
) {
  return renderWithAppProviders(
    <Routes>
      <Route path="/books/:slug/read/:chapterSlug" element={<ReaderPage />} />
    </Routes>,
    {
      initialEntries: [`/books/meeting-japanese/read/${chapterSlug}`],
      session: options.session ?? null,
      repository: options.repository ?? null,
    },
  )
}

describe('commercial Book reader access', () => {
  it('allows anonymous reading of the declared first-chapter preview', async () => {
    renderReader(previewChapter.slug)

    expect(
      await screen.findByRole('heading', { level: 1, name: previewChapter.title }),
    ).toBeInTheDocument()
    expect(screen.queryByText('この先はプレビューの範囲外です。')).not.toBeInTheDocument()
  })

  it('denies a direct paid-chapter URL without authoritative entitlement', async () => {
    renderReader(paidChapter.slug)

    expect(await screen.findByText('この先はプレビューの範囲外です。')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: paidChapter.title })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /購入する/ })).toBeInTheDocument()
  })

  it('unlocks the paid chapter only when the repository returns an entitlement', async () => {
    const repository = createMockRepository({
      entitlements: {
        [commercialBook.id]: {
          bookId: commercialBook.id,
          provider: 'manual',
          grantedAt: '2026-08-20T00:00:00.000Z',
        },
      },
    })
    renderReader(paidChapter.slug, { session: user, repository })

    expect(
      await screen.findByRole('heading', { level: 1, name: paidChapter.title }),
    ).toBeInTheDocument()
    expect(repository.getEntitlement).toHaveBeenCalledWith(commercialBook.id)
  })
})
