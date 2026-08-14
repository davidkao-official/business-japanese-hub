/**
 * Unit tests for the pure reading-position logic. No DOM, no React — the
 * functions are data-only so they can be exercised against the sample fixture
 * directly.
 */

import { describe, expect, it } from 'vitest'
import { sampleBook } from '../content/fixtures/sample-book'
import type { ContentBlock } from '../content/types'
import {
  blockText,
  bookCharacterCount,
  bookCharacterOffset,
  chapterCharacterCount,
  computePercent,
  resolveBlockIndex,
  resolveChapterIndex,
} from './readingPosition'

const ch1 = sampleBook.chapters[0]
const ch2 = sampleBook.chapters[1]
const ch3 = sampleBook.chapters[2]

describe('blockText', () => {
  it('returns the plain text of a paragraph block', () => {
    const paragraph = ch1.blocks.find((b) => b.id === 'ch1-blk-02')
    expect(paragraph).toBeDefined()
    expect(blockText(paragraph as ContentBlock)).toBe((paragraph as { text: string }).text)
  })

  it('joins the fields of a vocabulary block', () => {
    const vocab = ch1.blocks.find((b) => b.type === 'vocabulary')
    const text = blockText(vocab as ContentBlock)
    expect(text).toContain('敬語')
    expect(text).toContain('けいご')
    expect(text).toContain('相手への敬意')
  })

  it('joins every dialogue line speaker + text', () => {
    const dialogue = ch2.blocks.find((b) => b.type === 'dialogue')
    const text = blockText(dialogue as ContentBlock)
    expect(text).toContain('部長')
    expect(text).toContain('佐藤')
    expect(text).toContain('ご報告いたします')
  })

  it('is empty for an unknown block type (forward compat)', () => {
    expect(blockText({ id: 'x', type: 'unknown' } as unknown as ContentBlock)).toBe('')
  })
})

describe('character counting', () => {
  it('counts a chapter as the sum of its block texts', () => {
    const expected = ch1.blocks.reduce((sum, b) => sum + blockText(b).length, 0)
    expect(chapterCharacterCount(ch1)).toBe(expected)
    expect(chapterCharacterCount(ch1)).toBeGreaterThan(0)
  })

  it('counts the book as the sum of its chapters', () => {
    const expected = sampleBook.chapters.reduce((sum, c) => sum + chapterCharacterCount(c), 0)
    expect(bookCharacterCount(sampleBook)).toBe(expected)
    expect(bookCharacterCount(sampleBook)).toBeGreaterThan(0)
  })

  it('returns a zero offset before the very first block', () => {
    expect(bookCharacterOffset(sampleBook, 0, 0)).toBe(0)
  })

  it('accumulates whole earlier chapters', () => {
    expect(bookCharacterOffset(sampleBook, 1, 0)).toBe(chapterCharacterCount(ch1))
    expect(bookCharacterOffset(sampleBook, 2, 0)).toBe(
      chapterCharacterCount(ch1) + chapterCharacterCount(ch2),
    )
  })

  it('accumulates earlier blocks inside the target chapter', () => {
    const expected =
      chapterCharacterCount(ch1) + chapterCharacterCount(ch2) +
      ch3.blocks.slice(0, 2).reduce((sum, b) => sum + blockText(b).length, 0)
    expect(bookCharacterOffset(sampleBook, 2, 2)).toBe(expected)
  })
})

describe('index resolution', () => {
  it('resolves chapters and blocks by stable id', () => {
    expect(resolveChapterIndex(sampleBook, 'ch-1')).toBe(0)
    expect(resolveChapterIndex(sampleBook, 'ch-3')).toBe(2)
    expect(resolveChapterIndex(sampleBook, 'missing')).toBe(-1)
    expect(resolveBlockIndex(ch1, 'ch1-blk-01')).toBe(0)
    expect(resolveBlockIndex(ch1, 'missing')).toBe(-1)
  })
})

describe('computePercent', () => {
  it('returns 0 for invalid or empty positions', () => {
    expect(computePercent(sampleBook, -1, 0)).toBe(0)
    expect(computePercent(sampleBook, 0, -1)).toBe(0)
  })

  it('returns 1 when the reader has reached the end', () => {
    expect(computePercent(sampleBook, 2, ch3.blocks.length - 1, true)).toBe(1)
    expect(computePercent(sampleBook, 0, 0, true)).toBe(1)
  })

  it('starts near 0 at the opening block and is strictly increasing across chapters', () => {
    const p00 = computePercent(sampleBook, 0, 0)
    const p10 = computePercent(sampleBook, 1, 0)
    const p20 = computePercent(sampleBook, 2, 0)
    expect(p00).toBeGreaterThan(0)
    expect(p00).toBeLessThan(p10)
    expect(p10).toBeLessThan(p20)
    expect(p20).toBeLessThan(1)
  })

  it('is monotonic within a chapter (later block >= earlier block)', () => {
    for (let i = 0; i < ch2.blocks.length - 1; i += 1) {
      const a = computePercent(sampleBook, 1, i)
      const b = computePercent(sampleBook, 1, i + 1)
      expect(b).toBeGreaterThanOrEqual(a)
    }
  })

  it('climbs toward 1 at the final block even without the end flag', () => {
    const last = computePercent(sampleBook, 2, ch3.blocks.length - 1)
    expect(last).toBeGreaterThan(0.9)
    expect(last).toBeLessThanOrEqual(1)
  })

  it('returns 0 for a chapter index beyond the last chapter', () => {
    // Regression: upper-bound indices must be rejected before any array
    // dereference, not dereference an undefined chapter and crash.
    expect(computePercent(sampleBook, sampleBook.chapters.length, 0)).toBe(0)
    expect(computePercent(sampleBook, 99, 0)).toBe(0)
  })

  it('returns 0 for a block index beyond the last block of the chapter', () => {
    expect(computePercent(sampleBook, 0, ch1.blocks.length)).toBe(0)
    expect(computePercent(sampleBook, 2, 99)).toBe(0)
  })

  it('keeps reachedEnd behavior even when the indices are out of bounds', () => {
    expect(computePercent(sampleBook, 99, 99, true)).toBe(1)
  })

  it('returns 0 for NaN or fractional indices instead of dereferencing', () => {
    // Regression: NaN/fractional chapter or block indices must degrade to "no
    // progress" (0), never index into the arrays with an invalid key and crash.
    expect(computePercent(sampleBook, Number.NaN, 0)).toBe(0)
    expect(computePercent(sampleBook, 0, Number.NaN)).toBe(0)
    expect(computePercent(sampleBook, 1.5, 0)).toBe(0)
    expect(computePercent(sampleBook, 0, 1.5)).toBe(0)
  })
})
