import { Link, useParams } from 'react-router-dom'
import { useStrings } from '../i18n/strings'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useBookState } from '../lib/persistence/useBookState'
import { useUserState } from '../lib/persistence/UserStateContext'
import { NotFoundPage } from './NotFoundPage'
import { LearningUnitAccessState, type LearningUnitAccessStatus } from './LearningUnitAccessState'
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
  const { slug } = useParams()
  const learningUnit = getLearningUnitByLearnSlug(slug)
  const strings = useStrings()
  const { owned, loading, error } = useBookState(learningUnit?.bookId ?? '')
  const { user } = useUserState()
  useDocumentTitle(learningUnit ? `${learningUnit.title} — Learn` : strings.notFound.title)

  if (!learningUnit) return <NotFoundPage />

  const canRenderBody = owned && !loading && !error
  const accessStatus: LearningUnitAccessStatus = loading
    ? 'checking'
    : error
      ? 'failed'
      : user
        ? 'denied'
        : 'signed-out'

  return (
    <section className="page learning-unit-page" lang="zh-TW" aria-labelledby="learning-unit-title">
      <div className="learning-unit-page__intro">
        <p className="product-mode-page__eyebrow" lang="en">
          {learningUnit.courseLabel} · Learn
        </p>
        <h1 className="page__title" id="learning-unit-title" lang="ja">
          {learningUnit.title}
        </h1>
        {canRenderBody && <p className="page__lead">{renderLearningText(learningUnit.learn.lead)}</p>}
      </div>

      {!canRenderBody && (
        <LearningUnitAccessState status={accessStatus} bookSlug={learningUnit.bookSlug} />
      )}

      {canRenderBody && (
        <>
          <p className="learning-unit-page__sequence">
            <span aria-hidden="true">{learningUnit.learn.sequence.map((segment) => segment.text).join('')}</span>
            <span className="visually-hidden">
              {renderLearningText(learningUnit.learn.sequence)}
            </span>
          </p>

          <ol className="learning-unit-flow" aria-label="Learn unit steps" lang="en">
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
              {renderLearningText([learningUnit.learn.transfer.label])}
            </p>
            <h2 id="learning-unit-note-title">
              {renderLearningText([learningUnit.learn.transfer.title])}
            </h2>
            <p>{renderLearningText(learningUnit.learn.transfer.body)}</p>
          </section>

          <div className="learning-unit-page__actions">
            <Link className="btn btn--primary" to={`/practice/${learningUnit.practiceSlug}`}>
              {renderLearningText(learningUnit.learn.practiceAction)}
            </Link>
            <Link className="btn btn--secondary" to="/learn">
              {renderLearningText(learningUnit.learn.backAction)}
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
