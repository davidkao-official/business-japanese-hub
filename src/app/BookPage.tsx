import { Link, useParams } from 'react-router-dom'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { getBookBySlug } from '../reader/catalog'
import { useStrings } from '../i18n/strings'

/**
 * Book detail — generic `/books/:slug` route. Resolves the book through the
 * catalog seam (issue #6 replaces it with a real registry / backend) and is
 * deliberately book-agnostic.
 */
export function BookPage() {
  const strings = useStrings()
  const { slug } = useParams<{ slug: string }>()
  const book = slug ? getBookBySlug(slug) : undefined

  useDocumentTitle(
    book ? `${book.title} — ${strings.app.name}` : `${strings.book.notFound} — ${strings.app.name}`,
  )

  if (!book) {
    return (
      <section className="page" aria-labelledby="book-title">
        <h1 className="page__title" id="book-title">
          {strings.book.notFound}
        </h1>
        <p className="page__lead">{strings.book.lead}</p>
        {slug && (
          <p className="page__meta" data-testid="book-slug">
            <code>{slug}</code>
          </p>
        )}
        <Link className="page__action" to="/library">
          {strings.nav.library}
        </Link>
      </section>
    )
  }

  const firstChapter = book.chapters[0]
  const tocEntries = book.tableOfContents?.entries ?? []

  return (
    <article className="page" aria-labelledby="book-title">
      <h1 className="page__title" id="book-title">
        {book.title}
      </h1>
      {book.subtitle && <p className="page__lead">{book.subtitle}</p>}
      {book.description && <p className="page__meta">{book.description}</p>}
      {book.authors.length > 0 && (
        <p className="page__meta">{book.authors.map((author) => author.name).join(' / ')}</p>
      )}

      {book.cover && (
        <figure className="book-cover">
          <img
            src={book.cover.src}
            alt={book.cover.alt}
            width={book.cover.width}
            height={book.cover.height}
          />
          {book.cover.caption && <figcaption className="book-cover__caption">{book.cover.caption}</figcaption>}
        </figure>
      )}

      {tocEntries.length > 0 && (
        <section aria-labelledby="book-toc-title">
          <h2 className="page__subtitle" id="book-toc-title">
            {strings.reader.tableOfContents}
          </h2>
          <ol className="book-toc">
            {tocEntries.map((entry) => {
              const chapter = book.chapters.find((c) => c.id === entry.chapterId)
              if (!chapter) return null
              return (
                <li key={entry.chapterId}>
                  <Link to={`/books/${book.slug}/read/${chapter.slug}`}>
                    {strings.reader.chapterLabel(chapter.order)} {entry.title}
                  </Link>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {firstChapter && (
        <Link className="page__action" to={`/books/${book.slug}/read/${firstChapter.slug}`}>
          {strings.reader.readFromStart}
        </Link>
      )}
    </article>
  )
}
