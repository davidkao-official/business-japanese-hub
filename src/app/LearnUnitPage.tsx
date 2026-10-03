import { useStrings, getActiveLocale } from '../i18n/strings'
import { Link, useParams } from 'react-router-dom'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useBookState } from '../lib/persistence/useBookState'
import { NotFoundPage } from './NotFoundPage'
import {
  getLearningUnitByLearnSlug,
  type LearningTextBlock,
} from './learningUnits'

/**
 * The first reusable Learn presentation surface. Its route is deliberately
 * slug-based so future units can use the same bounded page seam without
 * coupling Learn to the Book / Reader content model.
 */
export function LearnUnitPage() {
  const ui = useStrings().learningUi

  const { slug } = useParams()
  const learningUnit = getLearningUnitByLearnSlug(slug)
  const strings = useStrings()
  const { owned, loading, error } = useBookState(learningUnit?.bookId ?? '')
  useDocumentTitle(learningUnit ? `${learningUnit.title} — ${ui.learnLabel}` : strings.notFound.title)

  if (!learningUnit) return <NotFoundPage />

  const canRenderBody = owned && !loading && !error

  return (
    <section className="page learning-unit-page" lang={getActiveLocale()} aria-labelledby="learning-unit-title">
      <div className="learning-unit-page__intro">
        <p className="product-mode-page__eyebrow" lang={getActiveLocale()}>
          {ui.learnLabel} · <span lang="en">{learningUnit.courseLabel}</span>
        </p>
        <h1 className="page__title" id="learning-unit-title" lang="ja">
          {learningUnit.title}
        </h1>
        {canRenderBody && <p className="page__lead">{renderLearningText(learningUnit.learn.lead)}</p>}
      </div>

      {canRenderBody && (
        <>
          <p className="learning-unit-page__sequence">
            <span aria-hidden="true">{renderLearningText(learningUnit.learn.sequence)}</span>
            <span className="visually-hidden">
              {renderLearningText(learningUnit.learn.sequence)}
            </span>
          </p>

          <ol className="learning-unit-flow" aria-label={ui.learnStepsLabel}>
            {learningUnit.learn.steps.map((step) => (
              <li key={step.number}>
                <span className="learning-unit-flow__number" aria-hidden="true">{step.number}</span>
                <div>
                  <h2>{renderLearningText(step.title)}</h2>
                  <p>{renderLearningText(step.body)}</p>
                </div>
              </li>
            ))}
          </ol>

          <section className="learning-unit-page__note" aria-labelledby="learning-unit-note-title">
            <p className="learning-unit-page__label">
              {ui.learnTransfer}
            </p>
            <h2 id="learning-unit-note-title">
              {renderLearningText([learningUnit.learn.transfer.title])}
            </h2>
            <p>{renderLearningText(learningUnit.learn.transfer.body)}</p>
          </section>

          <div className="learning-unit-page__actions">
            <Link className="btn btn--primary" to={`/practice/${learningUnit.practiceSlug}`}>
              {ui.learnAction}
            </Link>
            <Link className="btn btn--secondary" to="/learn">
              {ui.learnBack}
            </Link>
          </div>
        </>
      )}
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
