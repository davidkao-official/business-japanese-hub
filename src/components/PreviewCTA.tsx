/**
 * PreviewCTA — the 試し読み entry. It routes straight into the Universal
 * Reader (the same block renderer) at the book's first chapter, which is always
 * inside the ordered preview prefix (docs/ui-ux-research.md §4.2).
 */

import { Link } from 'react-router-dom'
import type { Book } from '../content/types'
import { useStrings } from '../i18n/strings'

export interface PreviewCTAProps {
  book: Book
  className?: string
}

export function PreviewCTA({ book, className = '' }: PreviewCTAProps) {
  const strings = useStrings()
  const firstChapter = book.chapters[0]
  if (!firstChapter) return null

  return (
    <Link
      className={`btn btn--secondary${className ? ` ${className}` : ''}`}
      to={`/books/${book.slug}/read/${firstChapter.slug}`}
    >
      {strings.book.preview}
    </Link>
  )
}
