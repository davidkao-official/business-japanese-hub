import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { renderWithAppProviders } from '../test/appProviders'
import { HomePage } from './HomePage'

function clickWithoutNavigation(link: HTMLElement) {
  link.addEventListener('click', (event) => event.preventDefault(), { once: true })
  fireEvent.click(link)
}

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

  it('offers a quiet content-neutral link and tracks rapid activation only once', () => {
    const track = vi.fn()
    renderWithAppProviders(<HomePage analytics={{ track }} />)

    const link = screen.getByRole('link', { name: 'ケースをプレイ' })
    expect(link).toHaveAttribute(
      'href',
      'https://business-japanese-career-game.pages.dev/',
    )

    clickWithoutNavigation(link)
    clickWithoutNavigation(link)

    expect(track).toHaveBeenCalledExactlyOnceWith({
      event: 'cross_product_link_clicked',
      direction: 'library_to_career_game',
    })
  })

  it('uses the public Career Game origin override without letting analytics block the link', () => {
    const analytics = {
      track: vi.fn(() => {
        throw new Error('analytics unavailable')
      }),
    }
    renderWithAppProviders(
      <HomePage
        analytics={analytics}
        careerGameOriginValue="https://game-preview.example.jp"
      />,
    )

    const link = screen.getByRole('link', { name: 'ケースをプレイ' })
    expect(link).toHaveAttribute(
      'href',
      'https://game-preview.example.jp/',
    )
    expect(() => clickWithoutNavigation(link)).not.toThrow()
  })
})
