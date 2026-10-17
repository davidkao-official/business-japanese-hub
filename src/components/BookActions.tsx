/**
 * BookActions — renders the §8.3 CTA matrix for a book (docs/ui-ux-research.md
 * §8.3): primary + optional secondary action. Pure rendering over the
 * `bookCtaState` output; the page decides ownership and resume targets.
 */

import { Link } from 'react-router-dom'
import type { Book } from '../content/types'
import { useStrings } from '../i18n/strings'
import type { BookCtaState } from '../lib/bookAccess'
import { tierOf } from '../lib/bookAccess'
import { BookAccessNotice } from './BookAccessNotice'
import { PreviewCTA } from './PreviewCTA'

export interface BookActionsProps {
  book: Book
  cta: BookCtaState
  /** Href for the 続きを読む primary (the resume target chapter). */
  resumeHref?: string
  /** Hash anchor for the 目次を見る secondary (detail page only). */
  tocHref?: string
  /**
   * While ownership resolves, show a neutral pending note in the same space.
   */
  loading?: boolean
  className?: string
}

export function BookActions({
  book,
  cta,
  resumeHref,
  tocHref,
  loading = false,
  className = '',
}: BookActionsProps) {
  const strings = useStrings()
  const firstChapter = book.chapters[0]
  const startHref = firstChapter
    ? `/books/${book.slug}/read/${firstChapter.slug}`
    : `/books/${book.slug}/read`

  const primary = (() => {
    switch (cta.primary) {
      case 'purchase':
        return null
      case 'preview':
        return <PreviewCTA book={book} key="primary" />
      case 'start':
        return (
          <Link key="primary" className="btn btn--primary" to={startHref}>
            {strings.reader.readFromStart}
          </Link>
        )
      case 'continue':
        return (
          <Link key="primary" className="btn btn--primary" to={resumeHref ?? startHref}>
            {strings.reader.continueReading}
          </Link>
        )
      default:
        return null
    }
  })()

  const secondary = (() => {
    switch (cta.secondary) {
      case 'preview':
        return <PreviewCTA book={book} key="secondary" />
      case 'toc':
        // The 目次を見る secondary is a same-page hash jump on the detail page.
        return tocHref ? (
          <a key="secondary" className="btn btn--ghost" href={tocHref}>
            {strings.book.seeContents}
          </a>
        ) : null
      default:
        return null
    }
  })()

  return (
    <div className={`book-actions${tierOf(book) === 'paid' ? ' book-actions--paid' : ''}${className ? ` ${className}` : ''}`}>
      {tierOf(book) === 'paid' && (
        // Noninteractive sizing copy reserves the largest signed-out state for
        // pending and owner actions too, including when buttons stack on mobile.
        <div className="book-actions__reserve book-access-notice" aria-hidden="true">
          <p className="book-access-notice__message" data-label={strings.book.noLongerOffered} />
          <div className="cta-row">
            <span className="btn btn--ghost" data-label={strings.book.preview} />
            <span className="btn btn--secondary" data-label={strings.book.browseFreeReading} />
            <span className="btn btn--ghost" data-label={strings.auth.signIn} />
          </div>
        </div>
      )}
      <div className="book-actions__content">
        {loading ? (
          <div className="cta-row" aria-busy="true">
            <span className="btn btn--pending" role="status">{strings.book.pending}</span>
            {secondary}
          </div>
        ) : cta.primary === 'purchase' ? (
          <BookAccessNotice>{secondary}</BookAccessNotice>
        ) : (
          <div className="cta-row">{primary}{secondary}</div>
        )}
      </div>
    </div>
  )
}
