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
import {
  listEditorialFeatures,
  listEditorialSelections,
  listHomeContentSamples,
  type EditorialFeature,
  type EditorialMedia,
  type EditorialSelection,
  type HomeContentSample,
} from './homeEditorial'

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
  const paidOffer = entries.find(
    ({ book }) => tierOf(book) === 'paid' && book.price?.tier === 'paid',
  )
  const rest = entries.slice(1)
  const editorialFeatures = listEditorialFeatures(entries)
  const contentSamples = listHomeContentSamples(entries)
  const editorialSelections = listEditorialSelections(entries)
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

      <EditorialFeatures features={editorialFeatures} />
      <EditorialSamples samples={contentSamples} />
      <EditorialSelections selections={editorialSelections} />

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
      {paidOffer && <StorefrontOffer entry={paidOffer} />}
    </section>
  )
}

function EditorialFeatures({ features }: { features: EditorialFeature[] }) {
  const strings = useStrings()
  if (features.length === 0) return null

  return (
    <section className="storefront-features" aria-labelledby="storefront-features-title">
      <div className="storefront-section-heading">
        <p className="storefront-section-heading__label">{strings.home.featureLabel}</p>
        <h2 id="storefront-features-title">{strings.home.featureTitle}</h2>
      </div>
      <ol className="storefront-features__list">
        {features.map((feature, index) => (
          <li className="storefront-feature" key={`${feature.label}-${feature.title}`}>
            <span className="storefront-feature__number" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            <div className="storefront-feature__copy">
              <p className="storefront-feature__label" lang="en">
                {feature.label}
              </p>
              <h3 lang={feature.titleLanguage}>
                {feature.title}
              </h3>
              <p lang={feature.bodyLanguage}>{feature.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function EditorialSamples({ samples }: { samples: HomeContentSample[] }) {
  const strings = useStrings()
  if (samples.length === 0) return null

  return (
    <section className="storefront-samples" aria-labelledby="storefront-samples-title">
      <div className="storefront-section-heading">
        <p className="storefront-section-heading__label">{strings.home.samplesLabel}</p>
        <h2 id="storefront-samples-title">{strings.home.samplesTitle}</h2>
      </div>
      <div
        className="storefront-samples__viewport"
        role="region"
        aria-label={strings.home.samplesTitle}
      >
        <ul className="storefront-samples__list">
          {samples.map((sample, index) => (
            <li className="storefront-samples__item" key={sample.id}>
              <article className="storefront-sample" aria-labelledby={`sample-title-${index}`}>
                <p className="storefront-sample__source" lang={sample.book.language}>
                  {sample.sourceLabel}
                </p>
                <p className="storefront-sample__kind" lang="en">
                  {sample.kind}
                </p>
                <h3
                  className="storefront-sample__expression"
                  id={`sample-title-${index}`}
                  lang={sample.expressionLanguage}
                >
                  {sample.expression}
                </h3>
                <div className="storefront-sample__tier">
                  <p className="storefront-sample__tier-label" lang="en">MEANING</p>
                  <p lang={sample.meaningLanguage}>{sample.meaning}</p>
                </div>
                {sample.supporting && (
                  <div className="storefront-sample__tier">
                    <p className="storefront-sample__tier-label" lang="en">NOTE</p>
                    <p lang={sample.supportingLanguage}>{sample.supporting}</p>
                  </div>
                )}
                <Link
                  className="storefront-sample__link"
                  to={`/books/${sample.book.slug}`}
                >
                  {strings.storefront.viewDetails}
                  <span aria-hidden="true">→</span>
                </Link>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function EditorialSelections({ selections }: { selections: EditorialSelection[] }) {
  const strings = useStrings()
  if (selections.length === 0) return null

  return (
    <section className="storefront-selections" aria-labelledby="storefront-selections-title">
      <div className="storefront-section-heading">
        <p className="storefront-section-heading__label">{strings.home.selectionsLabel}</p>
        <h2 id="storefront-selections-title">{strings.home.selectionsTitle}</h2>
      </div>
      <div className="storefront-selections__list">
        {selections.map((selection) => (
          <article className="storefront-selection" key={selection.id}>
            <div className="storefront-selection__content">
              <p className="storefront-selection__source" lang={selection.book.language}>
                {selection.sourceLabel}
              </p>
              <h3>
                <Link lang={selection.book.language} to={`/books/${selection.book.slug}`}>
                  {selection.title}
                </Link>
              </h3>
              <p className="storefront-selection__body" lang={selection.book.language}>
                {selection.body}
              </p>
              <Link
                className="storefront-selection__link"
                to={`/books/${selection.book.slug}`}
              >
                {strings.storefront.viewDetails}
                <span aria-hidden="true">→</span>
              </Link>
            </div>
            <div className="storefront-selection__media">
              <EditorialMedia media={selection.media} language={selection.book.language} />
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function EditorialMedia({ media, language }: { media: EditorialMedia; language: string }) {
  if (media.kind === 'cover') {
    return <BookCover book={media.book} className="storefront-selection__cover" />
  }

  return (
    <figure className="storefront-selection__figure">
      <img
        src={media.image.src}
        alt={media.image.alt}
        width={media.image.width}
        height={media.image.height}
        loading="lazy"
      />
      {(media.image.caption || media.image.credit) && (
        <figcaption lang={language}>
          {media.image.caption && <span>{media.image.caption}</span>}
          {media.image.caption && media.image.credit && (
            <span aria-hidden="true"> — </span>
          )}
          {media.image.credit && <span>{media.image.credit}</span>}
        </figcaption>
      )}
    </figure>
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
        <BookCover book={book} loading="eager" fetchPriority="high" />
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

/** A single, catalog-driven closing offer for the current paid Book. */
function StorefrontOffer({ entry }: { entry: CatalogEntry }) {
  const strings = useStrings()
  const { book, previewBoundary } = entry
  const { owned, readingState, loading } = useBookState(book.id)
  const cta = bookCtaState(book, owned, readingState, previewBoundary)
  const resume = readingState ? resumeHref(book, readingState.chapterId) : undefined
  const tier = tierOf(book)

  return (
    <section className="storefront-offer" aria-labelledby={`offer-${book.id}`}>
      <div className="storefront-section-heading">
        <p className="storefront-section-heading__label" lang="en">BOOK</p>
        <h2 id={`offer-${book.id}`}>{book.title}</h2>
      </div>
      <div className="storefront-offer__body">
        <div className="storefront-offer__copy">
          {book.description && <p className="storefront-offer__description">{book.description}</p>}
          <p className="storefront-offer__author">
            {book.authors.map((author) => author.name).join(' / ')}
          </p>
          <p className="storefront-offer__price">
            <Price book={book} />
          </p>
          <BookActions
            book={book}
            cta={cta}
            resumeHref={resume}
            loading={loading && tier === 'paid'}
            className="storefront-offer__actions"
          />
          <Link className="storefront-offer__details" to={`/books/${book.slug}`}>
            {strings.storefront.viewDetails}
          </Link>
        </div>
        <Link
          className="storefront-offer__cover"
          to={`/books/${book.slug}`}
          aria-label={book.title}
          tabIndex={-1}
        >
          <BookCover book={book} />
        </Link>
      </div>
    </section>
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
