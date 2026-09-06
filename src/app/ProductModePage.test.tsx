import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { CANONICAL_CAREER_GAME_ORIGIN } from '../lib/cross-product/careerGame'
import { renderWithAppProviders } from '../test/appProviders'
import { ProductModePage } from './ProductModePage'

describe('product mode gateways', () => {
  it('keeps Read anchored to the stable Library route without a book-slug dependency', () => {
    renderWithAppProviders(<ProductModePage mode="read" />)

    expect(screen.getByRole('link', { name: 'Browse the Library' })).toHaveAttribute(
      'href',
      '/library',
    )
    expect(document.querySelector('a[href="/books/meeting-japanese"]')).toBeNull()
  })

  it('keeps Experience linked to the separate Career Game origin', () => {
    renderWithAppProviders(<ProductModePage mode="experience" />)

    expect(screen.getByRole('link', { name: 'Open Career Game' })).toHaveAttribute(
      'href',
      `${CANONICAL_CAREER_GAME_ORIGIN}/`,
    )
  })

  it('preserves cross-product activation analytics while keeping the external link usable', () => {
    const track = vi.fn()
    renderWithAppProviders(<ProductModePage mode="experience" analytics={{ track }} />)

    const link = screen.getByRole('link', { name: 'Open Career Game' })
    const clickWithoutNavigation = () => {
      link.addEventListener('click', (event) => event.preventDefault(), { once: true })
      fireEvent.click(link)
    }
    clickWithoutNavigation()
    clickWithoutNavigation()

    expect(track).toHaveBeenCalledExactlyOnceWith({
      event: 'cross_product_link_clicked',
      direction: 'library_to_career_game',
    })
  })
})
