import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { CANONICAL_CAREER_GAME_ORIGIN } from './lib/cross-product/careerGame'

const CANONICAL_MODES = [
  { label: 'Learn', href: '/learn' },
  { label: 'Read', href: '/read' },
  { label: 'Practice', href: '/practice' },
  { label: 'My Learning', href: '/my-learning' },
  { label: 'Experience', href: '/experience' },
] as const

function renderAt(path: string) {
  vi.stubEnv('BASE_URL', '/')
  window.history.replaceState(null, '', path)
  return render(<App />)
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  window.history.replaceState(null, '', '/')
})

describe('Issue #108 — canonical learning-service IA', () => {
  it('exposes Learn / Read / Practice / My Learning / Experience as the primary navigation', () => {
    renderAt('/')

    const navigation = within(screen.getByRole('banner')).getByRole('navigation')
    for (const mode of CANONICAL_MODES) {
      expect(within(navigation).getByRole('link', { name: mode.label })).toHaveAttribute(
        'href',
        mode.href,
      )
    }

    // Historical Library remains a compatibility/content capability, but it is
    // no longer the platform's primary user-facing mental model.
    expect(within(navigation).queryByRole('link', { name: 'マイライブラリ' })).not.toBeInTheDocument()
  })

  it.each(CANONICAL_MODES)(
    'serves $label as a stable direct route and marks it current',
    ({ label, href }) => {
      renderAt(href)

      expect(
        screen.queryByRole('heading', { name: 'ページが見つかりません' }),
      ).not.toBeInTheDocument()

      const navigation = within(screen.getByRole('banner')).getByRole('navigation')
      expect(within(navigation).getByRole('link', { name: label })).toHaveAttribute(
        'aria-current',
        'page',
      )
    },
  )

  it('makes every canonical mode discoverable from the homepage content, not only the header', () => {
    renderAt('/')

    const main = screen.getByRole('main')
    for (const mode of CANONICAL_MODES) {
      expect(main.querySelector(`a[href="${mode.href}"]`)).not.toBeNull()
    }
  })

  it('positions historical Library / Book / Reader routes as preserved compatibility paths', () => {
    for (const path of [
      '/library',
      '/books/meeting-japanese',
      '/books/meeting-japanese/read/meeting-purpose',
    ]) {
      const view = renderAt(path)
      expect(
        screen.queryByRole('heading', { name: 'ページが見つかりません' }),
      ).not.toBeInTheDocument()
      view.unmount()
    }
  })

  it('keeps Career Game behind the separate Experience boundary', () => {
    renderAt('/experience')

    const main = screen.getByRole('main')
    const careerGameLink = within(main).getByRole('link', {
      name: /Career Game|キャリアゲーム/i,
    })
    expect(careerGameLink).toHaveAttribute('href', `${CANONICAL_CAREER_GAME_ORIGIN}/`)
  })

  it('keeps existing long-form reading capability reachable from Read', () => {
    renderAt('/read')

    const main = screen.getByRole('main')
    expect(main.querySelector('a[href="/library"], a[href^="/books/"]')).not.toBeNull()
  })
})
