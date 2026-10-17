/**
 * ReaderGate — the entitlement denial surface shown by ReaderPage when the
 * requested chapter is not readable (paid content beyond the preview boundary,
 * or a whole paid book with no preview).
 *
 * This is the server-side-gated boundary in the UI: it never renders reader
 * content, and it is the single place that explains access + offers the
 * historical access / preview entry points (G2, #202).
 */

import { Link } from 'react-router-dom'
import type { Book } from '../content/types'
import { PreviewCTA } from '../components/PreviewCTA'
import { BookAccessNotice } from '../components/BookAccessNotice'
import { useStrings } from '../i18n/strings'

export interface ReaderGateProps {
  book: Book
  /** Whether the book offers any public preview (message + CTA set). */
  hasPreview: boolean
}

export function ReaderGate({ book, hasPreview }: ReaderGateProps) {
  const strings = useStrings()

  return (
    <section className="reader-gate" aria-labelledby="reader-gate-title">
      <p className="reader-gate__kicker">
        {hasPreview ? strings.readerGate.beyondPreview : strings.readerGate.locked}
      </p>
      <h1 className="reader-gate__title" id="reader-gate-title">
        {book.title}
      </h1>
      <BookAccessNotice>
        {hasPreview && <PreviewCTA book={book} />}
      </BookAccessNotice>
      <Link className="reader-gate__back" to={`/books/${book.slug}`}>
        {strings.readerGate.backToBook}
      </Link>
    </section>
  )
}
