import { describe, expect, it } from 'vitest'
import { bookCtaState, offersPreview, resumeHref, tierOf } from './bookAccess'
import { sampleBook } from '../content/fixtures/sample-book'
import type { ReadingState } from './persistence/types'

const paid = sampleBook
const boundary = { chapterId: 'ch-1' }

describe('tierOf', () => {
  it('returns the declared tier', () => {
    expect(tierOf(paid)).toBe('paid')
  })

  it('defaults a book without a price to paid (deny-by-default)', () => {
    expect(tierOf({ ...paid, price: undefined })).toBe('paid')
  })
})

describe('offersPreview', () => {
  it('free / preview tiers always offer a preview (whole book is public)', () => {
    expect(offersPreview('free')).toBe(true)
    expect(offersPreview('preview')).toBe(true)
  })

  it('paid offers a preview only when a boundary is declared', () => {
    expect(offersPreview('paid')).toBe(false)
    expect(offersPreview('paid', boundary)).toBe(true)
  })
})

describe('bookCtaState — the §8.3 CTA matrix', () => {
  it('free books are readable by everyone → 読み始める', () => {
    const free = { ...paid, price: { tier: 'free' as const, amount: 0, currency: 'JPY' } }
    expect(bookCtaState(free, false, null)).toEqual({ primary: 'start', secondary: 'toc' })
  })

  it('paid + unowned + preview → 購入する / 試し読み', () => {
    expect(bookCtaState(paid, false, null, boundary)).toEqual({
      primary: 'purchase',
      secondary: 'preview',
    })
  })

  it('paid + unowned + no preview → 購入する only', () => {
    expect(bookCtaState(paid, false, null)).toEqual({ primary: 'purchase' })
  })

  it('paid + owned + unread → 読み始める / 目次を見る', () => {
    expect(bookCtaState(paid, true, null, boundary)).toEqual({
      primary: 'start',
      secondary: 'toc',
    })
  })

  it('paid + owned + progress → 続きを読む / 目次を見る', () => {
    const readingState: ReadingState = {
      bookId: paid.id,
      chapterId: 'ch-2',
      updatedAt: '2026-08-01T00:00:00.000Z',
    }
    expect(bookCtaState(paid, true, readingState, boundary)).toEqual({
      primary: 'continue',
      secondary: 'toc',
    })
  })
})

describe('resumeHref', () => {
  it('maps a persisted chapter id to its reader route', () => {
    expect(resumeHref(paid, 'ch-2')).toBe('/books/keigo-essentials/read/keigo-in-meetings')
  })

  it('falls back to the reader entry for unknown / missing ids (deny-by-default)', () => {
    expect(resumeHref(paid, 'missing')).toBe('/books/keigo-essentials/read')
    expect(resumeHref(paid, undefined)).toBe('/books/keigo-essentials/read')
  })
})
