import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@business-japanese-hub/platform-auth'
import { useStrings } from '../i18n/strings'
import { fetchPracticeLearningSnapshot, type PracticeLearningFetchResult } from '../lib/learning/practiceMyLearningClient'

export function WebTestReviewEntry() {
  const ui = useStrings().learningUi
  const { user, loading, getAccessToken } = useAuth()

  return (
    <section className="web-test-hub__review" aria-labelledby="web-test-review-title">
      <h2 id="web-test-review-title">{ui.webReviewTitle}</h2>
      {loading ? <p role="status">{ui.webReviewLoading}</p>
        : user ? <SavedReviewEntry key={user.id} ownerId={user.id} getAccessToken={getAccessToken} />
          : <ReviewSignIn />}
    </section>
  )
}

function ReviewSignIn() {
  const ui = useStrings().learningUi
  return <><p>{ui.webReviewSignInBody}</p><Link to="/my-learning">{ui.webReviewSignInAction}</Link></>
}

function SavedReviewEntry({ ownerId, getAccessToken }: {
  ownerId: string
  getAccessToken: () => Promise<string | null>
}) {
  const ui = useStrings().learningUi
  const [result, setResult] = useState<PracticeLearningFetchResult | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchPracticeLearningSnapshot(getAccessToken, ownerId).then((next) => {
      if (!cancelled) setResult(next)
    })
    return () => { cancelled = true }
  }, [getAccessToken, ownerId])

  if (!result) return <p role="status">{ui.webReviewLoading}</p>
  if (result.kind === 'signed-out') return <ReviewSignIn />
  if (result.kind !== 'ok') return <><p role="status">{ui.webReviewUnavailable}</p><Link to="/my-learning">{ui.webSampleOpenMyLearning}</Link></>

  const count = result.snapshot.actionableMistakes.length
  if (count === 0) return <p>{ui.webReviewEmpty}</p>

  // This is the existing server-scoped queue, capped at 50; it is not a due-date or mastery estimate.
  return <><p role="status">{ui.webReviewCount(count)}</p><p>{ui.webReviewLimit}</p><Link to="/my-learning#my-learning-review-title">{ui.webReviewOpen}</Link></>
}
