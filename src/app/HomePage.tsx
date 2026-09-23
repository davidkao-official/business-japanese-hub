import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { listCatalogEntries } from '../reader/catalog'
import { useLocale, useStrings, type Locale } from '../i18n/strings'
import { BookCover } from '../components/BookCover'
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
import { PRODUCT_MODES } from './productModes'

const JAPANESE_HOME_HEADING_PHRASES = {
  title: ['ビジネス', '日本語', 'ハブ'],
  serviceTitle: ['次に役立つ', '学び方を選ぶ'],
  featureTitle: ['実務で使う', '言葉を、', '文脈の中で', '読む'],
  samplesTitle: ['実際の', '文章と', '会話から', '学ぶ'],
  selectionsTitle: ['公開中の', '書籍から、', '読む場所を', '選ぶ'],
} as const

function renderHomeHeading(
  text: string,
  locale: Locale,
  phrases: readonly string[],
) {
  if (locale !== 'ja' || phrases.join('') !== text) return text
  return phrases.map((phrase, index) => (
    <span className="phrase" key={`${index}-${phrase}`}>
      {phrase}
    </span>
  ))
}

/**
 * Public learning-service home. The five modes are the primary product entry
 * points; editorial samples remain a real, content-driven Read projection.
 */
export function HomePage() {
  const strings = useStrings()
  const entries = listCatalogEntries()
  const editorialFeatures = listEditorialFeatures(entries)
  const contentSamples = listHomeContentSamples(entries)
  const editorialSelections = listEditorialSelections(entries)
  useDocumentTitle(strings.home.title)

  return (
    <section
      className="page storefront-page learning-service-home concept-c-home"
      aria-labelledby="home-title"
    >
      <ConceptHero />
      <LearningPillars />
      <HomeValue />

      <LearningModes />

      <EditorialFeatures features={editorialFeatures} />
      <EditorialSamples samples={contentSamples} />
      <EditorialSelections selections={editorialSelections} />

      <PublicProfiles />
    </section>
  )
}

function ConceptHero() {
  const locale = useLocale()
  const strings = useStrings()
  const { concept } = strings.home
  const headline = [
    concept.headline.opening,
    concept.headline.examJapanese,
    concept.headline.afterExam,
    concept.headline.beforeWorkplace,
    ...concept.headline.workplaceJapanese,
    concept.headline.ending,
  ].join('')

  return (
    <header className="concept-home-hero">
      <div className="concept-home-hero__copy">
        <p className="concept-home-hero__badge">{concept.badge}</p>
        <h1 className="concept-home-hero__title" id="home-title" lang={locale} aria-label={headline}>
          <span className="phrase">
            {concept.headline.opening}{concept.headline.examJapanese}{concept.headline.afterExam}
          </span>
          <span className="phrase">{concept.headline.beforeWorkplace}</span>
          {concept.headline.workplaceJapanese.map((phrase, index) => (
            <span className="phrase" key={`${index}-${phrase}`}>
              <span className="concept-home-hero__accent">{phrase}</span>
              {index === concept.headline.workplaceJapanese.length - 1 ? concept.headline.ending : null}
            </span>
          ))}
        </h1>
        <p className="concept-home-hero__support">{concept.support}</p>
        <div className="concept-home-hero__actions">
          <Link className="concept-home-hero__action concept-home-hero__action--primary" to="/learn">
            {concept.startLearning}<span aria-hidden="true">↗</span>
          </Link>
          <Link className="concept-home-hero__action concept-home-hero__action--secondary" to="/about">
            {concept.aboutPlatform}
          </Link>
        </div>
      </div>
      <div className="concept-home-hero__visual">
        <div className="concept-home-visual__header" aria-hidden="true">
          <span className="concept-home-visual__mark" aria-hidden="true">文</span>
          <span className="concept-home-visual__label">{concept.visualLabel}</span>
          <span className="concept-home-visual__rule" aria-hidden="true" />
        </div>
        <div className="concept-home-visual__paper" aria-hidden="true">
          <span className="concept-home-visual__paper-kicker">BUSINESS / CONTEXT / LANGUAGE</span>
          <span className="concept-home-visual__paper-title">{concept.visualTitle}</span>
          <span className="concept-home-visual__paper-rule" />
          <span className="concept-home-visual__paper-copy">{concept.visualBody}</span>
          <span className="concept-home-visual__paper-annotation">01 — 04</span>
        </div>
        <LearningJourney />
      </div>
    </header>
  )
}

function LearningJourney() {
  const { concept } = useStrings().home

  return (
    <section className="concept-journey" aria-labelledby="concept-journey-title">
      <h2 className="concept-journey__title" id="concept-journey-title">{concept.journeyTitle}</h2>
      <ol className="concept-journey__steps">
        {concept.journeySteps.map((step, index) => (
          <li className="concept-journey__step" key={step.title}>
            <span className="concept-journey__number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <span className="concept-journey__copy">
              <span className="concept-journey__step-title">{step.title}</span>
              <span className="concept-journey__detail">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function LearningPillars() {
  const { concept } = useStrings().home

  return (
    <section className="concept-pillars" aria-labelledby="concept-pillars-title">
      <h2 className="concept-pillars__title" id="concept-pillars-title">{concept.pillarsTitle}</h2>
      <ul className="concept-pillars__list">
        {concept.pillars.map((pillar, index) => (
          <li className={`concept-pillar concept-pillar--${index + 1}`} key={pillar.title}>
            <span className="concept-pillar__index" aria-hidden="true">0{index + 1}</span>
            <h3>{pillar.title}</h3>
            <p>{pillar.body}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function HomeValue() {
  const { concept } = useStrings().home

  return (
    <section className="concept-home-value" aria-labelledby="concept-home-value-title">
      <h2 id="concept-home-value-title">{concept.valueTitle}</h2>
      <p>{concept.valueBody}</p>
    </section>
  )
}

function LearningModes() {
  const locale = useLocale()
  const strings = useStrings()

  return (
    <section className="learning-modes" aria-labelledby="learning-modes-title">
      <div className="learning-modes__intro">
        <p className="learning-modes__label">{strings.learningModes.serviceLabel}</p>
        <h2 className="learning-modes__title" id="learning-modes-title" aria-label={strings.learningModes.serviceTitle}>
          {renderHomeHeading(strings.learningModes.serviceTitle, locale, JAPANESE_HOME_HEADING_PHRASES.serviceTitle)}
        </h2>
      </div>
      <ul className="learning-modes__list">
        {PRODUCT_MODES.map((mode) => (
          <li className="learning-modes__item" key={mode.id}>
            <Link className="learning-modes__link" to={mode.href}>
              <span className="learning-modes__link-label" lang="en">
                {mode.label}
              </span>
              <span className="learning-modes__link-summary">
                {strings.learningModes.modes[mode.id].summary}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function EditorialFeatures({ features }: { features: EditorialFeature[] }) {
  const locale = useLocale()
  const strings = useStrings()
  if (features.length === 0) return null

  return (
    <section className="storefront-features" aria-labelledby="storefront-features-title">
      <div className="storefront-section-heading">
        <p className="storefront-section-heading__label">{strings.home.featureLabel}</p>
        <h2 id="storefront-features-title" aria-label={strings.home.featureTitle}>
          {renderHomeHeading(strings.home.featureTitle, locale, JAPANESE_HOME_HEADING_PHRASES.featureTitle)}
        </h2>
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
  const locale = useLocale()
  const strings = useStrings()
  if (samples.length === 0) return null

  return (
    <section className="storefront-samples" aria-labelledby="storefront-samples-title">
      <div className="storefront-section-heading">
        <p className="storefront-section-heading__label">{strings.home.samplesLabel}</p>
        <h2 id="storefront-samples-title" aria-label={strings.home.samplesTitle}>
          {renderHomeHeading(strings.home.samplesTitle, locale, JAPANESE_HOME_HEADING_PHRASES.samplesTitle)}
        </h2>
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
  const locale = useLocale()
  const strings = useStrings()
  if (selections.length === 0) return null

  return (
    <section className="storefront-selections" aria-labelledby="storefront-selections-title">
      <div className="storefront-section-heading">
        <p className="storefront-section-heading__label">{strings.home.selectionsLabel}</p>
        <h2 id="storefront-selections-title" aria-label={strings.home.selectionsTitle}>
          {renderHomeHeading(strings.home.selectionsTitle, locale, JAPANESE_HOME_HEADING_PHRASES.selectionsTitle)}
        </h2>
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
        <p className="public-profile__languages">
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
