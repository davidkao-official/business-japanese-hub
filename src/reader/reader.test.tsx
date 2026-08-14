/**
 * Reader component tests — render the full vertical slice and assert the
 * acceptance-criteria behaviors:
 *   - every one of the 14 block types renders with a deliberate state
 *   - exercise reveal is inline and un-scored
 *   - dialogue is a transcript, not message bubbles
 *   - settings V1 (文字サイズ / テーマ / 書体) is applied and reflected
 *   - TOC marks the current chapter; chapter nav links work end-to-end
 *   - vocabulary sheet opens and focus returns to the term on close
 *   - mobile chrome hides on scroll-down and reveals on scroll-up
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { sampleBook } from '../content/fixtures/sample-book'
import type { Chapter } from '../content/types'
import { BookPage } from '../app/BookPage'
import { ReaderPage } from './ReaderPage'
import { ReaderShell } from './ReaderShell'

function renderChapter(chapter: Chapter) {
  return render(
    <MemoryRouter>
      <ReaderShell book={sampleBook} chapter={chapter} />
    </MemoryRouter>,
  )
}

function renderReaderRoutes(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/books/:slug" element={<BookPage />} />
        <Route path="/books/:slug/read" element={<ReaderPage />} />
        <Route path="/books/:slug/read/:chapterSlug" element={<ReaderPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function setScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value })
}

describe('block rendering', () => {
  it('renders every one of the 14 supported block types', () => {
    const ch1 = renderChapter(sampleBook.chapters[0])
    const ch2 = renderChapter(sampleBook.chapters[1])
    const ch3 = renderChapter(sampleBook.chapters[2])

    const types = [
      'heading',
      'paragraph',
      'callout',
      'vocabulary',
      'comparison',
      'quote',
      'authorNote',
      'dialogue',
      'doDont',
      'table',
      'caseStudy',
      'exercise',
      'example',
      'image',
    ]

    for (const type of types) {
      const rendered = [ch1, ch2, ch3].some((r) =>
        r.container.querySelector(`.reader-block--${type}`),
      )
      expect(rendered, `missing deliberate render state for block type: ${type}`).toBe(true)
    }
  })

  it('wraps each block in an anchor shell with a stable id and focusability', () => {
    const { container } = renderChapter(sampleBook.chapters[0])
    const shell = container.querySelector('.reader-block--paragraph')
    expect(shell).not.toBeNull()
    expect(shell).toHaveAttribute('data-block-anchor', 'ch1-blk-02')
    expect(shell).toHaveAttribute('data-block-id', 'ch1-blk-02')
    expect(shell).toHaveAttribute('id', 'block-ch1-blk-02')
    expect(shell).toHaveAttribute('tabindex', '-1')
  })
})

describe('exercise', () => {
  it('reveals the answer inline on toggle and never scores', () => {
    const { container } = renderChapter(sampleBook.chapters[2])
    const exercise = container.querySelector('.reader-exercise') as HTMLElement
    const toggle = within(exercise).getByRole('button', { name: '解答を見る' })

    expect(
      within(exercise).queryByText(/「参る」「申す」「伺う」は謙譲語/),
    ).not.toBeInTheDocument()
    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(within(exercise).getByText(/「参る」「申す」「伺う」は謙譲語/)).toBeInTheDocument()

    expect(exercise.querySelector('[role="progressbar"]')).toBeNull()
    expect(exercise.textContent ?? '').not.toMatch(/正解数|得点|score|100点/i)
  })
})

describe('dialogue', () => {
  it('renders a transcript of plain lines, never message bubbles', () => {
    const { container } = renderChapter(sampleBook.chapters[1])
    const dialogue = container.querySelector('.reader-dialogue')
    expect(dialogue).not.toBeNull()

    const lines = dialogue?.querySelectorAll('.reader-dialogue__line') ?? []
    expect(lines).toHaveLength(3)
    expect(dialogue?.querySelector('[role="log"]')).toBeNull()
    for (const el of Array.from(dialogue?.querySelectorAll('*') ?? [])) {
      expect(el.className).not.toMatch(/bubble/i)
    }
  })
})

describe('settings V1', () => {
  it('applies theme, typeface and text size and reflects the active option', () => {
    const { container } = renderChapter(sampleBook.chapters[0])
    fireEvent.click(screen.getByRole('button', { name: '表示設定' }))

    const dark = screen.getByRole('button', { name: 'ダーク' })
    fireEvent.click(dark)
    expect(document.documentElement).toHaveAttribute('data-reader-theme', 'dark')
    expect(dark).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'ライト' })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'ゴシック' }))
    expect(container.querySelector('.reader-shell')).toHaveAttribute('data-reader-font', 'sans')

    fireEvent.click(screen.getByRole('button', { name: '大' }))
    const shell = container.querySelector('.reader-shell') as HTMLElement
    expect(shell.style.getPropertyValue('--reader-font-scale')).toBe('1.15')
  })
})

describe('table of contents', () => {
  it('lists all chapters and marks the current one', () => {
    renderChapter(sampleBook.chapters[1])
    fireEvent.click(screen.getByRole('button', { name: '目次' }))

    const panel = within(screen.getByRole('dialog'))
    const chapters = panel.getAllByRole('link', { name: /第 \d 章/ })
    expect(chapters).toHaveLength(3)
    const current = panel.getByRole('link', { name: /会議での敬語/ })
    expect(current).toHaveAttribute('aria-current', 'location')
    expect(panel.getByRole('link', { name: /敬語の基本/ })).not.toHaveAttribute('aria-current')
  })
})

describe('vocabulary sheet', () => {
  it('opens the definition sheet and returns focus to the term on close', async () => {
    const { container } = renderChapter(sampleBook.chapters[0])
    const term = screen.getByRole('button', { name: '敬語' })
    term.focus()
    fireEvent.click(term)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('相手への敬意を表す言葉遣いの総称。')
    expect(term).toHaveAttribute('aria-expanded', 'true')

    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(term).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(term)
    expect(container.querySelector('.reader-vocab-detail')).toBeNull()
  })
})

describe('marginalia', () => {
  it('renders the right-rail only for chapters that carry vocabulary', () => {
    const withVocab = renderChapter(sampleBook.chapters[0])
    expect(withVocab.container.querySelector('.reader-marginalia')).not.toBeNull()
    expect(withVocab.container.querySelector('.reader-layout')).toHaveClass(
      'reader-layout--marginalia',
    )

    const withoutVocab = renderChapter(sampleBook.chapters[1])
    expect(withoutVocab.container.querySelector('.reader-marginalia')).toBeNull()
    expect(withoutVocab.container.querySelector('.reader-layout')).not.toHaveClass(
      'reader-layout--marginalia',
    )
  })
})

describe('reading progress', () => {
  it('exposes a progressbar bound to the semantic anchor', () => {
    renderChapter(sampleBook.chapters[0])
    const bar = screen.getByRole('progressbar', { name: '読書の進捗' })
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
    const now = Number(bar.getAttribute('aria-valuenow'))
    expect(now).toBeGreaterThanOrEqual(0)
    expect(now).toBeLessThanOrEqual(100)
  })
})

describe('mobile chrome', () => {
  afterEach(() => {
    setScrollY(0)
  })

  it('hides on scroll-down and reveals on scroll-up', async () => {
    const { container } = renderChapter(sampleBook.chapters[0])
    const topbar = container.querySelector('.reader-topbar') as HTMLElement
    expect(topbar).not.toHaveClass('reader-topbar--hidden')

    setScrollY(240)
    fireEvent.scroll(window)
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve))
    })
    expect(topbar).toHaveClass('reader-topbar--hidden')
    expect(topbar).toHaveAttribute('inert')

    setScrollY(100)
    fireEvent.scroll(window)
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve))
    })
    expect(topbar).not.toHaveClass('reader-topbar--hidden')
  })
})

describe('navigation', () => {
  it('redirects /read to the first chapter', async () => {
    renderReaderRoutes('/books/keigo-essentials/read')
    expect(
      await screen.findByRole('heading', { level: 1, name: '敬語の基本' }),
    ).toBeInTheDocument()
  })

  it('opens the reader from the book page via 読み始める', async () => {
    renderReaderRoutes('/books/keigo-essentials')
    fireEvent.click(screen.getByRole('link', { name: '読み始める' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: '敬語の基本' }),
    ).toBeInTheDocument()
  })

  it('links prev/next chapters and navigates between them', async () => {
    renderReaderRoutes('/books/keigo-essentials/read/keigo-in-meetings')
    expect(
      await screen.findByRole('heading', { level: 1, name: '会議での敬語' }),
    ).toBeInTheDocument()

    expect(screen.getByRole('link', { name: /前の章/ })).toHaveAttribute(
      'href',
      '/books/keigo-essentials/read/keigo-basics',
    )
    const next = screen.getByRole('link', { name: /次の章/ })
    expect(next).toHaveAttribute('href', '/books/keigo-essentials/read/practice')

    fireEvent.click(next)
    expect(
      await screen.findByRole('heading', { level: 1, name: '練習問題' }),
    ).toBeInTheDocument()
  })

  it('omits the prev link on the first chapter', async () => {
    renderReaderRoutes('/books/keigo-essentials/read/keigo-basics')
    await screen.findByRole('heading', { level: 1, name: '敬語の基本' })
    expect(screen.queryByRole('link', { name: /前の章/ })).not.toBeInTheDocument()
  })

  it('renders a not-found state for an unknown book', () => {
    renderReaderRoutes('/books/nope/read')
    expect(screen.getByText('この書籍は見つかりませんでした。')).toBeInTheDocument()
  })
})
