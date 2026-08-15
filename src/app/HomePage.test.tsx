import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithAppProviders, createMockRepository } from '../test/appProviders'
import { HomePage } from './HomePage'
import { sampleBook } from '../content/fixtures/sample-book'
import { secondBook } from '../content/fixtures/second-book'

const user = { id: 'u-1', email: 'reader@example.com' }

function granted(bookId: string) {
  return { bookId, provider: 'manual' as const, grantedAt: '2026-08-01T00:00:00.000Z' }
}

describe('storefront', () => {
  it('features the first catalog entry and lists the rest as a compact shelf', async () => {
    renderWithAppProviders(<HomePage />)

    expect(screen.getByRole('heading', { name: sampleBook.title })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'すべての書籍' })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('link', { name: new RegExp(secondBook.title) })).toBeInTheDocument(),
    )
  })

  it('shows the price and purchase/preview CTAs for an unowned paid feature', async () => {
    renderWithAppProviders(<HomePage />)

    await waitFor(() => expect(screen.getByText('¥880')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /購入する/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '試し読み' })).toBeInTheDocument()
  })

  it('shows 取得済み and a read CTA instead of purchase once owned', async () => {
    const repository = createMockRepository({ entitlements: { [sampleBook.id]: granted(sampleBook.id) } })
    renderWithAppProviders(<HomePage />, { session: user, repository })

    await waitFor(() => expect(screen.getByText('取得済み')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: '読み始める' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /購入する/ })).not.toBeInTheDocument()
  })

  it('marks an owned compact-catalog card as 取得済み instead of its price', async () => {
    const repository = createMockRepository({ entitlements: { [secondBook.id]: granted(secondBook.id) } })
    renderWithAppProviders(<HomePage />, { session: user, repository })

    // The featured book stays unowned (¥880); the owned card shows 取得済み.
    await waitFor(() => expect(screen.getAllByText('取得済み').length).toBeGreaterThan(0))
    expect(screen.queryByText('¥660')).not.toBeInTheDocument()
  })
})
