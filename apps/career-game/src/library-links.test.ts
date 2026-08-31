import { describe, expect, it } from 'vitest'
import {
  CANONICAL_LIBRARY_ORIGIN,
  libraryHomeHref,
  libraryLinkHref,
  resolveLibraryOrigin,
} from './library-links'

describe('Career Game Library links', () => {
  it('uses the canonical Library origin and builds stable resolver links', () => {
    expect(resolveLibraryOrigin(undefined)).toBe(CANONICAL_LIBRARY_ORIGIN)
    expect(libraryHomeHref(undefined)).toBe('https://business-japanese-hub.pages.dev/')
    expect(
      libraryLinkHref(
        { bookId: 'book id', chapterId: 'chapter/id', blockId: 'block?one' },
        undefined,
      ),
    ).toBe(
      'https://business-japanese-hub.pages.dev/library-link?bookId=book+id&chapterId=chapter%2Fid&blockId=block%3Fone',
    )
  })

  it('permits an origin-only HTTPS override and localhost development origins', () => {
    expect(resolveLibraryOrigin('https://library.example.jp/')).toBe('https://library.example.jp')
    expect(resolveLibraryOrigin('http://localhost:4173')).toBe('http://localhost:4173')
    expect(resolveLibraryOrigin('http://127.0.0.1:5173/')).toBe('http://127.0.0.1:5173')
  })

  it.each([
    'http://library.example.jp',
    'https://user:secret@library.example.jp',
    'https://library.example.jp/path',
    'https://library.example.jp/?query=private',
    'https://library.example.jp/#fragment',
    'not a URL',
  ])('fails closed to the canonical origin for unsafe override %s', (value) => {
    expect(resolveLibraryOrigin(value)).toBe(CANONICAL_LIBRARY_ORIGIN)
  })
})
