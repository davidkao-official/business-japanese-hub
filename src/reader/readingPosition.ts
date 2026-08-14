/**
 * Reading position — anchor-based, semantic reading state.
 *
 * The reader's progress and resume state are keyed to stable content anchors
 * (`Chapter.id` + `ContentBlock.id`), NOT fixed page numbers: on a responsive
 * web reader a "page" has no stable identity once the user changes font size,
 * measure, or device width (research §4.4 / §8.3).
 *
 * This module is pure data logic. It has no React dependency so it can be
 * unit-tested and reused by a future durable store.
 *
 * Persistence itself (#7) is intentionally NOT implemented here. The
 * `ReadingPositionStore` interface below is the extension point: #7 swaps the
 * no-op implementation for a durable one (localStorage / account-synced)
 * without touching any reader component.
 */

import type { Book, Chapter, ContentBlock } from '../content/types'

/** A stable reading anchor: the chapter + the block currently at the reading line. */
export interface ReadingAnchor {
  chapterId: string
  blockId: string
  /** Optional block-internal offset (character index). Reserved for #7. */
  offset?: number
}

export interface ReadingProgress {
  anchor: ReadingAnchor
  /** 0..1 across the whole book, derived from the anchor block. */
  percent: number
  chapterIndex: number
  blockIndex: number
}

/**
 * Character weighting for a content block — used so long paragraphs contribute
 * more to progress than one-line exchanges. Approximate by design: weights
 * progress, it does not define it.
 */
export function blockText(block: ContentBlock): string {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
    case 'quote':
      return block.text
    case 'callout':
      return `${block.title ?? ''}${block.text}`
    case 'image':
      return `${block.alt}${block.caption ?? ''}`
    case 'table':
      return block.columns.join('') + block.rows.flat().join('')
    case 'vocabulary':
      return `${block.term}${block.reading ?? ''}${block.meaning}${block.example ?? ''}`
    case 'dialogue':
      return block.lines.map((line) => `${line.speaker}${line.text}${line.note ?? ''}`).join('')
    case 'example':
      return `${block.text}${block.translation ?? ''}${block.note ?? ''}`
    case 'comparison':
      return block.rows.flatMap((row) => [row.label, ...row.points]).join('')
    case 'caseStudy':
      return `${block.title ?? ''}${block.scenario}${(block.questions ?? []).join('')}${
        block.outcome ?? ''
      }`
    case 'doDont':
      return block.do.join('') + block.dont.join('')
    case 'exercise':
      return `${block.question}${block.hint ?? ''}${(block.options ?? []).join('')}${
        block.answer ?? ''
      }${block.explanation ?? ''}`
    case 'authorNote':
      return `${block.title ?? ''}${block.text}`
    default:
      return ''
  }
}

/** Character count of a chapter's content. */
export function chapterCharacterCount(chapter: Chapter): number {
  return chapter.blocks.reduce((sum, block) => sum + blockText(block).length, 0)
}

/** Character count of the whole book. */
export function bookCharacterCount(book: Book): number {
  return book.chapters.reduce((sum, chapter) => sum + chapterCharacterCount(chapter), 0)
}

/** Character offset strictly before the given chapter + block (monotonic in document order). */
export function bookCharacterOffset(book: Book, chapterIndex: number, blockIndex: number): number {
  let acc = 0
  for (let i = 0; i < chapterIndex; i += 1) {
    acc += chapterCharacterCount(book.chapters[i])
  }
  const chapter = book.chapters[chapterIndex]
  for (let j = 0; j < blockIndex; j += 1) {
    acc += blockText(chapter.blocks[j]).length
  }
  return acc
}

export function resolveChapterIndex(book: Book, chapterId: string): number {
  return book.chapters.findIndex((chapter) => chapter.id === chapterId)
}

export function resolveBlockIndex(chapter: Chapter, blockId: string): number {
  return chapter.blocks.findIndex((block) => block.id === blockId)
}

/**
 * Percent across the whole book, derived from the anchor. Uses a mid-block
 * estimate so progress is monotonic and reaches ~100% at the final block;
 * the reader also reports 100% when scrolled to the end of the book.
 */
export function computePercent(
  book: Book,
  chapterIndex: number,
  blockIndex: number,
  reachedEnd = false,
): number {
  if (reachedEnd) return 1
  const total = bookCharacterCount(book)
  if (total <= 0 || chapterIndex < 0 || blockIndex < 0) return 0
  const offset = bookCharacterOffset(book, chapterIndex, blockIndex)
  const chapter = book.chapters[chapterIndex]
  const blockChars = chapter.blocks[blockIndex] ? blockText(chapter.blocks[blockIndex]).length : 0
  return Math.min(1, (offset + blockChars / 2) / total)
}

/**
 * Durable reading-position store. #5 does not implement persistence (#7 does);
 * the reader ships with a no-op implementation so the data-flow seam exists and
 * is exercised end-to-end (load on mount, save on anchor change).
 */
export interface ReadingPositionStore {
  load(bookId: string): ReadingAnchor | null
  save(bookId: string, position: ReadingAnchor): void
}

/** No-op store for the vertical slice. Replaced by a durable store in #7. */
export const noopReadingPositionStore: ReadingPositionStore = {
  load: () => null,
  save: () => {},
}
