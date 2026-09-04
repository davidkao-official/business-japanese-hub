import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithAppProviders } from '../test/appProviders'
import { Header } from './Header'

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
})
