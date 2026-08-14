import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { listCatalogEntries, type CatalogEntry } from '../reader/catalog'
import { useStrings } from '../i18n/strings'
import { useBookOwned, useBookState } from '../lib/persistence/useBookState'
import { bookCtaState, resumeHref, tierOf } from '../lib/bookAccess'
import { BookActions } from '../components/BookActions'
import { BookCard } from '../components/BookCard'
import { BookCover } from '../components/BookCover'
import { Price } from '../components/Price'

/**
 * Storefront — the platform's editorial surface (docs/ui-ux-research.md §4.1).
 * The first catalog entry is the editorial feature; the rest form the compact
 * book shelf. Book-agnostic: only catalog data, never a first-book branch.
 */
export function HomePage() {
  const strings = useStrings()
  const entries = listCatalogEntries()
  const featured = entries[0]
  const rest = entries.slice(1)
  useDocumentTitle(strings.home.title)

  return (
    <section className="page" aria-labelledby="home-title">
      <h1 className="page__title" id="home-title">
        {strings.home.title}
      </h1>
      <p className="page__lead">{strings.home.lead}</p>

      {featured && <FeaturedBook entry={featured} />}

      {rest.length > 0 && (
        <section className="storefront-catalog" aria-labelledby="catalog-title">
          <h2 className="section-title" id="catalog-title">
            {strings.storefront.catalog}
          </h2>
          <ul className="book-card-grid">
            {rest.map((entry) => (
              <StorefrontBookCard key={entry.book.id} entry={entry} />
            ))}
          </ul>
        </section>
      )}
    </section>
  )
}

function StorefrontBookCard({ entry }: { entry: CatalogEntry }) {
  const { owned, loading } = useBookOwned(entry.book.id)
  return <BookCard book={entry.book} owned={owned} loading={loading} />
}

/** Editorial feature: large cover + copy + CTA for the first catalog entry. */
function FeaturedBook({ entry }: { entry: CatalogEntry }) {
  const strings = useStrings()
  const { book, previewBoundary } = entry
  const { owned, readingState, loading } = useBookState(book.id)
  const cta = bookCtaState(book, owned, readingState, previewBoundary)
  const resume = readingState ? resumeHref(book, readingState.chapterId) : undefined
  const tier = tierOf(book)
  const ownedByUser = tier !== 'free' && tier !== 'preview' && owned

  return (
    <article className="featured-book" aria-labelledby={`featured-${book.id}`}>
      <Link
        className="featured-book__cover"
        to={`/books/${book.slug}`}
        aria-label={book.title}
        tabIndex={-1}
      >
        <BookCover book={book} />
      </Link>
      <div className="featured-book__copy">
        <p className="featured-book__kicker">{strings.storefront.featured}</p>
        <h2 className="featured-book__title" id={`featured-${book.id}`}>
          <Link to={`/books/${book.slug}`}>{book.title}</Link>
        </h2>
        {book.subtitle && <p className="featured-book__subtitle">{book.subtitle}</p>}
        {book.description && <p className="featured-book__proposition">{book.description}</p>}
        <p className="featured-book__author">
          {book.authors.map((author) => author.name).join(' / ')}
        </p>
        <p className="featured-book__access">
          {ownedByUser ? (
            <span className="entitlement-label">{strings.storefront.owned}</span>
          ) : (
            <Price book={book} />
          )}
        </p>
        <BookActions
          book={book}
          cta={cta}
          resumeHref={resume}
          loading={loading && tier === 'paid'}
          className="featured-book__actions"
        />
        <Link className="featured-book__details" to={`/books/${book.slug}`}>
          {strings.storefront.viewDetails}
        </Link>
      </div>
    </article>
  )
}
