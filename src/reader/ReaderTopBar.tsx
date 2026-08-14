import { Link } from 'react-router-dom'
import type { Book, Chapter } from '../content/types'
import { useStrings } from '../i18n/strings'

export interface ReaderTopBarProps {
  book: Book
  chapter: Chapter
  tocOpen: boolean
  hidden: boolean
  onToggleToc: () => void
  onOpenSettings: () => void
}

/**
 * Reader chrome. On desktop it is always visible; on mobile it slides away on
 * scroll-down and back on scroll-up (content-first, tools on intent). While
 * hidden it is `inert` so its controls are not keyboard-reachable.
 */
export function ReaderTopBar({
  book,
  chapter,
  tocOpen,
  hidden,
  onToggleToc,
  onOpenSettings,
}: ReaderTopBarProps) {
  const strings = useStrings()

  return (
    <header
      className={`reader-topbar${hidden ? ' reader-topbar--hidden' : ''}`}
      inert={hidden}
    >
      <div className="reader-topbar__inner">
        <Link
          className="reader-topbar__back"
          to={`/books/${book.slug}`}
          aria-label={strings.reader.backToBook}
        >
          <span className="reader-topbar__back-mark" aria-hidden="true">
            ‹
          </span>
          <span className="reader-topbar__back-text">{strings.reader.backToBook}</span>
        </Link>
        <div className="reader-topbar__meta">
          <span className="reader-topbar__book">{book.title}</span>
          <span className="reader-topbar__chapter">
            {strings.reader.chapterLabel(chapter.order)} · {chapter.title}
          </span>
        </div>
        <div className="reader-topbar__actions">
          <button
            type="button"
            className="reader-topbar__action reader-topbar__action--toc"
            aria-expanded={tocOpen}
            aria-controls="reader-toc-panel"
            onClick={onToggleToc}
          >
            {strings.reader.tableOfContents}
          </button>
          <button
            type="button"
            className="reader-topbar__action"
            aria-label={strings.reader.settings}
            aria-haspopup="dialog"
            onClick={onOpenSettings}
          >
            <span aria-hidden="true">Aa</span>
            <span className="reader-topbar__action-text">{strings.reader.settings}</span>
          </button>
        </div>
      </div>
    </header>
  )
}
