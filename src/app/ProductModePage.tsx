import { useRef, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  createBrowserValidationAnalytics,
  createCrossProductMovementDeduper,
  type ValidationAnalytics,
} from '@business-japanese-hub/validation-analytics'
import { useStrings } from '../i18n/strings'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { careerGameHomeHref } from '../lib/cross-product/careerGame'
import { BookCover } from '../components/BookCover'
import { listCatalogEntries } from '../reader/catalog'
import { PRODUCT_MODE_BY_ID, PRODUCT_MODES, type ProductModeId } from './productModes'
import {
  COURSE_CORRECTION_LEARN_SLUG,
  getLearningUnitByLearnSlug,
  type LearningTextBlock,
} from './learningUnits'

const browserValidationAnalytics = createBrowserValidationAnalytics({
  functionsBaseUrl: import.meta.env.VITE_EDGE_FUNCTIONS_BASE_URL,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
})

export interface ProductModePageProps {
  mode: ProductModeId
  analytics?: ValidationAnalytics
}

export function ProductModePage({ mode, analytics = browserValidationAnalytics }: ProductModePageProps) {
  const content = PRODUCT_MODE_BY_ID[mode]
  const strings = useStrings()
  const modeStrings = strings.learningModes.modes[mode]
  const careerGameMovementDeduper = useRef(createCrossProductMovementDeduper())
  useDocumentTitle(`${modeStrings.title} — ${strings.app.name}`)

  function trackCareerGameLink(event: MouseEvent<HTMLAnchorElement>): void {
    const isAuxiliaryClick = event.type === 'auxclick'
    if (isAuxiliaryClick ? event.button !== 1 : event.button !== 0) return
    const keepsPageMounted =
      isAuxiliaryClick || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
    if (!careerGameMovementDeduper.current.shouldTrack(keepsPageMounted, event.currentTarget.href)) {
      return
    }
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
    <section className="page product-mode-page" aria-labelledby={`${content.id}-title`}>
      <div className="product-mode-page__intro">
        <p className="product-mode-page__eyebrow" lang="en">
          {content.label}
        </p>
        <h1 className="page__title" id={`${content.id}-title`}>
          <span lang="en">{modeStrings.title}</span>
        </h1>
        <p className="page__lead">{modeStrings.lead}</p>
      </div>

      {mode === 'read' ? <ReadModeLinks /> : null}
      {mode === 'learn' ? <LearnModeLinks /> : null}
      {mode === 'experience' ? <ExperienceModeLink onNavigate={trackCareerGameLink} /> : null}

      <nav className="product-mode-page__next" aria-label={strings.learningModes.navigationLabel}>
        <h2>{strings.learningModes.continueTitle}</h2>
        <ul>
          {PRODUCT_MODES.filter((candidate) => candidate.id !== mode).map((candidate) => (
            <li key={candidate.id}>
              <Link to={candidate.href}>
                <span lang="en">{candidate.label}</span>
                <span>{strings.learningModes.modes[candidate.id].summary}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  )
}

function LearnModeLinks() {
  const learningUnit = getLearningUnitByLearnSlug(COURSE_CORRECTION_LEARN_SLUG)
  if (!learningUnit) return null

  return (
    <section
      className="product-mode-page__capability learn-module-list"
      lang="zh-TW"
      aria-labelledby="learn-module-title"
    >
      <div>
        <p className="product-mode-page__eyebrow" lang="en">
          {learningUnit.courseLabel}
        </p>
        <h2 id="learn-module-title">{renderLearningText([learningUnit.gateway.title])}</h2>
        <p>{renderLearningText(learningUnit.gateway.summary)}</p>
      </div>
      <Link className="learning-module-link" to={`/learn/${COURSE_CORRECTION_LEARN_SLUG}`}>
        <span lang="ja">{learningUnit.title}</span>
        <span lang="en">{learningUnit.courseLabel}</span>
        <span>{renderLearningText(learningUnit.gateway.linkSummary)}</span>
      </Link>
    </section>
  )
}

function renderLearningText(segments: LearningTextBlock) {
  return segments.map((segment, index) => (
    <span key={`${segment.lang}-${index}`} lang={segment.lang}>
      {segment.text}
    </span>
  ))
}

function ReadModeLinks() {
  const strings = useStrings()
  const entries = listCatalogEntries()

  return (
    <section className="product-mode-page__capability" aria-labelledby="read-capability-title">
      <h2 id="read-capability-title">{strings.learningModes.read.capabilityTitle}</h2>
      <p>{strings.learningModes.read.capabilityLead}</p>
      <div className="product-mode-page__actions">
        <Link className="btn btn--primary" to="/library">
          {strings.learningModes.read.browseLibrary}
        </Link>
      </div>
      <ul className="book-card-grid">
        {entries.map(({ book }) => (
          <li className="book-card" key={book.id}>
            <Link className="book-card__link" to={`/books/${book.slug}`}>
              <BookCover book={book} className="book-card__cover" />
              <span className="book-card__title">{book.title}</span>
              {book.subtitle && <span className="book-card__subtitle">{book.subtitle}</span>}
              {book.authors.length > 0 && (
                <span className="book-card__author">{book.authors.map((author) => author.name).join(' / ')}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ExperienceModeLink({ onNavigate }: { onNavigate: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  const strings = useStrings()

  return (
    <section className="product-mode-page__capability" aria-labelledby="experience-capability-title">
      <h2 id="experience-capability-title">{strings.learningModes.experience.capabilityTitle}</h2>
      <p>{strings.learningModes.experience.capabilityLead}</p>
      <a
        className="btn btn--primary"
        href={careerGameHomeHref(import.meta.env.VITE_CAREER_GAME_ORIGIN)}
        onClick={onNavigate}
        onAuxClick={onNavigate}
      >
        {strings.learningModes.experience.openCareerGame}
      </a>
    </section>
  )
}
