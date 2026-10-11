import { useEffect, useId, useRef, useState } from 'react'
import { AuthError, useAuth } from '@business-japanese-hub/platform-auth'
import type { AuthErrorCode } from '@business-japanese-hub/platform-auth'
import { useStrings } from '../i18n/strings'

export interface AuthPanelProps {
  onAuthenticated?: () => void
  onCancel?: () => void
  showPurchaseIntro?: boolean
}

type Mode = 'sign-in' | 'sign-up'
type Status = 'idle' | 'pending' | 'failed' | 'confirmation-sent'

/** Shared recoverable email/password auth UI for the header and paid checkout. */
export function AuthPanel({ onAuthenticated, onCancel, showPurchaseIntro = false }: AuthPanelProps) {
  const strings = useStrings()
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<Mode>('sign-in')
  const [status, setStatus] = useState<Status>('idle')
  const [errorCode, setErrorCode] = useState<AuthErrorCode>('failure')
  const emailId = useId()
  const passwordId = useId()
  const inFlight = useRef(false)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showPurchaseIntro) emailRef.current?.focus()
  }, [showPurchaseIntro])

  const submit = async (form: HTMLFormElement) => {
    if (inFlight.current || (mode === 'sign-up' && status === 'confirmation-sent')) return
    inFlight.current = true
    const data = new FormData(form)
    const email = String(data.get('email') ?? '').trim()
    const password = String(data.get('password') ?? '')
    setStatus('pending')
    try {
      if (mode === 'sign-in') {
        await signIn(email, password)
        setStatus('idle')
        onAuthenticated?.()
        return
      }
      // Only the current app's origin/path: never carry tokens or redirect query parameters.
      const emailRedirectTo = `${window.location.origin}${window.location.pathname}`
      const result = await signUp(email, password, emailRedirectTo)
      if (result.signedIn) {
        setStatus('idle')
        onAuthenticated?.()
      } else {
        setStatus('confirmation-sent')
      }
    } catch (error) {
      // Only classified failures reach localized copy; never raw provider messages.
      setErrorCode(error instanceof AuthError ? error.code : 'failure')
      setStatus('failed')
    } finally {
      inFlight.current = false
    }
  }

  const switchMode = () => {
    setMode((current) => (current === 'sign-in' ? 'sign-up' : 'sign-in'))
    setStatus('idle')
  }

  return (
    <section
      className="auth-panel"
      aria-busy={status === 'pending'}
      aria-label={mode === 'sign-in' ? strings.auth.signIn : strings.auth.createAccount}
    >
      <div className="auth-panel__heading">
        <strong>{mode === 'sign-in' ? strings.auth.signIn : strings.auth.createAccount}</strong>
        {showPurchaseIntro && <span className="auth-panel__intro">{strings.auth.authRequired}</span>}
      </div>
      <form
        className="auth-panel__form"
        onSubmit={(event) => {
          event.preventDefault()
          void submit(event.currentTarget)
        }}
      >
        <label className="auth-panel__field" htmlFor={emailId}>
          <span>{strings.auth.email}</span>
          <input
            ref={emailRef}
            id={emailId}
            name="email"
            type="email"
            autoComplete="email"
            disabled={status === 'pending'}
            onChange={() => {
              if (status === 'confirmation-sent') setStatus('idle')
            }}
            required
          />
        </label>
        <label className="auth-panel__field" htmlFor={passwordId}>
          <span>{strings.auth.password}</span>
          <input
            id={passwordId}
            name="password"
            type="password"
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            minLength={mode === 'sign-up' ? 8 : undefined}
            disabled={status === 'pending'}
            required
          />
        </label>
        {status === 'failed' && (
          <span className="auth-panel__message auth-panel__message--error" role="alert">
            {strings.auth[errorCode]}
          </span>
        )}
        {status === 'confirmation-sent' && (
          <span className="auth-panel__message" role="status">{strings.auth.confirmationSent}</span>
        )}
        <div className="auth-panel__actions">
          <button
            className="btn btn--primary"
            type="submit"
            disabled={status === 'pending' || status === 'confirmation-sent'}
          >
            {status === 'pending'
              ? strings.auth.loading
              : mode === 'sign-in'
                ? strings.auth.submitSignIn
                : strings.auth.submitSignUp}
          </button>
          <button className="btn btn--ghost" type="button" onClick={switchMode} disabled={status === 'pending'}>
            {mode === 'sign-in' ? strings.auth.switchToSignUp : strings.auth.switchToSignIn}
          </button>
          {onCancel && (
            <button className="btn btn--ghost" type="button" onClick={onCancel} disabled={status === 'pending'}>
              {strings.auth.cancel}
            </button>
          )}
        </div>
      </form>
    </section>
  )
}
