import { Link, useParams } from 'react-router-dom'
import { useStrings } from '../i18n/strings'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { NotFoundPage } from './NotFoundPage'
import {
  getLearningUnitByPracticeSlug,
  type LearningTextBlock,
} from './learningUnits'

/**
 * A generic Practice destination for the course-correction activity family.
 * This is a presentation surface only; persistence and attempt semantics
 * remain outside this bounded issue.
 */
export function PracticeActivityPage() {
  const { slug } = useParams()
  const learningUnit = getLearningUnitByPracticeSlug(slug)
  const strings = useStrings()
  useDocumentTitle(learningUnit ? `${learningUnit.courseLabel} Practice` : strings.notFound.title)

  if (!learningUnit) return <NotFoundPage />

  return (
    <section className="page practice-activity-page" lang="zh-TW" aria-labelledby="practice-activity-title">
      <div className="practice-activity-page__intro">
        <p className="product-mode-page__eyebrow" lang="en">
          Practice · {learningUnit.courseLabel}
        </p>
        <h1 className="page__title" id="practice-activity-title">
          {renderLearningText(learningUnit.practice.title)}
        </h1>
        <p className="page__lead">{renderLearningText(learningUnit.practice.lead)}</p>
      </div>

      <div className="practice-activity-grid">
        {learningUnit.practice.cards.map((card, index) => (
          <section
            className="practice-activity-card"
            aria-labelledby={`practice-card-title-${index}`}
            key={card.label.text}
          >
            <p className="practice-activity-card__label">
              {renderLearningText([card.label])}
            </p>
            <h2 id={`practice-card-title-${index}`}>
              {renderLearningText(card.title)}
            </h2>
            <p>{renderLearningText(card.body)}</p>
          </section>
        ))}
      </div>

      <div className="practice-activity-page__actions">
        <Link className="btn btn--secondary" to={`/learn/${learningUnit.learnSlug}`}>
          {renderLearningText(learningUnit.practice.backAction)}
        </Link>
      </div>
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
