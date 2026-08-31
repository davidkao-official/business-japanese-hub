import { describe, expect, it } from 'vitest'
import { resolveLibraryReference } from './libraryReference'

describe('stable Library reference resolution', () => {
  it('resolves a Book id to its current slug route', () => {
    expect(resolveLibraryReference({ bookId: 'book-sample-bj-email' })).toEqual({
      kind: 'resolved',
      href: '/books/email-manners',
    })
  })

  it('resolves stable Chapter and block ids without putting ids in path segments', () => {
    expect(
      resolveLibraryReference({
        bookId: 'book-sample-bj-email',
        chapterId: 'bm-ch-3',
        blockId: 'bm-ch3-blk-01',
      }),
    ).toEqual({
      kind: 'resolved',
      href: '/books/email-manners/read/requests-and-closings#block-bm-ch3-blk-01',
    })
  })

  it.each([
    [{ bookId: '' }, 'book-not-found'],
    [{ bookId: 'missing' }, 'book-not-found'],
    [{ bookId: 'book-sample-bj-email', chapterId: '' }, 'invalid-reference'],
    [
      { bookId: 'book-sample-bj-email', chapterId: 'bm-ch-3', blockId: '' },
      'invalid-reference',
    ],
    [{ bookId: 'book-sample-bj-email', chapterId: 'missing' }, 'chapter-not-found'],
    [{ bookId: 'book-sample-bj-email', blockId: 'bm-ch3-blk-01' }, 'invalid-reference'],
    [
      {
        bookId: 'book-sample-bj-email',
        chapterId: 'bm-ch-2',
        blockId: 'bm-ch3-blk-01',
      },
      'block-not-found',
    ],
  ] as const)('fails closed for unavailable or mismatched references', (reference, reason) => {
    expect(resolveLibraryReference(reference)).toEqual({ kind: 'unavailable', reason })
  })
})
