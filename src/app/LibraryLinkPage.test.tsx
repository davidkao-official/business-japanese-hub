import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { LibraryLinkPage } from './LibraryLinkPage'

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="resolved location">{`${location.pathname}${location.hash}`}</output>
}

function renderRoute(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/library-link${search}`]}>
      <Routes>
        <Route path="/library-link" element={<LibraryLinkPage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Library stable-link route', () => {
  it('redirects a valid stable reference to the current Reader route', async () => {
    renderRoute(
      '?bookId=book-sample-bj-email&chapterId=bm-ch-3&blockId=bm-ch3-blk-01',
    )

    await waitFor(() =>
      expect(screen.getByLabelText('resolved location')).toHaveTextContent(
        '/books/email-manners/read/requests-and-closings#block-bm-ch3-blk-01',
      ),
    )
  })

  it('renders a graceful unavailable surface for a missing counterpart', () => {
    renderRoute('?bookId=missing&chapterId=also-missing')

    expect(screen.getByRole('heading', { name: '関連する読書が見つかりません' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ライブラリへ戻る' })).toHaveAttribute(
      'href',
      '/library',
    )
  })

  it.each([
    '?bookId=book-sample-bj-email&chapterId=',
    '?bookId=book-sample-bj-email&chapterId=bm-ch-3&blockId=',
  ])('rejects a present-but-empty target id: %s', (search) => {
    renderRoute(search)

    expect(screen.getByRole('heading', { name: '関連する読書が見つかりません' })).toBeInTheDocument()
    expect(screen.queryByLabelText('resolved location')).not.toBeInTheDocument()
  })
})
