import { Link } from 'react-router-dom'
import { useStrings } from '../i18n/strings'

export type LearningUnitAccessStatus = 'checking' | 'signed-out' | 'denied' | 'failed'

interface LearningUnitAccessStateProps {
  status: LearningUnitAccessStatus
  bookSlug: string
}

export function LearningUnitAccessState({ status, bookSlug }: LearningUnitAccessStateProps) {
  const strings = useStrings()
  const title = status === 'checking'
    ? strings.learningUnitAccess.checking
    : status === 'failed'
      ? strings.learningUnitAccess.failed
      : status === 'signed-out'
        ? strings.learningUnitAccess.signedOut
        : strings.learningUnitAccess.denied

  return (
    <section
      className="learning-unit-access-state"
      aria-labelledby="learning-unit-access-title"
      role={status === 'checking' ? 'status' : 'region'}
    >
      <h2 id="learning-unit-access-title">{title}</h2>
      {status !== 'checking' && (
        <Link className="btn btn--secondary" to={`/books/${bookSlug}`}>
          {strings.learningUnitAccess.viewBook}
        </Link>
      )}
    </section>
  )
}
