import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { CANONICAL_CAREER_GAME_ORIGIN } from '../lib/cross-product/careerGame'
import { getStrings, setLocalePreference } from '../i18n/strings'
import { renderWithAppProviders } from '../test/appProviders'
import { ProductModePage } from './ProductModePage'

beforeEach(() => {
  setLocalePreference('ja')
})

afterEach(() => {
  setLocalePreference(null)
})

describe('product mode gateways', () => {
  it('keeps Read anchored to the stable Library route without a book-slug dependency', () => {
    renderWithAppProviders(<ProductModePage mode="read" />)

    expect(screen.getByRole('link', { name: getStrings('ja').learningModes.read.browseLibrary })).toHaveAttribute(
      'href',
      '/library',
    )
    expect(document.querySelector('a[href="/books/meeting-japanese"]')).toBeNull()
  })

  it('keeps Experience linked to the separate Career Game origin', () => {
    renderWithAppProviders(<ProductModePage mode="experience" />)

    expect(
      screen.getByRole('link', { name: getStrings('ja').learningModes.experience.openCareerGame }),
    ).toHaveAttribute(
      'href',
      `${CANONICAL_CAREER_GAME_ORIGIN}/`,
    )
  })

  it('preserves cross-product activation analytics while keeping the external link usable', () => {
    const track = vi.fn()
    renderWithAppProviders(<ProductModePage mode="experience" analytics={{ track }} />)

    const link = screen.getByRole('link', {
      name: getStrings('ja').learningModes.experience.openCareerGame,
    })
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

  it('renders typed locale copy while keeping the canonical mode name language-scoped', () => {
    setLocalePreference('zh-TW')
    renderWithAppProviders(<ProductModePage mode="read" />)

    const strings = getStrings('zh-TW')
    expect(
      screen.getByRole('heading', { level: 1, name: strings.learningModes.modes.read.title }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: strings.learningModes.read.browseLibrary }),
    ).toHaveAttribute('href', '/library')
    expect(
      screen.getByRole('navigation', { name: strings.learningModes.navigationLabel }),
    ).toBeInTheDocument()

    const eyebrow = document.querySelector('.product-mode-page__eyebrow')
    expect(eyebrow).toHaveAttribute('lang', 'en')
    expect(eyebrow).toHaveTextContent('Read')
  })
})
