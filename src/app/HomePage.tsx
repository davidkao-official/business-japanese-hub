import { useRef, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  createBrowserValidationAnalytics,
  createCrossProductMovementDeduper,
  type ValidationAnalytics,
} from '@business-japanese-hub/validation-analytics'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { listCatalogEntries, type CatalogEntry } from '../reader/catalog'
import { useStrings } from '../i18n/strings'
import { useBookOwned, useBookState } from '../lib/persistence/useBookState'
import { bookCtaState, resumeHref, tierOf } from '../lib/bookAccess'
import { BookActions } from '../components/BookActions'
import { BookCard } from '../components/BookCard'
import { BookCover } from '../components/BookCover'
import { Price } from '../components/Price'
import { careerGameHomeHref } from '../lib/cross-product/careerGame'
import {
  COFOUNDER_PROFILE,
  FOUNDER_PROFILE,
  type PublicProfile,
} from './storefrontProfiles'

const browserValidationAnalytics = createBrowserValidationAnalytics({
  functionsBaseUrl: import.meta.env.VITE_EDGE_FUNCTIONS_BASE_URL,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
})

export interface HomePageProps {
  analytics?: ValidationAnalytics
  careerGameOriginValue?: unknown
}

/**
 * Storefront — the platform's editorial surface (docs/ui-ux-research.md §4.1).
 * The first catalog entry is the editorial feature; the rest form the compact
 * book shelf. Book-agnostic: only catalog data, never a first-book branch.
 */
export function HomePage({
  analytics = browserValidationAnalytics,
  careerGameOriginValue = import.meta.env.VITE_CAREER_GAME_ORIGIN,
}: HomePageProps = {}) {
  const strings = useStrings()
  const entries = listCatalogEntries()
  const featured = entries[0]
  const rest = entries.slice(1)
  const careerGameMovementDeduper = useRef(createCrossProductMovementDeduper())
  useDocumentTitle(strings.home.title)

  function trackCareerGameLink(event: MouseEvent<HTMLAnchorElement>): void {
    const isAuxiliaryClick = event.type === 'auxclick'
    if (isAuxiliaryClick ? event.button !== 1 : event.button !== 0) return
    const keepsPageMounted =
      isAuxiliaryClick || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
    if (!careerGameMovementDeduper.current.shouldTrack(
      keepsPageMounted,
      event.currentTarget.href,
    )) return
    try {
      analytics.track({
        event: 'cross_product_link_clicked',
        direction: 'library_to_career_game',
      })
    } catch {
      // The ordinary cross-origin link remains usable if analytics is unavailable.
    }
  }

  return (
    <section className="page storefront-page" aria-labelledby="home-title">
      <div className="storefront-masthead">
        <h1 className="page__title" id="home-title">
          {strings.home.title}
        </h1>
        <p className="page__lead">{strings.home.lead}</p>
      </div>

      {featured && <FeaturedBook entry={featured} />}

      {featured && (
        <StorefrontPaths
          featured={featured}
          careerGameOriginValue={careerGameOriginValue}
          onCareerGameLink={trackCareerGameLink}
        />
      )}

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

      <PublicProfiles />
    </section>
  )
}

interface StorefrontPathsProps {
  featured: CatalogEntry
  careerGameOriginValue: unknown
  onCareerGameLink: (event: MouseEvent<HTMLAnchorElement>) => void
}

/**
 * The storefront's three product paths. These are links into existing
 * surfaces, not a second navigation model or a new set of product claims.
 */
function StorefrontPaths({
  featured,
  careerGameOriginValue,
  onCareerGameLink,
}: StorefrontPathsProps) {
  const strings = useStrings()

  return (
    <section className="storefront-paths" aria-label={strings.app.name}>
      <ul className="storefront-paths__list">
        <li>
          <article className="storefront-path" aria-labelledby="storefront-read-title">
            <p className="storefront-path__label" lang="en">READ</p>
            <h2 className="storefront-path__title" id="storefront-read-title">
              {strings.storefront.featured}
            </h2>
            <p className="storefront-path__description">
              {featured.book.description ?? featured.book.subtitle ?? strings.home.lead}
            </p>
            <Link className="storefront-path__link" to={`/books/${featured.book.slug}`}>
              {strings.storefront.viewDetails}
              <span aria-hidden="true">→</span>
            </Link>
          </article>
        </li>
        <li>
          <article className="storefront-path" aria-labelledby="storefront-practice-title">
            <p className="storefront-path__label" lang="en">PRACTICE</p>
            <h2 className="storefront-path__title" id="storefront-practice-title">
              {strings.storefront.practiceTitle}
            </h2>
            <p className="storefront-path__description">{strings.storefront.practiceLead}</p>
            <a
              className="storefront-path__link"
              href={careerGameHomeHref(careerGameOriginValue)}
              onClick={onCareerGameLink}
              onAuxClick={onCareerGameLink}
            >
              {strings.storefront.playCase}
              <span aria-hidden="true">→</span>
            </a>
          </article>
        </li>
        <li>
          <article className="storefront-path" aria-labelledby="storefront-continue-title">
            <p className="storefront-path__label" lang="en">CONTINUE</p>
            <h2 className="storefront-path__title" id="storefront-continue-title">
              {strings.library.continueReading}
            </h2>
            <p className="storefront-path__description">{strings.library.allOwned}</p>
            <Link className="storefront-path__link" to="/library">
              {strings.library.continueReading}
              <span aria-hidden="true">→</span>
            </Link>
          </article>
        </li>
      </ul>
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
    <article className="featured-book featured-book--hero" aria-labelledby={`featured-${book.id}`}>
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

function PublicProfiles() {
  return (
    <div className="page" id="profiles">
      <PublicProfileBlock id="founder-profile" profile={FOUNDER_PROFILE} />
      <PublicProfileBlock id="cofounder-profile" profile={COFOUNDER_PROFILE} />
    </div>
  )
}

function PublicProfileBlock({ id, profile }: { id: string; profile: PublicProfile }) {
  return (
    <article className="page" aria-labelledby={id} lang={profile.language}>
      <h2 className="section-title" id={id}>
        {profile.heading}
      </h2>
      <ul className="page">
        {profile.credentials.map((credential) => (
          <li key={credential}>{credential}</li>
        ))}
      </ul>
      {profile.languages && (
        <p>
          <strong lang="en">Languages</strong>
          <br />
          {profile.languages.map((language, index) => (
            <span key={language.label}>
              {index > 0 && <span aria-hidden="true">｜</span>}
              <span lang={language.language}>{language.label}</span>
            </span>
          ))}
        </p>
      )}
    </article>
  )
}
