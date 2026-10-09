import { useId } from 'react'
import { Link } from 'react-router-dom'
import { AuthPanel } from '../components/AuthPanel'
import { useStrings } from '../i18n/strings'
import { useBookState } from '../lib/persistence/useBookState'
import { useUserState } from '../lib/persistence/UserStateContext'

/** Presentation only: historical Book access is still decided by the server. */
export function useLegacyLearningAccess(bookId: string) {
  const { user, repository, authLoading } = useUserState()
  const bookState = useBookState(bookId)
  const kind = authLoading ? 'checking'
    : !user ? 'signed-out'
      : !repository || bookState.error ? 'unavailable'
        : bookState.loading ? 'checking'
          : bookState.owned ? 'owned' : 'not-owned'
  return { kind, user } as const
}

export function LegacyLearningAccessNotice({ kind }: {
  kind: ReturnType<typeof useLegacyLearningAccess>['kind']
}) {
  const ui = useStrings().learningUi
  const headingId = useId()
  if (kind === 'owned') return null
  const copy = kind === 'checking'
    ? [ui.legacyCheckingTitle, ui.legacyCheckingBody]
    : kind === 'signed-out'
      ? [ui.legacySignInTitle, ui.legacySignInBody]
      : kind === 'unavailable'
        ? [ui.legacyUnavailableTitle, ui.legacyUnavailableBody]
        : [ui.legacyNotOwnedTitle, ui.legacyNotOwnedBody]

  return (
    <section aria-labelledby={headingId} aria-busy={kind === 'checking'} data-legacy-access={kind}>
      <div role={kind === 'unavailable' ? 'alert' : 'status'}>
        <h2 id={headingId}>{copy[0]}</h2>
        <p>{copy[1]}</p>
      </div>
      {kind === 'signed-out' && <AuthPanel />}
      <Link className="btn btn--secondary" to="/learn">{ui.legacyBrowseAction}</Link>
    </section>
  )
}
