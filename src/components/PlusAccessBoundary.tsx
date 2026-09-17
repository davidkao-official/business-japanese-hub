import { useId, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useStrings } from '../i18n/strings'
import {
  useMembershipAccess,
  type MembershipAccessState,
} from '../lib/membership/MembershipAccessContext'
import { AuthPanel } from './AuthPanel'

export interface PlusAccessBoundaryProps {
  /**
   * Presentation boundary only. It can hide/show UI, but private member
   * payloads still require server-side authorization before delivery.
   * Public/free content always renders; Plus content follows server state.
   */
  access?: 'public' | 'plus'
  children: ReactNode
  /** Metadata or a bounded preview shown while Plus content is locked. */
  preview?: ReactNode
}

function stateCopy(
  state: MembershipAccessState,
  strings: ReturnType<typeof useStrings>,
): { label: string; title: string; body: string } {
  const { states } = strings.plus
  switch (state.kind) {
    case 'checking':
      return { label: strings.plus.plusLabel, title: states.checkingTitle, body: states.checkingBody }
    case 'signed-out':
      return { label: strings.plus.plusLabel, title: states.signedOutTitle, body: states.signedOutBody }
    case 'non-member':
      return { label: strings.plus.freeLabel, title: states.nonMemberTitle, body: states.nonMemberBody }
    case 'active-member':
      return { label: strings.plus.plusLabel, title: states.activeMemberTitle, body: states.activeMemberBody }
    case 'unavailable':
      return { label: strings.plus.plusLabel, title: states.unavailableTitle, body: states.unavailableBody }
  }
}

export function PlusAccessBoundary({
  access = 'plus',
  children,
  preview,
}: PlusAccessBoundaryProps) {
  const strings = useStrings()
  const headingId = useId()
  const { state, retry } = useMembershipAccess()

  if (access === 'public') {
    return (
      <section
        className="plus-access plus-access--public"
        data-access-state="public"
        aria-labelledby={headingId}
      >
        <div className="plus-access__header">
          <span className="plus-access__label">{strings.plus.freeLabel}</span>
          <h2 id={headingId}>{strings.plus.states.publicTitle}</h2>
          <p>{strings.plus.states.publicBody}</p>
        </div>
        <div className="plus-access__content">{children}</div>
      </section>
    )
  }

  const copy = stateCopy(state, strings)
  const isActive = state.kind === 'active-member'

  return (
    <section
      className={`plus-access plus-access--${state.kind}`}
      data-access-state={state.kind}
      aria-labelledby={headingId}
      aria-busy={state.kind === 'checking'}
      aria-live="polite"
    >
      <div className="plus-access__header">
        <span className="plus-access__label">{copy.label}</span>
        <h2 id={headingId}>{copy.title}</h2>
        <p>{copy.body}</p>
      </div>

      {!isActive && preview && <div className="plus-access__preview">{preview}</div>}

      {isActive ? (
        <div className="plus-access__content">{children}</div>
      ) : (
        <div className="plus-access__actions">
          {state.kind === 'signed-out' && <AuthPanel />}
          {state.kind === 'non-member' && (
            <Link className="btn btn--secondary" to="/learn">
              {strings.plus.freeAction}
            </Link>
          )}
          {state.kind === 'unavailable' && (
            <button className="btn btn--secondary" type="button" onClick={retry}>
              {strings.plus.states.retry}
            </button>
          )}
        </div>
      )}

      {isActive && (
        <div className="plus-access__actions">
          <Link className="btn btn--secondary" to="/my-learning">
            {strings.plus.memberAction}
          </Link>
        </div>
      )}
    </section>
  )
}
