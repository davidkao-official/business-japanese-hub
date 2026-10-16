import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sampleBook } from '../content/fixtures/sample-book'
import { ReaderShell } from './ReaderShell'

let keyboardFocus: Element | null
let frames: Map<number, FrameRequestCallback>

function renderReader(desktop = false) {
  vi.stubGlobal('matchMedia', vi.fn((media: string) => ({
    matches: desktop && media === '(min-width: 64rem)',
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })))
  render(
    <MemoryRouter>
      <ReaderShell book={sampleBook} chapter={sampleBook.chapters[0]} owned />
    </MemoryRouter>,
  )
  const topbar = screen.getByRole('button', { name: '目次' }).closest('header')
  if (!topbar) throw new Error('Reader topbar header is missing')
  return topbar
}

function queueScroll(y: number) {
  vi.stubGlobal('scrollY', y)
  fireEvent.scroll(window)
}

function flushFrames() {
  act(() => {
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach((callback) => callback(0))
  })
}

describe('Reader chrome keyboard focus', () => {
  beforeEach(() => {
    keyboardFocus = null
    frames = new Map()
    let nextFrame = 1
    vi.stubGlobal('scrollY', 0)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = nextFrame++
      frames.set(id, callback)
      return id
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id)
    })
    // jsdom cannot model keyboard vs pointer modality reliably. Stub only this
    // selector, preserving the native matcher for all other selectors.
    const matches = Element.prototype.matches
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector) {
      return selector === ':focus-visible' ? this === keyboardFocus : matches.call(this, selector)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it.each(['目次', '表示設定', '書籍へ戻る'])(
    'keeps mobile chrome visible and %s focused during downward scroll',
    (name) => {
      const topbar = renderReader()
      const control = within(topbar).getByRole(name === '書籍へ戻る' ? 'link' : 'button', { name })
      control.focus()
      keyboardFocus = control

      queueScroll(1200)
      flushFrames()

      expect(topbar).not.toHaveAttribute('inert')
      expect(topbar).not.toHaveClass('reader-topbar--hidden')
      expect(control).toHaveFocus()
    },
  )

  it('preserves auto-hide for pointer-restored focus inside the topbar', () => {
    const topbar = renderReader()
    within(topbar).getByRole('button', { name: '目次' }).focus()

    queueScroll(1200)
    flushFrames()

    expect(topbar).toHaveAttribute('inert')
    expect(topbar).toHaveClass('reader-topbar--hidden')
  })

  it('checks current focus at the animation frame and keeps lastY updated while pinned', () => {
    const topbar = renderReader()
    const control = within(topbar).getByRole('button', { name: '目次' })
    queueScroll(1200)
    control.focus()
    keyboardFocus = control
    flushFrames()
    expect(topbar).not.toHaveAttribute('inert')

    // Focus leaves after the next event is queued. A small upward scroll must
    // still reveal the chrome relative to the previous pinned frame's offset.
    queueScroll(1180)
    const outside = screen.getByRole('link', { name: '章の本文へスキップ' })
    outside.focus()
    keyboardFocus = outside
    flushFrames()
    expect(topbar).not.toHaveAttribute('inert')

    queueScroll(1300)
    flushFrames()
    expect(topbar).toHaveAttribute('inert')
    expect(topbar).toHaveClass('reader-topbar--hidden')
  })

  it('preserves auto-hide when the focus-visible selector throws', () => {
    const topbar = renderReader()
    const control = within(topbar).getByRole('button', { name: '目次' })
    control.focus()
    const matches = control.matches
    vi.spyOn(control, 'matches').mockImplementation((selector) => {
      if (selector === ':focus-visible') throw new DOMException('Unsupported selector', 'SyntaxError')
      return matches.call(control, selector)
    })

    queueScroll(1200)
    flushFrames()

    expect(topbar).toHaveAttribute('inert')
    expect(topbar).toHaveClass('reader-topbar--hidden')
  })

  it('keeps desktop chrome visible during downward scroll', () => {
    const topbar = renderReader(true)
    queueScroll(1200)
    flushFrames()

    expect(topbar).not.toHaveAttribute('inert')
    expect(topbar).not.toHaveClass('reader-topbar--hidden')
  })
})
