/**
 * ReaderPaidBoundary — the inline block-level boundary marker inside the
 * Universal Reader. It renders where a block-prefix preview ends: the reader
 * keeps its own typography and quietly marks "ここから先は購入後" with the
 * purchase CTA (docs/ui-ux-research.md §4.2).
 */

import { Link } from 'react-router-dom'
import type { Book } from '../content/types'
import { PurchaseCTA } from '../components/PurchaseCTA'
import { useStrings } from '../i18n/strings'

export interface ReaderPaidBoundaryProps {
  book: Book
}

export function ReaderPaidBoundary({ book }: ReaderPaidBoundaryProps) {
  const strings = useStrings()

  return (
    <div className="reader-paid-boundary">
      <p className="reader-paid-boundary__message">{strings.reader.paidBoundary}</p>
      <PurchaseCTA book={book} />
      <Link className="reader-paid-boundary__back" to={`/books/${book.slug}`}>
        {strings.readerGate.backToBook}
      </Link>
    </div>
  )
}
