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
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
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
    opener.remove()
  })
})
