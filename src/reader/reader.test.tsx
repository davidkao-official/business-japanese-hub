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
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sampleBook } from '../content/fixtures/sample-book'
import type { Chapter } from '../content/types'
import { BookPage } from '../app/BookPage'
import { LibraryLinkPage } from '../app/LibraryLinkPage'
import { BlockRenderer } from './BlockRenderer'
import { ReaderPage } from './ReaderPage'
import { ReaderShell } from './ReaderShell'
import { ReaderToc } from './ReaderToc'
import { createMockRepository, renderWithAppProviders } from '../test/appProviders'

function renderChapter(chapter: Chapter) {
  // Block-rendering tests read the book as an owner so every block renders;
  // access control is covered separately by the reader-access tests.
  return render(
    <MemoryRouter>
      <ReaderShell book={sampleBook} chapter={chapter} owned />
    </MemoryRouter>,
  )
}

function renderReaderRoutes(initialEntry: string, options: { owned?: boolean } = {}) {
  // `keigo-essentials` is a free Prototype book (fully public), so route tests
  // run signed-out. `owned: true` still exercises the owned render path used by
  // the reader for future paid books.
  const repository = options.owned
    ? createMockRepository({
        entitlements: {
          [sampleBook.id]: {
            bookId: sampleBook.id,
            provider: 'manual',
            grantedAt: '2026-08-01T00:00:00.000Z',
          },
        },
      })
    : null
  return renderWithAppProviders(
    <Routes>
      <Route path="/library-link" element={<LibraryLinkPage />} />
      <Route path="/books/:slug" element={<BookPage />} />
      <Route path="/books/:slug/read" element={<ReaderPage />} />
      <Route path="/books/:slug/read/:chapterSlug" element={<ReaderPage />} />
    </Routes>,
    {
      initialEntries: [initialEntry],
      repository,
      session: options.owned ? { id: 'u-1', email: 'reader@example.com' } : null,
    },
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

  it('hides the answer toggle when the exercise has no answer content', () => {
    // Regression: an exercise with neither answer nor explanation must not
    // render an empty "解答を見る" control.
    const { queryByRole } = render(
      <BlockRenderer
        block={{ id: 'ex-no-content', type: 'exercise', question: '答えはありません。' }}
        onOpenVocab={() => {}}
      />,
    )
    expect(queryByRole('button', { name: '解答を見る' })).not.toBeInTheDocument()
    expect(queryByRole('button', { name: '解答を隠す' })).not.toBeInTheDocument()
  })

  it('renders the answer toggle when the exercise carries an answer or explanation', () => {
    const withAnswer = render(
      <BlockRenderer
        block={{ id: 'ex-answer', type: 'exercise', question: 'q', answer: 'a' }}
        onOpenVocab={() => {}}
      />,
    )
    expect(withAnswer.getByRole('button', { name: '解答を見る' })).toBeInTheDocument()
    withAnswer.unmount()

    const withExplanation = render(
      <BlockRenderer
        block={{ id: 'ex-explanation', type: 'exercise', question: 'q', explanation: 'e' }}
        onOpenVocab={() => {}}
      />,
    )
    expect(withExplanation.getByRole('button', { name: '解答を見る' })).toBeInTheDocument()
  })
})

describe('image figure', () => {
  it('renders exactly one figcaption combining caption and credit', () => {
    const { container } = render(
      <BlockRenderer
        block={{
          id: 'img-caption-credit',
          type: 'image',
          src: '/x.png',
          alt: 'diagram',
          caption: '図の説明',
          credit: 'sample-fixture',
        }}
        onOpenVocab={() => {}}
      />,
    )
    const figure = container.querySelector('.reader-figure')
    expect(figure).not.toBeNull()
    const captions = figure?.querySelectorAll('figcaption') ?? []
    expect(captions).toHaveLength(1)
    expect(figure?.textContent).toContain('図の説明')
    expect(figure?.textContent).toContain('sample-fixture')
  })

  it('renders exactly one figcaption when only the caption is present', () => {
    const { container } = render(
      <BlockRenderer
        block={{ id: 'img-caption-only', type: 'image', src: '/x.png', alt: 'diagram', caption: '図の説明' }}
        onOpenVocab={() => {}}
      />,
    )
    expect(container.querySelectorAll('.reader-figure figcaption')).toHaveLength(1)
  })

  it('omits the figcaption entirely when neither caption nor credit exists', () => {
    const { container } = render(
      <BlockRenderer
        block={{ id: 'img-neither', type: 'image', src: '/x.png', alt: 'decorative' }}
        onOpenVocab={() => {}}
      />,
    )
    expect(container.querySelectorAll('.reader-figure figcaption')).toHaveLength(0)
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

  it('lists only effective level-2 headings as section anchors', () => {
    const chapter: Chapter = {
      id: 'custom-ch',
      slug: 'custom',
      order: 1,
      title: 'Custom',
      blocks: [
        { id: 'h2-a', type: 'heading', text: 'Section A', level: 2 },
        { id: 'h3-b', type: 'heading', text: 'Subsection B', level: 3 },
        { id: 'h2-c', type: 'heading', text: 'Section C' }, // level omitted → 2
        { id: 'h1-d', type: 'heading', text: 'Chapter Title', level: 1 },
      ],
    }
    const { container } = render(
      <MemoryRouter>
        <ReaderToc book={sampleBook} current={chapter} onNavigate={() => {}} />
      </MemoryRouter>,
    )
    const sectionLinks = Array.from(
      container.querySelectorAll('.reader-toc__section-link'),
    ).map((el) => el.textContent)
    expect(sectionLinks).toEqual(['Section A', 'Section C'])
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

  it('reports whole-book 100% only at the bottom of the final chapter', async () => {
    // Control the document height so the scroll-position "reached the end"
    // branch in useReadingPosition can be exercised deterministically.
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      get: () => 5000,
    })
    setScrollY(4300) // scrolled to the bottom
    try {
      // Non-final chapter at the bottom must NOT report whole-book 100%.
      const early = renderChapter(sampleBook.chapters[0])
      fireEvent.scroll(window)
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve))
      })
      expect(Number(early.getByRole('progressbar', { name: '読書の進捗' }).getAttribute('aria-valuenow'))).toBeLessThan(100)
      early.unmount()

      // Final chapter at the bottom DOES report whole-book 100%.
      const last = renderChapter(sampleBook.chapters[sampleBook.chapters.length - 1])
      fireEvent.scroll(window)
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve))
      })
      expect(last.getByRole('progressbar', { name: '読書の進捗' })).toHaveAttribute(
        'aria-valuenow',
        '100',
      )
      last.unmount()
    } finally {
      setScrollY(0)
      delete (document.documentElement as unknown as Record<string, unknown>).scrollHeight
    }
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
  it('scrolls and focuses a resolved cross-product block after client navigation', async () => {
    const scrollDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollIntoView',
    )
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    try {
      const chapter = sampleBook.chapters[0]
      const block = chapter.blocks[1]
      renderReaderRoutes(
        `/library-link?bookId=${sampleBook.id}&chapterId=${chapter.id}&blockId=${block.id}`,
      )

      const target = await waitFor(() => {
        const element = document.getElementById(`block-${block.id}`)
        expect(element).not.toBeNull()
        return element!
      })
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' }))
      expect(target).toHaveFocus()
    } finally {
      if (scrollDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollDescriptor)
      } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView
      }
    }
  })

  it('redirects /read to the first chapter', async () => {
    renderReaderRoutes('/books/keigo-essentials/read')
    expect(
      await screen.findByRole('heading', { level: 1, name: '敬語の基本' }),
    ).toBeInTheDocument()
  })

  it('opens the reader from the book page via the free-reading CTA', async () => {
    renderReaderRoutes('/books/keigo-essentials')
    fireEvent.click(screen.getByRole('link', { name: '読み始める' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: '敬語の基本' }),
    ).toBeInTheDocument()
  })

  it('links prev/next chapters and navigates between them (owned)', async () => {
    renderReaderRoutes('/books/keigo-essentials/read/keigo-in-meetings', { owned: true })
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

  it('sets the book-not-found document title for a missing book', () => {
    renderReaderRoutes('/books/nope/read')
    expect(document.title).toBe('この書籍は見つかりませんでした。')
  })

  it('shows a distinct chapter-not-found state for an unknown chapter', () => {
    renderReaderRoutes('/books/keigo-essentials/read/does-not-exist')
    expect(document.title).toBe('この章は見つかりませんでした。')
    expect(screen.getByText('この章は見つかりませんでした。')).toBeInTheDocument()
    expect(screen.queryByText('この書籍は見つかりませんでした。')).not.toBeInTheDocument()
  })

  it('titles the /read redirect with the first chapter, not book-not-found', async () => {
    renderReaderRoutes('/books/keigo-essentials/read')
    await screen.findByRole('heading', { level: 1, name: '敬語の基本' })
    expect(document.title).toBe('敬語の基本 — ビジネス日本語：敬語の基礎')
    expect(document.title).not.toBe('この書籍は見つかりませんでした。')
  })
})
