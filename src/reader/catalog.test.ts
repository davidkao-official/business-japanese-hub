import { describe, expect, it } from 'vitest'
import { getBookBySlug, getCatalogEntry, listBooks, listCatalogEntries } from './catalog'
import { validateBook } from '../content/validate'

describe('catalog', () => {
  it('discovers releases and preserves the locked relative editorial order', () => {
    const slugs = listBooks().map((book) => book.slug)
    expect(slugs).toEqual(expect.arrayContaining(['meeting-japanese', 'keigo-essentials', 'email-manners']))
    expect(slugs.indexOf('meeting-japanese')).toBeLessThan(slugs.indexOf('keigo-essentials'))
    expect(slugs.indexOf('keigo-essentials')).toBeLessThan(slugs.indexOf('email-manners'))
  })

  it('preserves both Prototype books as free/public with no preview boundary', () => {
    for (const slug of ['keigo-essentials', 'email-manners']) {
      const book = getBookBySlug(slug)
      if (!book) throw new Error(`missing free Book ${slug}`)
      expect(book.price?.tier).toBe('free')
      const entry = getCatalogEntry(slug)
      expect(entry?.previewBoundary).toBeUndefined()
    }
  })

  it('registers the commercial Book with authoritative USD pricing and a partial preview', () => {
    const entry = getCatalogEntry('meeting-japanese')

    expect(entry?.book.price).toEqual({ tier: 'paid', amount: 12, currency: 'USD' })
    expect(entry?.previewBoundary).toEqual({ chapterId: 'mj-ch-1' })
    expect(entry?.book.chapters).toHaveLength(8)
  })

  it('resolves authored books and their bundled assets by slug', () => {
    const paid = getBookBySlug('meeting-japanese')
    expect(paid?.cover?.src).toMatch(/^\/(?:@fs\/|assets\/|books\/|content-dist\/)/)
    expect(paid?.cover?.src).not.toBe('/assets/books/meeting-japanese/cover.jpg')
    expect(getBookBySlug('keigo-essentials')).toBeDefined()
    expect(getBookBySlug('email-manners')).toBeDefined()
    expect(getBookBySlug('missing')).toBeUndefined()
    expect(getCatalogEntry('missing')).toBeUndefined()
  })

  it('keeps every discovered Book valid and rejects duplicate identities', () => {
    const entries = listCatalogEntries()
    const ids = entries.map(({ book }) => book.id)
    const slugs = entries.map(({ book }) => book.slug)

    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const { book } of entries) {
      expect(validateBook(book).ok).toBe(true)
    }
  })
})
