import { describe, expect, it } from 'vitest'
import { sampleBook } from '../content/fixtures/sample-book'
import { progressFromReadingState } from './readingPosition'
import type { ReadingState } from '../lib/persistence/types'

function state(chapterId: string, blockId?: string): ReadingState {
  return { bookId: sampleBook.id, chapterId, blockId, updatedAt: '2026-08-01T00:00:00.000Z' }
}

describe('progressFromReadingState', () => {
  it('returns 0 for an unknown chapter (deny-by-default)', () => {
    expect(progressFromReadingState(sampleBook, state('missing'))).toBe(0)
  })

  it('returns 0 for an unknown block id (deny-by-default)', () => {
    expect(progressFromReadingState(sampleBook, state('ch-2', 'missing'))).toBe(0)
  })

  it('maps a missing block id to the chapter-opening progress', () => {
    const chapterStart = progressFromReadingState(sampleBook, state('ch-2'))
    const firstBlock = progressFromReadingState(
      sampleBook,
      state('ch-2', sampleBook.chapters[1].blocks[0].id),
    )
    expect(chapterStart).toBeGreaterThan(0)
    expect(chapterStart).toBeLessThan(firstBlock)
  })

  it('treats an empty blockId as the chapter start, not a malformed reference', () => {
    // Regression (CodeRabbit): an empty block id represents "chapter start";
    // a later chapter's start must not read as whole-book 0% progress.
    const viaEmpty = progressFromReadingState(sampleBook, state('ch-2', ''))
    const viaMissing = progressFromReadingState(sampleBook, state('ch-2'))
    expect(viaEmpty).toBe(viaMissing)
    expect(viaEmpty).toBeGreaterThan(0)
  })

  it('is monotonic across the book', () => {
    const p1 = progressFromReadingState(sampleBook, state('ch-1', 'ch1-blk-02'))
    const p2 = progressFromReadingState(sampleBook, state('ch-2', 'ch2-blk-02'))
    const p3 = progressFromReadingState(sampleBook, state('ch-3', 'ch3-blk-04'))
    expect(p2).toBeGreaterThan(p1)
    expect(p3).toBeGreaterThan(p2)
  })
})
