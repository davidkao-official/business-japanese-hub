/**
 * ReaderPaidBoundary — the inline block-level boundary marker inside the
 * Universal Reader. It renders where a block-prefix preview ends: the reader
 * keeps its own typography and explains historical access (G2, #202).
 */

import { Link } from 'react-router-dom'
import type { Book } from '../content/types'
import { BookAccessNotice } from '../components/BookAccessNotice'
import { useStrings } from '../i18n/strings'

export interface ReaderPaidBoundaryProps {
  book: Book
}

export function ReaderPaidBoundary({ book }: ReaderPaidBoundaryProps) {
  const strings = useStrings()

  return (
    <div className="reader-paid-boundary">
      <BookAccessNotice />
      <Link className="reader-paid-boundary__back" to={`/books/${book.slug}`}>
        {strings.readerGate.backToBook}
      </Link>
    </div>
  )
}
