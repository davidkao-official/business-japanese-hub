import { useStrings, getActiveLocale } from '../i18n/strings'
import { Fragment, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useBookState } from '../lib/persistence/useBookState'
import { NotFoundPage } from './NotFoundPage'
import {
  getLearningUnitByPracticeSlug,
  type LearningTextBlock,
} from './learningUnits'

/**
 * A generic Practice destination for the admitted exercise family.
 * Responses and reveals are intentionally local to this render; persistence,
 * scoring, and attempt history remain outside this bounded issue.
 */
export function PracticeActivityPage() {
  const ui = useStrings().learningUi

  const { slug } = useParams()
  const learningUnit = getLearningUnitByPracticeSlug(slug)
  const strings = useStrings()
  const { owned, loading, error } = useBookState(learningUnit?.bookId ?? '')
  const [responses, setResponses] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({})
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  useDocumentTitle(learningUnit ? `${learningUnit.courseLabel} — ${ui.practiceLabel}` : strings.notFound.title)

  if (!learningUnit) return <NotFoundPage />

  const canRenderBody = owned && !loading && !error

  return (
    <section className="page practice-activity-page" lang={getActiveLocale()} aria-labelledby="practice-activity-title">
      <div className="practice-activity-page__intro">
        <p className="product-mode-page__eyebrow" lang={getActiveLocale()}>
          {ui.practicePrefix} <span lang="en">{learningUnit.courseLabel}</span>
        </p>
        <h1 className="page__title" id="practice-activity-title">
          <span lang="ja">{learningUnit.title}</span> · {ui.practiceLabel}
        </h1>
        <p className="practice-activity-page__activity-label">
          {ui.practiceSituation}
        </p>
        {canRenderBody && <p className="page__lead">{renderLearningText(learningUnit.practice.lead)}</p>}
      </div>

      {canRenderBody && <div className="practice-activity-grid">
        {learningUnit.practice.exercises.map((exercise, index) => {
          const response = responses[exercise.id] ?? ''
          const isRevealed = revealed[exercise.id] === true
          const titleId = `practice-exercise-title-${index}`
          const questionId = `practice-exercise-question-${exercise.id}`

          return (
            <section
              className="practice-activity-card"
              aria-labelledby={titleId}
              key={exercise.id}
            >
              <h2 id={titleId} lang={getActiveLocale()}>
                {ui.practiceExerciseLabel}{String(index + 1).padStart(2, '0')}
              </h2>
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  setSubmitted((current) => ({ ...current, [exercise.id]: true }))
                  setRevealed((current) => ({ ...current, [exercise.id]: false }))
                }}
              >
                <p className="practice-activity-card__question" id={questionId}>
                  {renderLearningText(exercise.question)}
                </p>
                {exercise.options.length > 0 ? (
                  <fieldset
                    aria-labelledby={questionId}
                    className="practice-activity-card__choices"
                  >
                    {exercise.options.map((option, optionIndex) => {
                      const value = String(optionIndex)
                      return (
                        <label key={value}>
                          <input
                            type="radio"
                            name={`practice-${exercise.id}`}
                            value={value}
                            checked={response === value}
                            onChange={(event) => {
                              const nextResponse = event.currentTarget.value
                              setResponses((current) => ({
                                ...current,
                                [exercise.id]: nextResponse,
                              }))
                              setSubmitted((current) => ({ ...current, [exercise.id]: false }))
                              setRevealed((current) => ({ ...current, [exercise.id]: false }))
                            }}
                          />{' '}
                          {renderLearningText(option)}
                        </label>
                      )
                    })}
                  </fieldset>
                ) : (
                  <label className="practice-activity-card__response">
                    <span lang={getActiveLocale()}>{ui.practiceResponseLabel}</span>
                    <textarea
                      rows={4}
                      value={response}
                      onChange={(event) => {
                        const nextResponse = event.currentTarget.value
                        setResponses((current) => ({
                          ...current,
                          [exercise.id]: nextResponse,
                        }))
                        setSubmitted((current) => ({ ...current, [exercise.id]: false }))
                        setRevealed((current) => ({ ...current, [exercise.id]: false }))
                      }}
                    />
                  </label>
                )}
                {exercise.hint && (
                  <details>
                    <summary lang={getActiveLocale()}>{ui.practiceHintLabel}</summary>
                    <p>{renderLearningText(exercise.hint)}</p>
                  </details>
                )}
                <button className="btn btn--secondary" type="submit" disabled={!response.trim()}>
                  <span lang={getActiveLocale()}>{ui.practiceSubmit}</span>
                </button>
                {submitted[exercise.id] && !isRevealed && (
                  <button
                    className="btn btn--secondary"
                    type="button"
                    onClick={() => setRevealed((current) => ({ ...current, [exercise.id]: true }))}
                  >
                    <span lang={getActiveLocale()}>{ui.practiceRevealAnswer}</span>
                  </button>
                )}
                {isRevealed && (exercise.answer || exercise.explanation) && (
                  <div className="practice-activity-card__feedback" aria-live="polite">
                    {exercise.answer && (
                      <p>
                        <strong lang={getActiveLocale()}>{ui.practiceAnswerLabel}</strong>
                        {renderLearningText(exercise.answer)}
                      </p>
                    )}
                    {exercise.explanation && (
                      <p>
                        <strong lang={getActiveLocale()}>{ui.practiceFeedbackLabel}</strong>
                        {renderLearningText(exercise.explanation)}
                      </p>
                    )}
                  </div>
                )}
              </form>
            </section>
          )
        })}
      </div>}

      {canRenderBody && <div className="practice-activity-page__actions">
        <Link className="btn btn--secondary" to={`/learn/${learningUnit.learnSlug}`}>
          {ui.practiceBack}
        </Link>
      </div>}
    </section>
  )
}

function renderLearningText(segments: LearningTextBlock) {
  return segments.flatMap((segment, index) => {
    const lines = segment.text.split('\n')
    return lines.map((line, lineIndex) => (
      <Fragment key={`${segment.lang}-${index}-${lineIndex}`}>
        <span lang={segment.lang}>{line}</span>
        {lineIndex < lines.length - 1 ? <br /> : null}
      </Fragment>
    ))
  })
}
