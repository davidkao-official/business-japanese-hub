/**
 * Tracks the current reading anchor + progress for a chapter.
 *
 * The anchor is the top-most content block that has reached the reading line
 * (~30% of the viewport height), computed from scroll position — not from an
 * IntersectionObserver, so it works everywhere jsdom runs too. The progress
 * percent is derived from that anchor via `computePercent` (semantic, weighted
 * by content, monotonic, and book-agnostic).
 *
 * On a chapter change the hook owns the scroll reset: it scrolls to the top
 * before re-running detection, so the anchor never reads a stale scroll
 * position from the previous chapter. Between the render and the effect run,
 * a stale `anchor` is reported as the new chapter's opening block.
 *
 * The optional `onAnchorChange` callback is the persistence seam: the reader
 * wires it to `ReadingPositionStore.save` (no-op in #5, durable in #7).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Book, Chapter } from '../content/types'
import {
  computePercent,
  resolveBlockIndex,
  resolveChapterIndex,
  type ReadingAnchor,
  type ReadingProgress,
} from './readingPosition'

export function useReadingPosition(
  book: Book,
  chapter: Chapter,
  contentRef: RefObject<HTMLElement | null>,
  onAnchorChange?: (anchor: ReadingAnchor) => void,
): ReadingProgress {
  const [anchor, setAnchor] = useState<ReadingAnchor>({
    chapterId: chapter.id,
    blockId: chapter.blocks[0]?.id ?? '',
  })
  const [atEnd, setAtEnd] = useState(false)

  const onAnchorChangeRef = useRef(onAnchorChange)
  const lastChapterRef = useRef(chapter.id)

  // Keep the callback ref fresh without writing a ref during render.
  useEffect(() => {
    onAnchorChangeRef.current = onAnchorChange
  })

  // While the chapter is mid-transition (state still holds the previous
  // chapter's anchor), report the new chapter's opening block instead so a
  // stale position is never surfaced or persisted.
  const effectiveAnchor = useMemo<ReadingAnchor>(
    () =>
      anchor.chapterId === chapter.id
        ? anchor
        : { chapterId: chapter.id, blockId: chapter.blocks[0]?.id ?? '' },
    [anchor, chapter.id, chapter.blocks],
  )
  const effectiveAtEnd = anchor.chapterId === chapter.id ? atEnd : false

  useEffect(() => {
    let raf = 0

    const update = () => {
      raf = 0
      const root = contentRef.current
      if (!root) return
      const readingLine = window.innerHeight * 0.3
      const anchors = root.querySelectorAll<HTMLElement>('[data-block-anchor]')
      let current: HTMLElement | null = null
      // Anchors are in document order with monotonically increasing tops; the
      // current block is the last one whose top is at/above the reading line.
      for (const el of anchors) {
        if (el.getBoundingClientRect().top <= readingLine) current = el
        else break
      }
      const ended =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
      setAtEnd(ended)
      const blockId = current?.dataset.blockId
      if (blockId) {
        setAnchor({ chapterId: chapter.id, blockId })
      }
    }

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }

    // New chapter: reset scroll to its top before detecting, so the detector
    // starts at the chapter opening rather than a stale previous position.
    if (lastChapterRef.current !== chapter.id) {
      lastChapterRef.current = chapter.id
      window.scrollTo(0, 0)
    }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [book.id, chapter.id, contentRef])

  const chapterIndex = resolveChapterIndex(book, chapter.id)
  const blockIndex = resolveBlockIndex(chapter, effectiveAnchor.blockId)

  const percent = useMemo(
    () => computePercent(book, chapterIndex, blockIndex, effectiveAtEnd),
    [book, chapterIndex, blockIndex, effectiveAtEnd],
  )

  useEffect(() => {
    onAnchorChangeRef.current?.(effectiveAnchor)
  }, [chapter.id, effectiveAnchor])

  return { anchor: effectiveAnchor, percent, chapterIndex, blockIndex }
}
