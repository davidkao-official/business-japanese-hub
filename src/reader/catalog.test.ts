import { describe, expect, it } from 'vitest'
import { getBookBySlug, getCatalogEntry, listBooks } from './catalog'
import { sampleBook } from '../content/fixtures/sample-book'
import { secondBook } from '../content/fixtures/second-book'
import { validateBook } from '../content/validate'

describe('catalog', () => {
  it('registers multiple fixture books (book-agnostic storefront inventory)', () => {
    const books = listBooks()
    expect(books).toHaveLength(2)
    expect(books.map((book) => book.id)).toContain(sampleBook.id)
    expect(books.map((book) => book.id)).toContain(secondBook.id)
  })

  it('attaches a gate-shaped preview boundary to each paid book', () => {
    const keigo = getCatalogEntry(sampleBook.slug)
    expect(keigo?.book).toBe(sampleBook)
    expect(keigo?.previewBoundary).toEqual({ chapterId: 'ch-1' })

    const email = getCatalogEntry(secondBook.slug)
    expect(email?.book).toBe(secondBook)
    expect(email?.previewBoundary).toEqual({ chapterId: 'bm-ch-1' })
  })

  it('resolves books by slug (reader + detail seam)', () => {
    expect(getBookBySlug(sampleBook.slug)).toBe(sampleBook)
    expect(getBookBySlug(secondBook.slug)).toBe(secondBook)
    expect(getBookBySlug('missing')).toBeUndefined()
    expect(getCatalogEntry('missing')).toBeUndefined()
  })

  it('registers both fixture books as paid with a preview', () => {
    for (const book of listBooks()) {
      expect(book.price?.tier).toBe('paid')
      expect(book.price?.amount).toBeGreaterThan(0)
      const entry = getCatalogEntry(book.slug)
      expect(entry?.previewBoundary).toBeDefined()
    }
  })

  it('keeps the content-model fixtures valid (new book must validate)', () => {
    for (const book of listBooks()) {
      expect(validateBook(book).ok).toBe(true)
    }
  })
})
