import { useId, useState } from 'react'
import { useStrings } from '../i18n/strings'
import { useAuth } from '../lib/auth/AuthContext'
import { AuthPanel } from './AuthPanel'

export function AccountControl() {
  const strings = useStrings()
  const { user, loading, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const panelId = useId()

  if (user) {
    return (
      <div className="account-control account-control--signed-in">
        <span className="account-control__identity">{user.email ?? strings.auth.account}</span>
        <button className="btn btn--ghost" type="button" onClick={() => void signOut()}>
          {strings.auth.signOut}
        </button>
      </div>
    )
  }

  return (
    <div className="account-control">
      <button
        className="btn btn--ghost"
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
        disabled={loading}
      >
        {strings.auth.signIn}
      </button>
      {open && (
        <div className="account-control__panel" id={panelId}>
          <AuthPanel onAuthenticated={() => setOpen(false)} onCancel={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}
