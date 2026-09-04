import { act, fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useLocation, useNavigate } from 'react-router-dom'
import { renderWithAppProviders } from '../test/appProviders'
import { Header } from './Header'

function BackButton() {
  const navigate = useNavigate()
  return <button onClick={() => navigate(-1)}>Go back</button>
}

function CurrentPath() {
  const location = useLocation()
  return <output>{location.pathname}</output>
}

describe('Header mobile navigation', () => {
  it('opens the existing navigation with account and appearance controls', () => {
    renderWithAppProviders(<Header />)

    const trigger = screen.getByRole('button', { name: 'メニューを開く' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)

    const menu = screen.getByRole('dialog', { name: 'メニュー' })
    expect(menu).toHaveAttribute('aria-modal', 'true')
    expect(within(menu).getByRole('button', { name: 'メニューを閉じる' })).toHaveFocus()
    expect(within(menu).getByRole('link', { name: 'ホーム' })).toBeInTheDocument()
    expect(within(menu).getByRole('link', { name: 'マイライブラリ' })).toBeInTheDocument()
    expect(within(menu).getByRole('button', { name: 'ログイン' })).toBeInTheDocument()
    expect(within(menu).getByRole('radiogroup', { name: '外観' })).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('traps Tab within the overlay and returns focus after Escape', () => {
    renderWithAppProviders(<Header />)
    const trigger = screen.getByRole('button', { name: 'メニューを開く' })

    fireEvent.click(trigger)

    const menu = screen.getByRole('dialog', { name: 'メニュー' })
    const focusable = Array.from(
      menu.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(
      (element) =>
        !element.matches('input[type="radio"]') || (element as HTMLInputElement).checked,
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    expect(first).toBeDefined()
    expect(last).toBeDefined()

    last?.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(first).toHaveFocus()

    first?.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'メニュー' })).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
  })

  it('keeps the native radio-group Tab stop inside the overlay', () => {
    renderWithAppProviders(<Header />)
    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }))

    const menu = screen.getByRole('dialog', { name: 'メニュー' })
    const selectedAppearance = within(menu).getByRole('radio', { name: 'システム' })
    expect(selectedAppearance).toBeChecked()

    selectedAppearance.focus()
    fireEvent.keyDown(document, { key: 'Tab' })

    expect(within(menu).getByRole('link', { name: 'ビジネス日本語ハブ' })).toHaveFocus()
  })

  it('closes when an existing route is selected', () => {
    renderWithAppProviders(<Header />)
    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }))

    const menu = screen.getByRole('dialog', { name: 'メニュー' })
    fireEvent.click(within(menu).getByRole('link', { name: 'マイライブラリ' }))

    expect(screen.queryByRole('dialog', { name: 'メニュー' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'メニューを開く' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('makes the shell background inert and closes on browser back', () => {
    renderWithAppProviders(
      <>
        <Header />
        <BackButton />
        <CurrentPath />
        <main className="app-main">Background content</main>
        <footer className="site-footer">Background footer</footer>
      </>,
      { initialEntries: ['/', '/library'], initialIndex: 1 },
    )

    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }))

    const backgroundMain = document.querySelector('.app-main') as HTMLElement
    const backgroundFooter = document.querySelector('.site-footer') as HTMLElement
    expect(backgroundMain).toHaveAttribute('aria-hidden', 'true')
    expect(backgroundFooter).toHaveAttribute('aria-hidden', 'true')
    expect(backgroundMain.inert).toBe(true)
    expect(backgroundFooter.inert).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Go back' }))

    expect(screen.queryByRole('dialog', { name: 'メニュー' })).not.toBeInTheDocument()
    expect(screen.getByText('/')).toBeInTheDocument()
    expect(backgroundMain).not.toHaveAttribute('aria-hidden')
    expect(backgroundFooter).not.toHaveAttribute('aria-hidden')
    expect(backgroundMain.inert).toBe(false)
    expect(backgroundFooter.inert).toBe(false)
    expect(document.body.style.overflow).toBe('')
  })

  it('closes and restores the desktop shell when the viewport crosses the breakpoint', () => {
    const listeners: Array<(event: MediaQueryListEvent) => void> = []
    const originalMatchMedia = window.matchMedia
    const matchMediaMock = vi.fn((media: string) => ({
      matches: false,
      media,
      onchange: null,
      addEventListener: (_event: string, listener: EventListenerOrEventListenerObject) => {
        listeners.push(listener as (event: MediaQueryListEvent) => void)
      },
      removeEventListener: () => {},
      addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.push(listener),
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList)

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: matchMediaMock,
    })

    try {
      renderWithAppProviders(
        <>
          <Header />
          <button type="button">Focus probe</button>
        </>,
      )
      expect(matchMediaMock).toHaveBeenCalledWith('(min-width: 50rem)')
      const focusProbe = screen.getByRole('button', { name: 'Focus probe' })
      focusProbe.focus()
      act(() => {
        listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent))
      })
      expect(focusProbe).toHaveFocus()

      const desktopBrand = screen.getByRole('link', { name: 'ビジネス日本語ハブ' })

      fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }))
      expect(screen.getByRole('dialog', { name: 'メニュー' })).toBeInTheDocument()

      within(screen.getByRole('dialog', { name: 'メニュー' }))
        .getByRole('link', { name: 'ホーム' })
        .focus()

      act(() => {
        listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent))
      })

      expect(screen.queryByRole('dialog', { name: 'メニュー' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'メニューを開く' })).toHaveAttribute(
        'aria-expanded',
        'false',
      )
      expect(desktopBrand).toHaveFocus()
      expect(document.activeElement).not.toBe(document.body)
      expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'メニューを開く' }))
      expect(document.body.style.overflow).toBe('')
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      })
    }
  })
})
