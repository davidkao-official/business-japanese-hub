/**
 * BookActions — renders the §8.3 CTA matrix for a book (docs/ui-ux-research.md
 * §8.3): primary + optional secondary action. Pure rendering over the
 * `bookCtaState` output; the page decides ownership and resume targets.
 */

import { Link } from 'react-router-dom'
import type { Book } from '../content/types'
import { useStrings } from '../i18n/strings'
import type { BookCtaState } from '../lib/bookAccess'
import { isPaidLaunchLegalReady } from '../legal-content'
import { PreviewCTA } from './PreviewCTA'
import { PurchaseCTA } from './PurchaseCTA'

export interface BookActionsProps {
  book: Book
  cta: BookCtaState
  /** Href for the 続きを読む primary (the resume target chapter). */
  resumeHref?: string
  /** Hash anchor for the 目次を見る secondary (detail page only). */
  tocHref?: string
  /**
   * While ownership is resolving for a paid book, the primary purchase action
   * is replaced by a neutral pending note instead of flashing a wrong CTA.
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
        return loading ? (
          // While the legal launch gate is closed the resolved CTA carries a
          // status note under the button; reserve that line so the page does
          // not shift when ownership resolves.
          <span key="primary" className="purchase-cta">
            <span className="btn btn--pending" role="status">
              {strings.book.pending}
            </span>
            {!isPaidLaunchLegalReady() && (
              <span className="purchase-cta__note purchase-cta__note--reserve" aria-hidden="true">
                {strings.book.purchaseUnavailable}
              </span>
            )}
          </span>
        ) : (
          <PurchaseCTA book={book} key="primary" />
        )
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
    <div className={`cta-row${className ? ` ${className}` : ''}`}>
      {primary}
      {secondary}
    </div>
  )
}
