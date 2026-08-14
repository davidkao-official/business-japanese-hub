import { Link } from 'react-router-dom'
import type { Book, Chapter } from '../content/types'
import { useStrings } from '../i18n/strings'

export interface ReaderChapterNavProps {
  book: Book
  prev?: Chapter
  next?: Chapter
}

/** Previous/next chapter links at the END of the chapter flow — not viewport-sticky. */
export function ReaderChapterNav({ book, prev, next }: ReaderChapterNavProps) {
  const strings = useStrings()

  return (
    <nav className="reader-chapter-nav" aria-label={strings.reader.chapterNav}>
      {prev ? (
        <Link className="reader-chapter-nav__link reader-chapter-nav__link--prev" to={`/books/${book.slug}/read/${prev.slug}`}>
          <span className="reader-chapter-nav__mark" aria-hidden="true">
            ‹
          </span>
          <span>
            <span className="reader-chapter-nav__kind">{strings.reader.previousChapter}</span>
            <span className="reader-chapter-nav__title">{prev.title}</span>
          </span>
        </Link>
      ) : (
        <span className="reader-chapter-nav__gap" />
      )}
      {next ? (
        <Link className="reader-chapter-nav__link reader-chapter-nav__link--next" to={`/books/${book.slug}/read/${next.slug}`}>
          <span>
            <span className="reader-chapter-nav__kind">{strings.reader.nextChapter}</span>
            <span className="reader-chapter-nav__title">{next.title}</span>
          </span>
          <span className="reader-chapter-nav__mark" aria-hidden="true">
            ›
          </span>
        </Link>
      ) : (
        <span className="reader-chapter-nav__gap" />
      )}
    </nav>
  )
}
