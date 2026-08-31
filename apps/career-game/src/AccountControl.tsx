import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '@business-japanese-hub/platform-auth'

/** Career-Game-owned presentation over the shared account identity. */
export function AccountControl({
  remotePersistenceAvailable = false,
}: {
  remotePersistenceAvailable?: boolean
}) {
  const { signIn, signOut, user } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [status, setStatus] = useState<
    'idle' | 'signing-in' | 'sign-in-failed' | 'signing-out' | 'sign-out-failed'
  >('idle')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') ?? '').trim()
    const password = String(data.get('password') ?? '')

    setStatus('signing-in')
    try {
      await signIn(email, password)
      setStatus('idle')
    } catch {
      setStatus('sign-in-failed')
    }
  }

  async function handleSignOut() {
    setStatus('signing-out')
    try {
      await signOut()
      setStatus('idle')
    } catch {
      setStatus('sign-out-failed')
    }
  }

  if (!user) {
    return (
      <div className="career-game-account-control">
        <p className="career-game-status">無料・ゲストプレイ</p>
        <button
          className="career-game-account-control__toggle"
          type="button"
          aria-expanded={isOpen}
          onClick={() => {
            setIsOpen((current) => !current)
            setStatus('idle')
          }}
        >
          共通アカウントでログイン
        </button>
        {isOpen ? (
          <form className="career-game-login" onSubmit={handleSubmit}>
            <label>
              メールアドレス
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              パスワード
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            {status === 'sign-in-failed' ? (
              <p className="career-game-login__error" role="alert">
                ログインできませんでした。入力内容をご確認ください。
              </p>
            ) : null}
            <button type="submit" disabled={status === 'signing-in'}>
              {status === 'signing-in' ? 'ログイン中…' : 'ログイン'}
            </button>
          </form>
        ) : null}
      </div>
    )
  }

  return (
    <div className="career-game-account">
      <span>共通アカウント</span>
      <strong>{user.email ?? user.id}</strong>
      <small>
        {remotePersistenceAvailable
          ? '進行は共通アカウントに保存されます'
          : '進行はこの端末にのみ保存されます'}
      </small>
      {status === 'sign-out-failed' ? (
        <small className="career-game-login__error" role="alert">
          ログアウトできませんでした。もう一度お試しください。
        </small>
      ) : null}
      <button
        className="career-game-account__sign-out"
        type="button"
        disabled={status === 'signing-out'}
        onClick={() => void handleSignOut()}
      >
        {status === 'signing-out' ? 'ログアウト中…' : 'ログアウト'}
      </button>
    </div>
  )
}
