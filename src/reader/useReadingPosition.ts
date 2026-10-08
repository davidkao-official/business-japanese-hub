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
 * The optional `onAnchorChange` callback writes settled semantic anchors
 * through the Reader's current-user `ReadingPositionStore`.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Book, Chapter } from '../content/types'
import {
  computePercent,
  progressFromReadingState,
  resolveBlockIndex,
  resolveChapterIndex,
  type ReadingAnchor,
  type ReadingProgress,
} from './readingPosition'

export interface UseReadingPositionOptions {
  restore?: { anchor: ReadingAnchor; key: string }
  canPersist?: boolean
  entryKey?: string
  skipInitialPersistence?: boolean
}

export function useReadingPosition(
  book: Book,
  chapter: Chapter,
  contentRef: RefObject<HTMLElement | null>,
  onAnchorChange?: (anchor: ReadingAnchor) => void,
  options: UseReadingPositionOptions = {},
): ReadingProgress {
  const {
    restore,
    canPersist = true,
    entryKey = 'reader',
    skipInitialPersistence = false,
  } = options
  const openingAnchor = { chapterId: chapter.id, blockId: chapter.blocks[0]?.id ?? '' }
  const initialRestore = restore?.anchor.chapterId === chapter.id ? restore.anchor : undefined
  const [anchor, setAnchor] = useState<ReadingAnchor>(initialRestore ?? openingAnchor)
  const [appliedRestoreKey, setAppliedRestoreKey] = useState<string | null>(restore?.key ?? null)
  const [atEnd, setAtEnd] = useState(false)

  const onAnchorChangeRef = useRef(onAnchorChange)
  const lastChapterRef = useRef(chapter.id)
  const detectedRestoreKeyRef = useRef<string | null>(null)
  const lastPersistedRef = useRef<string | null>(null)
  const skipInitialPersistenceRef = useRef(skipInitialPersistence)
  const skipInitialDetectionRef = useRef(skipInitialPersistence)

  // A guarded render-time state adjustment applies a new navigation restore
  // before commit. Subsequent settings/reflow/auth renders keep the consumed
  // anchor, and no layout/passive effect schedules a second restore.
  if (restore && restore.anchor.chapterId === chapter.id && appliedRestoreKey !== restore.key) {
    setAppliedRestoreKey(restore.key)
    setAnchor(restore.anchor)
    setAtEnd(false)
  }

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
      // Whole-book 100% is meaningful only at the bottom of the FINAL chapter;
      // scrolling to the bottom of an earlier chapter must not report 100%.
      const isFinalChapter = chapter.id === book.chapters[book.chapters.length - 1]?.id
      setAtEnd(ended && isFinalChapter)
      const blockId = current?.dataset.blockId
      if (blockId) {
        setAnchor((previous) =>
          previous.chapterId === chapter.id && previous.blockId === blockId
            ? previous
            : { chapterId: chapter.id, blockId },
        )
      }
    }

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }

    // New chapter: reset scroll to its top before detecting, so the detector
    // starts at the chapter opening rather than a stale previous position.
    const restoringThisEntry =
      appliedRestoreKey !== null && detectedRestoreKeyRef.current !== appliedRestoreKey
    if (restoringThisEntry) detectedRestoreKeyRef.current = appliedRestoreKey
    if (lastChapterRef.current !== chapter.id) {
      lastChapterRef.current = chapter.id
      if (!restoringThisEntry) {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
      }
    }
    if (!restoringThisEntry) {
      if (skipInitialDetectionRef.current) skipInitialDetectionRef.current = false
      else update()
    }
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [
    book.id,
    book.chapters,
    chapter.id,
    contentRef,
    appliedRestoreKey,
  ])

  const chapterIndex = resolveChapterIndex(book, chapter.id)
  const blockIndex = resolveBlockIndex(chapter, effectiveAnchor.blockId)

  const percent = useMemo(() => {
    if (effectiveAtEnd) return 1
    if (effectiveAnchor.blockId) {
      return computePercent(book, chapterIndex, blockIndex, false)
    }
    return progressFromReadingState(book, {
      bookId: book.id,
      chapterId: effectiveAnchor.chapterId,
      blockId: '',
      updatedAt: '',
    })
  }, [book, chapterIndex, blockIndex, effectiveAtEnd, effectiveAnchor])

  useEffect(() => {
    if (!canPersist) return
    const signature = [
      entryKey,
      book.id,
      effectiveAnchor.chapterId,
      effectiveAnchor.blockId,
      effectiveAnchor.offset ?? '',
    ].join(':')
    if (lastPersistedRef.current === signature) return
    lastPersistedRef.current = signature
    if (skipInitialPersistenceRef.current) {
      skipInitialPersistenceRef.current = false
      return
    }
    onAnchorChangeRef.current?.(effectiveAnchor)
  }, [canPersist, entryKey, book.id, chapter.id, effectiveAnchor])

  return { anchor: effectiveAnchor, percent, chapterIndex, blockIndex }
}
