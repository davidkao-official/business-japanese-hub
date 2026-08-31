import { listBooks } from './catalog'

export interface LibraryReference {
  bookId: string
  chapterId?: string
  blockId?: string
}

export type LibraryReferenceUnavailableReason =
  | 'book-not-found'
  | 'chapter-not-found'
  | 'block-not-found'
  | 'invalid-reference'

export type LibraryReferenceResolution =
  | { kind: 'resolved'; href: string }
  | { kind: 'unavailable'; reason: LibraryReferenceUnavailableReason }

/** Resolve stable content ids inside the Library-owned released catalog. */
export function resolveLibraryReference(
  reference: LibraryReference,
): LibraryReferenceResolution {
  if (!reference.bookId) return { kind: 'unavailable', reason: 'book-not-found' }
  if (reference.chapterId === '' || reference.blockId === '') {
    return { kind: 'unavailable', reason: 'invalid-reference' }
  }
  if (reference.blockId && !reference.chapterId) {
    return { kind: 'unavailable', reason: 'invalid-reference' }
  }

  const book = listBooks().find((candidate) => candidate.id === reference.bookId)
  if (!book) return { kind: 'unavailable', reason: 'book-not-found' }
  if (!reference.chapterId) {
    return { kind: 'resolved', href: `/books/${book.slug}` }
  }

  const chapter = book.chapters.find((candidate) => candidate.id === reference.chapterId)
  if (!chapter) return { kind: 'unavailable', reason: 'chapter-not-found' }

  let href = `/books/${book.slug}/read/${chapter.slug}`
  if (reference.blockId) {
    if (!chapter.blocks.some((block) => block.id === reference.blockId)) {
      return { kind: 'unavailable', reason: 'block-not-found' }
    }
    href += `#${encodeURIComponent(`block-${reference.blockId}`)}`
  }
  return { kind: 'resolved', href }
}
