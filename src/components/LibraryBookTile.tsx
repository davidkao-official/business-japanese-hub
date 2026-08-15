/**
 * LibraryBookTile — one owned book in the Library's "Books you own" section.
 * The resume action reads the last-read chapter when present, otherwise it
 * starts from the beginning.
 */

import { Link } from 'react-router-dom'
import type { Book } from '../content/types'
import type { ReadingState } from '../lib/persistence/types'
import { resumeHref } from '../lib/bookAccess'
import { useStrings } from '../i18n/strings'
import { BookCover } from './BookCover'
import { ReadingProgress } from './ReadingProgress'

export interface LibraryBookTileProps {
  book: Book
  /** Null when the owned book has never been opened. */
  readingState: ReadingState | null
  /** Whole-book progress 0..1 (0 when never opened). */
  progress: number
}

export function LibraryBookTile({ book, readingState, progress }: LibraryBookTileProps) {
  const strings = useStrings()
  const href = resumeHref(book, readingState?.chapterId)

  return (
    <li className="library-book">
      <Link className="library-book__link" to={href}>
        <BookCover book={book} className="library-book__cover" />
        <span className="library-book__body">
          <span className="library-book__title">{book.title}</span>
          {book.authors.length > 0 && (
            <span className="library-book__meta">{book.authors.map((a) => a.name).join(' / ')}</span>
          )}
          {readingState && (
            <ReadingProgress percent={progress} label={strings.reader.progressLabel} />
          )}
        </span>
        <span className="library-book__cta">
          {readingState ? strings.library.continueReading : strings.reader.readFromStart}
        </span>
      </Link>
    </li>
  )
}
