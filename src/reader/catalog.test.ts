import { describe, expect, it } from 'vitest'
import { getBookBySlug, getCatalogEntry, listBooks } from './catalog'
import { sampleBook } from '../content/fixtures/sample-book'
import { secondBook } from '../content/fixtures/second-book'
import { validateBook } from '../content/validate'

describe('catalog', () => {
  it('registers the free Prototype books (book-agnostic storefront inventory)', () => {
    const books = listBooks()
    expect(books).toHaveLength(2)
    expect(books.map((book) => book.id)).toContain(sampleBook.id)
    expect(books.map((book) => book.id)).toContain(secondBook.id)
  })

  it('registers Prototype books as free/public with no preview boundary', () => {
    for (const book of listBooks()) {
      expect(book.price?.tier).toBe('free')
      const entry = getCatalogEntry(book.slug)
      expect(entry?.previewBoundary).toBeUndefined()
    }
  })

  it('resolves books by slug (reader + detail seam)', () => {
    expect(getBookBySlug(sampleBook.slug)).toBe(sampleBook)
    expect(getBookBySlug(secondBook.slug)).toBe(secondBook)
    expect(getBookBySlug('missing')).toBeUndefined()
    expect(getCatalogEntry('missing')).toBeUndefined()
  })

  it('keeps the content-model fixtures valid (new book must validate)', () => {
    for (const book of listBooks()) {
      expect(validateBook(book).ok).toBe(true)
    }
  })
})
