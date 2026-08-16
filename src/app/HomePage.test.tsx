import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithAppProviders } from '../test/appProviders'
import { HomePage } from './HomePage'
import { sampleBook } from '../content/fixtures/sample-book'
import { secondBook } from '../content/fixtures/second-book'

describe('storefront', () => {
  it('features the first catalog entry and lists the rest as a compact shelf', async () => {
    renderWithAppProviders(<HomePage />)

    expect(screen.getByRole('heading', { name: sampleBook.title })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'すべての書籍' })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('link', { name: new RegExp(secondBook.title) })).toBeInTheDocument(),
    )
  })

  it('shows the free tier and a free-reading CTA for the Prototype feature (no purchase)', async () => {
    renderWithAppProviders(<HomePage />)

    await waitFor(() => expect(screen.getAllByText('無料').length).toBeGreaterThan(0))
    expect(screen.getByRole('link', { name: '読み始める' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /購入する/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '試し読み' })).not.toBeInTheDocument()
  })

  it('never exposes purchase/payment affordances on the Prototype storefront', async () => {
    renderWithAppProviders(<HomePage />)

    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: '読み始める' }).length).toBeGreaterThan(0),
    )
    expect(screen.queryByText('¥880')).not.toBeInTheDocument()
    expect(screen.queryByText('¥660')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /購入する/ })).not.toBeInTheDocument()
  })
})
