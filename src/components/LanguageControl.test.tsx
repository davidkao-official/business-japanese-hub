import { act, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithAppProviders } from '../test/appProviders'
import { LanguageControl } from './LanguageControl'
import { Header } from './Header'
import { setLocalePreference } from '../i18n/strings'

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

// The production list contains only Japanese. Keep the dormant selector's
// keyboard and persistence contract testable for a future complete-locale launch.
vi.mock('../i18n/locales', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../i18n/locales')>()
  return { ...actual, LAUNCHED_LOCALES: actual.SUPPORTED_LOCALES }
})

describe('future launched language selector', () => {
  it('opens a keyboard-navigable language menu with an explicit selected option and persists selection', () => {
    renderWithAppProviders(<LanguageControl />)
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
        <LanguageControl />
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
    renderWithAppProviders(<LanguageControl />)
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
    renderWithAppProviders(<LanguageControl />)
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
    renderWithAppProviders(<LanguageControl />)
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
    renderWithAppProviders(<LanguageControl />)
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

  it('offers touch-sized native language choices for a future multi-locale launch', () => {
    renderWithAppProviders(<LanguageControl variant="mobile" />)
    const group = screen.getByRole('radiogroup', { name: '表示言語' })
    expect(within(group).getAllByRole('radio')).toHaveLength(4)
    fireEvent.click(within(group).getByRole('radio', { name: '简体中文' }))
    expect(within(group).getByRole('radio', { name: '简体中文' })).toBeChecked()
  })

  it('keeps the future language radio-group Tab stop inside the mobile sheet', async () => {
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
})
