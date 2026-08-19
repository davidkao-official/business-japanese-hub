import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithAppProviders } from '../test/appProviders'
import { HomePage } from './HomePage'

describe('storefront', () => {
  it('features the commercial Book and lists both free Books as a compact shelf', async () => {
    renderWithAppProviders(<HomePage />)

    expect(screen.getByRole('heading', { name: '会議の日本語' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'すべての書籍' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /ビジネス日本語：敬語の基礎/ })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /ビジネスメールの作法/ })).toBeInTheDocument()
    })
  })

  it('shows authoritative USD pricing plus purchase and preview actions for the paid feature', async () => {
    renderWithAppProviders(<HomePage />)

    await waitFor(() => expect(screen.getAllByText('USD 12').length).toBeGreaterThan(0))
    expect(screen.getByRole('button', { name: '購入する（USD 12）' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '試し読み' })).toHaveAttribute(
      'href',
      '/books/meeting-japanese/read/meeting-purpose',
    )
  })

  it('keeps the two Prototype books visibly free without changing their access tier', async () => {
    renderWithAppProviders(<HomePage />)

    await waitFor(() => expect(screen.getAllByText('無料')).toHaveLength(2))
    expect(screen.queryByText('¥880')).not.toBeInTheDocument()
    expect(screen.queryByText('¥660')).not.toBeInTheDocument()
  })
})
