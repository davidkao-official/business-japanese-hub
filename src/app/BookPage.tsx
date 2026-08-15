import { Link, useParams } from 'react-router-dom'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { getCatalogEntry } from '../reader/catalog'
import { useStrings } from '../i18n/strings'
import { useBookState } from '../lib/persistence/useBookState'
import { bookCtaState, offersPreview, resumeHref, tierOf } from '../lib/bookAccess'
import { BookActions } from '../components/BookActions'
import { BookCover } from '../components/BookCover'
import { Price } from '../components/Price'

/**
 * Book detail — publisher-like product page for the generic `/books/:slug`
 * route (docs/ui-ux-research.md §4.2). Book-agnostic: everything is driven by
 * the catalog entry + the §8.3 CTA matrix.
 */
export function BookPage() {
  const strings = useStrings()
  const { slug } = useParams<{ slug: string }>()
  const entry = slug ? getCatalogEntry(slug) : undefined
  const book = entry?.book
  const previewBoundary = entry?.previewBoundary

  const { owned, readingState, loading } = useBookState(book?.id ?? '')

  useDocumentTitle(
    book
      ? `${book.title} — ${strings.app.name}`
      : `${strings.book.notFound} — ${strings.app.name}`,
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

  const tier = tierOf(book)
  const cta = bookCtaState(book, owned, readingState, previewBoundary)
  const resume = readingState ? resumeHref(book, readingState.chapterId) : undefined
  const ownedByUser = tier !== 'free' && tier !== 'preview' && owned
  const hasPreview = offersPreview(tier, previewBoundary)

  return (
    <article className="book-detail" aria-labelledby="book-title">
      <header className="book-hero">
        <div className="book-hero__cover">
          <BookCover book={book} />
        </div>
        <div className="book-hero__copy">
          <h1 className="book-hero__title" id="book-title">
            {book.title}
          </h1>
          {book.subtitle && <p className="book-hero__subtitle">{book.subtitle}</p>}
          {book.authors.length > 0 && (
            <p className="book-hero__author">
              {book.authors.map((author) => author.name).join(' / ')}
            </p>
          )}
          {book.description && <p className="book-hero__proposition">{book.description}</p>}
          <p className="book-hero__access">
            {ownedByUser ? (
              <span className="entitlement-label">{strings.book.ownedLabel}</span>
            ) : (
              <Price book={book} />
            )}
          </p>
          <BookActions
            book={book}
            cta={cta}
            resumeHref={resume}
            tocHref="#book-toc"
            loading={loading && tier === 'paid'}
            className="book-hero__actions"
          />
        </div>
      </header>

      <div className="book-detail__sections">
        {book.description && (
          <section className="book-section" aria-labelledby="book-about-title">
            <h2 className="section-title" id="book-about-title">
              {strings.book.about}
            </h2>
            <p className="book-section__body">{book.description}</p>
          </section>
        )}

        {(book.audience?.description || book.difficulty) && (
          <section className="book-section" aria-labelledby="book-audience-title">
            <h2 className="section-title" id="book-audience-title">
              {strings.book.audience}
            </h2>
            <dl className="book-metadata">
              {book.audience?.description && (
                <>
                  <dt>{strings.book.audience}</dt>
                  <dd>{book.audience.description}</dd>
                </>
              )}
              {book.difficulty && (
                <>
                  <dt>{strings.book.prerequisite}</dt>
                  <dd>
                    {book.difficulty.description ??
                      book.difficulty.label ??
                      `${strings.book.prerequisite}: ${book.difficulty.level}`}
                  </dd>
                </>
              )}
            </dl>
          </section>
        )}

        {book.tableOfContents && book.tableOfContents.entries.length > 0 && (
          <section className="book-section" id="book-toc" aria-labelledby="book-toc-title">
            <h2 className="section-title" id="book-toc-title">
              {strings.reader.tableOfContents}
            </h2>
            <ol className="book-toc-preview">
              {book.tableOfContents.entries.map((tocEntry) => {
                const chapter = book.chapters.find((c) => c.id === tocEntry.chapterId)
                if (!chapter) return null
                return (
                  <li key={tocEntry.chapterId}>
                    <Link to={`/books/${book.slug}/read/${chapter.slug}`}>
                      <span className="book-toc-preview__order">
                        {strings.reader.chapterLabel(chapter.order)}
                      </span>
                      <span className="book-toc-preview__title">{tocEntry.title}</span>
                    </Link>
                  </li>
                )
              })}
            </ol>
            {hasPreview && (
              <p className="book-section__note">{strings.readerGate.previewNote}</p>
            )}
          </section>
        )}

        {book.authors.length > 0 && (
          <section className="book-section" aria-labelledby="book-authors-title">
            <h2 className="section-title" id="book-authors-title">
              {strings.book.authors}
            </h2>
            {book.authors.map((author) => (
              <p key={author.id ?? author.name} className="book-section__body">
                <strong>{author.name}</strong>
                {author.bio && <span> — {author.bio}</span>}
              </p>
            ))}
          </section>
        )}

        <section className="book-section" aria-labelledby="book-publication-title">
          <h2 className="section-title" id="book-publication-title">
            {strings.book.publicationDetails}
          </h2>
          <dl className="book-metadata">
            {book.edition && (
              <>
                <dt>{strings.book.editionLabel}</dt>
                <dd>{book.edition.label ?? `${book.edition.number}`}</dd>
              </>
            )}
            {book.publication?.releasedAt && (
              <>
                <dt>{strings.book.released}</dt>
                <dd>{book.publication.releasedAt}</dd>
              </>
            )}
            <dt>{strings.book.language}</dt>
            <dd>{book.language}</dd>
          </dl>
        </section>
      </div>
    </article>
  )
}
