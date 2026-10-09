import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithAppProviders } from '../test/appProviders'
import { ReaderDialog } from './ReaderDialog'

describe('ReaderDialog focus trap', () => {
  it('cycles backward and forward from the initially focused panel', () => {
    renderWithAppProviders(
      <ReaderDialog open label="目次" placement="toc" onClose={vi.fn()}>
        <button type="button">章を開く</button>
      </ReaderDialog>,
    )

    const panel = screen.getByRole('dialog')
    const close = screen.getByRole('button', { name: '閉じる' })
    const chapter = screen.getByRole('button', { name: '章を開く' })
    expect(panel).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(chapter).toHaveFocus()

    panel.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(close).toHaveFocus()
  })

  it('restores the opener focus after Escape closes the dialog', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    const openerFocus = vi.spyOn(opener, 'focus')
    opener.focus()
    openerFocus.mockClear()
    const onClose = vi.fn()
    const rendered = renderWithAppProviders(
      <ReaderDialog open label="設定" placement="settings" onClose={onClose}>
        Settings
      </ReaderDialog>,
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    rendered.rerender(
      <ReaderDialog open={false} label="設定" placement="settings" onClose={onClose}>
        Settings
      </ReaderDialog>,
    )
    expect(opener).toHaveFocus()
    expect(openerFocus).toHaveBeenCalledWith({ preventScroll: true })
    expect(window.scrollTo).toHaveBeenCalledWith({ left: 0, top: 0, behavior: 'instant' })
    opener.remove()
  })

  it('stops queued page scrolling at the current offset when opening', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    Object.defineProperty(window, 'scrollX', { configurable: true, value: 0 })
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 640 })

    renderWithAppProviders(
      <ReaderDialog open label="目次" placement="toc" onClose={vi.fn()}>
        <button type="button">章を開く</button>
      </ReaderDialog>,
    )

    expect(window.scrollTo).toHaveBeenCalledWith({ left: 0, top: 640, behavior: 'instant' })
    expect(screen.getByRole('dialog')).toHaveFocus()
  })
})
