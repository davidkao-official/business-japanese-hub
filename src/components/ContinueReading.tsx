/**
 * ContinueReading — the Library's first section tile (docs/ui-ux-research.md
 * §4.3): cover + title + current chapter + last-read position + a resume entry
 * straight into the Universal Reader.
 */

import { Link } from 'react-router-dom'
import type { Book } from '../content/types'
import type { ReadingState } from '../lib/persistence/types'
import { resumeHref } from '../lib/bookAccess'
import { useStrings } from '../i18n/strings'
import { BookCover } from './BookCover'
import { ReadingProgress } from './ReadingProgress'

export interface ContinueReadingProps {
  book: Book
  readingState: ReadingState
  /** Whole-book progress 0..1 derived from the reading state. */
  progress: number
}

export function ContinueReading({ book, readingState, progress }: ContinueReadingProps) {
  const strings = useStrings()
  const chapter = book.chapters.find((c) => c.id === readingState.chapterId)
  const href = resumeHref(book, readingState.chapterId)

  return (
    <li className="continue-reading">
      <Link className="continue-reading__link" to={href}>
        <BookCover book={book} className="continue-reading__cover" />
        <span className="continue-reading__body">
          <span className="continue-reading__title">{book.title}</span>
          {chapter && (
            <span className="continue-reading__chapter">
              {strings.reader.chapterLabel(chapter.order)} · {chapter.title}
            </span>
          )}
          <span className="continue-reading__position">{strings.library.lastRead}</span>
          <ReadingProgress percent={progress} label={strings.reader.progressLabel} />
        </span>
        <span className="continue-reading__cta">{strings.library.continueReading}</span>
      </Link>
    </li>
  )
}
