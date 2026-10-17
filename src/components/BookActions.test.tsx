import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithAppProviders } from '../test/appProviders'
import { BookActions } from './BookActions'
import { paidKeigoBook } from '../content/fixtures/paid-test-books'

describe('BookActions — retired purchase state (#202 G2)', () => {
  it('offers free reading and login even when no preview exists', async () => {
    renderWithAppProviders(<BookActions book={paidKeigoBook} cta={{ primary: 'purchase' }} />)

    expect(screen.getByText(/この書籍の続きは現在提供していません/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '無料で読める教材を見る' })).toHaveAttribute('href', '/read')
    expect(await screen.findByRole('button', { name: 'ログイン' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '試し読み' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /購入する/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/¥880|決済は準備中/)).not.toBeInTheDocument()
  })

  it('shows a neutral pending state with no checkout wording or controls', () => {
    const { container } = renderWithAppProviders(
      <BookActions book={paidKeigoBook} cta={{ primary: 'purchase' }} loading />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('確認中…')
    expect(screen.getByRole('status').parentElement).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelector('.book-actions__reserve')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText(/¥880|決済は準備中/)).not.toBeInTheDocument()
  })
})
