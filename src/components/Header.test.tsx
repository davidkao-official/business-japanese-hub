import { act, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useLocation, useNavigate } from 'react-router-dom'
import { renderWithAppProviders } from '../test/appProviders'
import { Header } from './Header'
import { setLocalePreference } from '../i18n/strings'

function BackButton() {
  const navigate = useNavigate()
  return <button onClick={() => navigate(-1)}>Go back</button>
}

function CurrentPath() {
  const location = useLocation()
  return <output>{location.pathname}</output>
}

function installHeaderMediaQueryHarness() {
  const originalMatchMedia = window.matchMedia
  const listenersByQuery = new Map<string, Array<(event: MediaQueryListEvent) => void>>()
  const matchMediaMock = vi.fn((media: string) => {
    const listeners = listenersByQuery.get(media) ?? []
    listenersByQuery.set(media, listeners)

    return {
      matches: media === '(min-width: 80rem)',
      media,
      onchange: null,
      addEventListener: (_event: string, listener: EventListenerOrEventListenerObject) => {
        listeners.push(listener as (event: MediaQueryListEvent) => void)
      },
      removeEventListener: (_event: string, listener: EventListenerOrEventListenerObject) => {
        const index = listeners.indexOf(listener as (event: MediaQueryListEvent) => void)
        if (index >= 0) listeners.splice(index, 1)
      },
      addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.push(listener),
      removeListener: (listener: (event: MediaQueryListEvent) => void) => {
        const index = listeners.indexOf(listener)
        if (index >= 0) listeners.splice(index, 1)
      },
      dispatchEvent: () => false,
    } as MediaQueryList
  })

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: matchMediaMock,
  })

  return {
    matchMediaMock,
    emitHeaderBreakpoint(matches: boolean) {
      act(() => {
        for (const listener of listenersByQuery.get('(min-width: 80rem)') ?? []) {
          listener({ matches } as MediaQueryListEvent)
        }
      })
    },
    restore() {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      })
    },
  }
}

function simulateResponsiveFocusLoss() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
}

describe('Header mobile navigation', () => {
  it('opens a keyboard-navigable language menu with an explicit selected option and persists selection', () => {
    renderWithAppProviders(<Header />)
    const trigger = screen.getByRole('button', { name: /表示言語/ })
    fireEvent.click(trigger)
    const menu = screen.getByRole('menu', { name: '表示言語' })
    expect(within(menu).getByRole('menuitemradio', { name: '日本語' })).toHaveAttribute('aria-checked', 'true')
    expect(within(menu).getByRole('menuitemradio', { name: '简体中文' })).toHaveAttribute('aria-checked', 'false')

    const activeOption = within(menu).getByRole('menuitemradio', { name: '日本語' })
    expect(activeOption).toHaveFocus()
    fireEvent.keyDown(activeOption, { key: 'ArrowDown' })
    const traditional = within(menu).getByRole('menuitemradio', { name: '繁體中文' })
    expect(traditional).toHaveFocus()
    fireEvent.click(within(menu).getByRole('menuitemradio', { name: '简体中文' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /显示语言.*简体中文/ })).toHaveTextContent('简体中文')
  })

  it('closes the desktop language menu when keyboard focus leaves the control', () => {
    renderWithAppProviders(
      <>
        <Header />
        <button type="button">Outside header</button>
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: /表示言語/ }))
    const selectedOption = screen.getByRole('menuitemradio', { name: '日本語' })
    fireEvent.blur(selectedOption, { relatedTarget: screen.getByRole('button', { name: 'Outside header' }) })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on Shift+Tab back to the trigger and handles Escape from the trigger', async () => {
    const user = userEvent.setup()
    renderWithAppProviders(<Header />)
    const trigger = screen.getByRole('button', { name: /表示言語/ })

    fireEvent.click(trigger)
    expect(screen.getByRole('menuitemradio', { name: '日本語' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('closes when clicking the trigger while the selected menu option has focus', async () => {
    const user = userEvent.setup()
    renderWithAppProviders(<Header />)
    const trigger = screen.getByRole('button', { name: /表示言語/ })

    fireEvent.click(trigger)
    expect(screen.getByRole('menuitemradio', { name: '日本語' })).toHaveFocus()
    await user.click(trigger)

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('closes the desktop language menu below the desktop breakpoint and keeps it closed on return', () => {
    const media = installHeaderMediaQueryHarness()
    renderWithAppProviders(<Header />)
    fireEvent.click(screen.getByRole('button', { name: /表示言語/ }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    media.emitHeaderBreakpoint(false)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    media.emitHeaderBreakpoint(true)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    media.restore()
  })

  it('lets Tab and Shift+Tab leave the menu from a non-first selected locale', async () => {
    const user = userEvent.setup()
    setLocalePreference('zh-CN')
    renderWithAppProviders(<Header />)
    const trigger = screen.getByRole('button', { name: /显示语言/ })

    fireEvent.click(trigger)
    const selectedOption = screen.getByRole('menuitemradio', { name: '简体中文' })
    expect(selectedOption).toHaveFocus()
    await user.tab({ shift: true })
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    fireEvent.click(trigger)
    const menu = screen.getByRole('menu')
    const selectedAgain = within(menu).getByRole('menuitemradio', { name: '简体中文' })
    const traditionalOption = screen.getByRole('menuitemradio', { name: '繁體中文' })
    fireEvent.keyDown(selectedAgain, { key: 'ArrowUp' })
    expect(traditionalOption).toHaveFocus()
    expect(traditionalOption).toHaveAttribute('tabindex', '0')
    expect(traditionalOption).toHaveAttribute('aria-checked', 'false')
    await user.tab()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(document.activeElement).not.toBe(menu)
  })

  it('offers touch-sized native language choices inside the existing mobile dialog', () => {
    renderWithAppProviders(<Header />)
    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }))
    const dialog = screen.getByRole('dialog', { name: 'メニュー' })
    const group = within(dialog).getByRole('radiogroup', { name: '表示言語' })
    expect(within(group).getAllByRole('radio')).toHaveLength(4)
    fireEvent.click(within(group).getByRole('radio', { name: '简体中文' }))
    expect(within(group).getByRole('radio', { name: '简体中文' })).toBeChecked()
    expect(screen.getByRole('dialog', { name: '菜单' })).toBeInTheDocument()
  })

  it('language-scopes the canonical English mode labels in desktop and mobile navigation', () => {
    const canonicalModes = ['Learn', 'Read', 'Practice', 'My Learning', 'Experience']
    renderWithAppProviders(<Header />)

    const assertModeLabelsAreEnglish = (navigation: HTMLElement) => {
      for (const label of canonicalModes) {
        const link = within(navigation).getByRole('link', { name: label })
        expect(link.querySelector('span[lang="en"]')).toHaveTextContent(label)
      }
    }

    assertModeLabelsAreEnglish(document.querySelector('.site-header__tools .site-nav') as HTMLElement)

    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }))
    assertModeLabelsAreEnglish(
      within(screen.getByRole('dialog', { name: 'メニュー' })).getByRole('navigation'),
    )
  })

  it('opens the existing navigation with account and language controls', () => {
    renderWithAppProviders(<Header />)

    const trigger = screen.getByRole('button', { name: 'メニューを開く' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)

    const menu = screen.getByRole('dialog', { name: 'メニュー' })
    expect(menu).toHaveAttribute('aria-modal', 'true')
    expect(within(menu).getByRole('button', { name: 'メニューを閉じる' })).toHaveFocus()
    expect(within(menu).getByRole('link', { name: 'ホーム' })).toBeInTheDocument()
    expect(within(menu).getByRole('link', { name: 'Learn' })).toBeInTheDocument()
    expect(within(menu).getByRole('button', { name: 'ログイン' })).toBeInTheDocument()
    expect(within(menu).getByRole('radiogroup', { name: '表示言語' })).toBeInTheDocument()
    expect(within(menu).queryByRole('radiogroup', { name: '外観' })).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('traps Tab within the overlay and returns focus after Escape', () => {
    renderWithAppProviders(<Header />)
    const trigger = screen.getByRole('button', { name: 'メニューを開く' })

    fireEvent.click(trigger)

    const menu = screen.getByRole('dialog', { name: 'メニュー' })
    const headerShell = document.querySelector('.site-header__inner') as HTMLElement
    expect(headerShell).toHaveAttribute('aria-hidden', 'true')
    expect(headerShell).toHaveAttribute('inert')
    expect(trigger).toBeDisabled()
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
    expect(trigger).not.toBeDisabled()
    expect(headerShell).not.toHaveAttribute('aria-hidden', 'true')
    expect(headerShell).not.toHaveAttribute('inert')
    expect(trigger).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
  })

  it('keeps the language radio-group Tab stop inside the overlay', async () => {
    const user = userEvent.setup()
    renderWithAppProviders(<Header />)
    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }))

    const menu = screen.getByRole('dialog', { name: 'メニュー' })
    const selectedLanguage = within(menu).getByRole('radio', { name: '日本語' })
    expect(selectedLanguage).toBeChecked()

    selectedLanguage.focus()
    await user.tab()

    expect(within(menu).getByRole('button', { name: 'ログイン' })).toHaveFocus()
  })

  it('closes when an existing route is selected', () => {
    renderWithAppProviders(<Header />)
    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }))

    const menu = screen.getByRole('dialog', { name: 'メニュー' })
    fireEvent.click(within(menu).getByRole('link', { name: 'Learn' }))

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
    const media = installHeaderMediaQueryHarness()

    try {
      renderWithAppProviders(
        <>
          <Header />
          <button type="button">Focus probe</button>
        </>,
      )
      expect(media.matchMediaMock).toHaveBeenCalledWith('(min-width: 80rem)')
      const focusProbe = screen.getByRole('button', { name: 'Focus probe' })
      focusProbe.focus()
      media.emitHeaderBreakpoint(true)
      expect(focusProbe).toHaveFocus()

      const desktopBrand = screen.getByRole('link', { name: 'ビジネス日本語ハブ' })
      const trigger = screen.getByRole('button', { name: 'メニューを開く' })
      trigger.focus()
      trigger.blur()
      media.emitHeaderBreakpoint(true)
      expect(desktopBrand).toHaveFocus()

      fireEvent.click(trigger)
      expect(screen.getByRole('dialog', { name: 'メニュー' })).toBeInTheDocument()

      within(screen.getByRole('dialog', { name: 'メニュー' }))
        .getByRole('link', { name: 'ホーム' })
        .focus()

      media.emitHeaderBreakpoint(true)

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
      media.restore()
    }
  })

  it('closes the desktop account panel and restores mobile login after entering the mobile breakpoint', async () => {
    const media = installHeaderMediaQueryHarness()

    try {
      renderWithAppProviders(<Header />)

      const desktopTools = document.querySelector('.site-header__tools') as HTMLElement
      fireEvent.click(await within(desktopTools).findByRole('button', { name: 'ログイン' }))
      const email = await screen.findByLabelText('メールアドレス')
      email.focus()

      media.emitHeaderBreakpoint(false)

      expect(screen.queryByRole('region', { name: 'ログイン' })).not.toBeInTheDocument()
      const trigger = screen.getByRole('button', { name: 'メニューを開く' })
      expect(trigger).toHaveFocus()

      const desktopBrand = screen.getByRole('link', { name: 'ビジネス日本語ハブ' })
      fireEvent.click(trigger)
      const menu = screen.getByRole('dialog', { name: 'メニュー' })
      fireEvent.click(within(menu).getByRole('button', { name: 'ログイン' }))
      expect(within(menu).getByRole('region', { name: 'ログイン' })).toBeInTheDocument()

      fireEvent.keyDown(document, { key: 'Escape' })
      media.emitHeaderBreakpoint(true)
      expect(screen.queryByRole('region', { name: 'ログイン' })).not.toBeInTheDocument()
      expect(desktopBrand).toHaveFocus()
    } finally {
      media.restore()
    }
  })

  it('protects focused desktop controls without stealing focus from external content', () => {
    const media = installHeaderMediaQueryHarness()

    try {
      renderWithAppProviders(
        <>
          <Header />
          <button type="button">Focus probe</button>
        </>,
      )

      const desktopTools = document.querySelector('.site-header__tools') as HTMLElement
      const trigger = screen.getByRole('button', { name: 'メニューを開く' })
      within(desktopTools).getByRole('link', { name: 'ホーム' }).focus()
      simulateResponsiveFocusLoss()
      media.emitHeaderBreakpoint(false)
      expect(trigger).toHaveFocus()

      within(desktopTools).getByRole('button', { name: /表示言語/ }).focus()
      simulateResponsiveFocusLoss()
      media.emitHeaderBreakpoint(false)
      expect(trigger).toHaveFocus()

      const focusProbe = screen.getByRole('button', { name: 'Focus probe' })
      focusProbe.focus()
      media.emitHeaderBreakpoint(false)
      expect(focusProbe).toHaveFocus()
    } finally {
      media.restore()
    }
  })

  it('does not restore stale body blur provenance after the breakpoint window expires', () => {
    const media = installHeaderMediaQueryHarness()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000)

    try {
      renderWithAppProviders(<Header />)

      const trigger = screen.getByRole('button', { name: 'メニューを開く' })
      const desktopBrand = screen.getByRole('link', { name: 'ビジネス日本語ハブ' })
      trigger.focus()
      trigger.blur()
      expect(document.activeElement).toBe(document.body)

      clock.mockReturnValue(1_501)
      media.emitHeaderBreakpoint(true)

      expect(document.activeElement).toBe(document.body)
      expect(desktopBrand).not.toHaveFocus()
      expect(trigger).not.toHaveFocus()
    } finally {
      clock.mockRestore()
      media.restore()
    }
  })

  it('does not restore stale desktop-control body blur provenance after the breakpoint window expires', () => {
    const media = installHeaderMediaQueryHarness()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000)

    try {
      renderWithAppProviders(<Header />)

      const desktopTools = document.querySelector('.site-header__tools') as HTMLElement
      const desktopHome = within(desktopTools).getByRole('link', { name: 'ホーム' })
      const trigger = screen.getByRole('button', { name: 'メニューを開く' })
      desktopHome.focus()
      desktopHome.blur()
      expect(document.activeElement).toBe(document.body)

      clock.mockReturnValue(1_501)
      media.emitHeaderBreakpoint(false)

      expect(document.activeElement).toBe(document.body)
      expect(trigger).not.toHaveFocus()
    } finally {
      clock.mockRestore()
      media.restore()
    }
  })
})
