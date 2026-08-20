import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithAppProviders } from '../test/appProviders'
import { AuthPanel } from './AuthPanel'

describe('AuthPanel', () => {
  it('reports email confirmation without claiming an authenticated session', async () => {
    const onAuthenticated = vi.fn()
    const { authClient } = renderWithAppProviders(
      <AuthPanel onAuthenticated={onAuthenticated} showPurchaseIntro />,
    )
    vi.mocked(authClient.signUpWithPassword).mockResolvedValue({
      user: { id: 'u-new', email: 'new@example.com' },
      signedIn: false,
    })

    fireEvent.click(screen.getByRole('button', { name: '初めての方はこちら' }))
    fireEvent.change(screen.getByLabelText('メールアドレス'), {
      target: { value: 'new@example.com' },
    })
    fireEvent.change(screen.getByLabelText('パスワード'), {
      target: { value: 'new-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'アカウントを作成して続ける' }))

    expect(await screen.findByRole('status')).toHaveTextContent('確認メールを送信しました。')
    expect(onAuthenticated).not.toHaveBeenCalled()
  })

  it('completes inline sign-in and returns control to the purchase intent', async () => {
    const onAuthenticated = vi.fn()
    const { authClient } = renderWithAppProviders(<AuthPanel onAuthenticated={onAuthenticated} />)

    fireEvent.change(screen.getByLabelText('メールアドレス'), {
      target: { value: ' reader@example.com ' },
    })
    fireEvent.change(screen.getByLabelText('パスワード'), {
      target: { value: 'correct-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'ログインして続ける' }))

    await screen.findByRole('button', { name: 'ログインして続ける' })
    expect(authClient.signInWithPassword).toHaveBeenCalledWith({
      email: 'reader@example.com',
      password: 'correct-password',
    })
    expect(onAuthenticated).toHaveBeenCalledOnce()
  })

  it('shows a generic failure without exposing provider or account-enumeration details', async () => {
    const { authClient } = renderWithAppProviders(<AuthPanel />)
    vi.mocked(authClient.signInWithPassword).mockRejectedValue(
      new Error('No account exists for private-person@example.com'),
    )

    fireEvent.change(screen.getByLabelText('メールアドレス'), {
      target: { value: 'private-person@example.com' },
    })
    fireEvent.change(screen.getByLabelText('パスワード'), {
      target: { value: 'wrong-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'ログインして続ける' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '認証できませんでした。入力内容をご確認ください。',
    )
    expect(screen.queryByText(/private-person@example\.com/)).not.toBeInTheDocument()
  })

  it('does not submit twice while authentication is pending', async () => {
    let resolveSignIn!: (result: { user: { id: string; email: string } }) => void
    const { authClient } = renderWithAppProviders(<AuthPanel />)
    vi.mocked(authClient.signInWithPassword).mockImplementation(
      () => new Promise((resolve) => {
        resolveSignIn = resolve
      }),
    )

    fireEvent.change(screen.getByLabelText('メールアドレス'), {
      target: { value: 'reader@example.com' },
    })
    fireEvent.change(screen.getByLabelText('パスワード'), {
      target: { value: 'correct-password' },
    })
    const submit = screen.getByRole('button', { name: 'ログインして続ける' })
    fireEvent.click(submit)
    fireEvent.submit(submit.closest('form')!)

    expect(authClient.signInWithPassword).toHaveBeenCalledOnce()
    resolveSignIn({ user: { id: 'u-1', email: 'reader@example.com' } })
    await waitFor(() => expect(submit).toBeEnabled())
  })
})
