import { Link } from 'react-router-dom'
import type { Book, Chapter } from '../content/types'
import { useStrings } from '../i18n/strings'

export interface ReaderTocProps {
  book: Book
  current: Chapter
  /** Called after a navigation target is chosen so the overlay closes. */
  onNavigate: () => void
}

/**
 * Table of contents: all chapters (current marked) plus the current chapter's
 * level-2 section headings as in-document anchors.
 */
export function ReaderToc({ book, current, onNavigate }: ReaderTocProps) {
  const strings = useStrings()
  const sections = current.blocks.filter((block) => block.type === 'heading')

  return (
    <div className="reader-toc">
      <ol className="reader-toc__chapters">
        {book.chapters.map((chapter) => {
          const isCurrent = chapter.id === current.id
          return (
            <li key={chapter.id}>
              <Link
                className={`reader-toc__link${isCurrent ? ' reader-toc__link--current' : ''}`}
                aria-current={isCurrent ? 'location' : undefined}
                to={`/books/${book.slug}/read/${chapter.slug}`}
                onClick={onNavigate}
              >
                <span className="reader-toc__order">{strings.reader.chapterLabel(chapter.order)}</span>
                <span className="reader-toc__title">{chapter.title}</span>
              </Link>
            </li>
          )
        })}
      </ol>
      {sections.length > 0 && (
        <div className="reader-toc__sections">
          <p className="reader-toc__sections-label">{current.title}</p>
          <ol className="reader-toc__section-list">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  className="reader-toc__section-link"
                  href={`#block-${section.id}`}
                  onClick={() => {
                    onNavigate()
                    // After the overlay closes, hand focus to the target block so
                    // a keyboard user continues reading from the destination.
                    window.setTimeout(() => {
                      document
                        .getElementById(`block-${section.id}`)
                        ?.focus({ preventScroll: true })
                    }, 0)
                  }}
                >
                  {section.text}
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
