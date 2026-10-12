import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthApiError } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AuthError, SupabaseAuthClient } from '@business-japanese-hub/platform-auth'
import { renderWithAppProviders } from '../test/appProviders'
import { AuthPanel } from './AuthPanel'

const initialUrl = window.location.href

afterEach(() => {
  window.history.replaceState(null, '', initialUrl)
})

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

    const submit = screen.getByRole('button', { name: 'アカウントを作成して続ける' })
    expect(submit).toBeDisabled()
    fireEvent.click(submit)
    fireEvent.submit(submit.closest('form')!)
    fireEvent.change(screen.getByLabelText('パスワード'), {
      target: { value: 'another-password' },
    })
    fireEvent.submit(submit.closest('form')!)

    expect(authClient.signUpWithPassword).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveTextContent('確認メールを送信しました。')

    fireEvent.change(screen.getByLabelText('メールアドレス'), {
      target: { value: 'other@example.com' },
    })
    expect(submit).toBeEnabled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    fireEvent.click(submit)
    await screen.findByRole('status')
    expect(authClient.signUpWithPassword).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: 'すでにアカウントをお持ちの方' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ログインして続ける' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'ログインして続ける' }))
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledOnce())
  })

  it.each([
    '/my-learning',
    '/practice/web-test/spi/verbal/two-word-relationship',
    '//external.invalid/path',
  ])('returns confirmation to the current origin/path without queries or fragments: %s', async (pathname) => {
    window.history.replaceState(null, '', `${window.location.origin}${pathname}?access_token=synthetic&redirect_to=https://external.invalid#refresh_token=synthetic`)
    const { authClient } = renderWithAppProviders(<AuthPanel />)

    fireEvent.click(screen.getByRole('button', { name: '初めての方はこちら' }))
    fireEvent.change(screen.getByLabelText('メールアドレス'), {
      target: { value: 'new@example.com' },
    })
    fireEvent.change(screen.getByLabelText('パスワード'), {
      target: { value: 'new-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'アカウントを作成して続ける' }))

    await waitFor(() => expect(authClient.signUpWithPassword).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'new-password',
      emailRedirectTo: `${window.location.origin}${pathname}`,
    }))
    const redirect = new URL(vi.mocked(authClient.signUpWithPassword).mock.calls[0][0].emailRedirectTo!)
    expect(redirect.origin).toBe(window.location.origin)
    expect(redirect.search).toBe('')
    expect(redirect.hash).toBe('')
  })

  it('shows the Japanese rate-limit message for a Supabase HTTP 429', async () => {
    const { authClient } = renderWithAppProviders(<AuthPanel />)
    const provider = {
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: { user: null, session: null },
          error: new AuthApiError('Email rate limit exceeded for private-person@example.com', 429, undefined),
        }),
      },
    } as unknown as SupabaseClient
    const adapter = new SupabaseAuthClient(provider)
    vi.mocked(authClient.signUpWithPassword).mockImplementation((input) => adapter.signUpWithPassword(input))

    fireEvent.click(screen.getByRole('button', { name: '初めての方はこちら' }))
    fireEvent.change(screen.getByLabelText('メールアドレス'), {
      target: { value: 'private-person@example.com' },
    })
    fireEvent.change(screen.getByLabelText('パスワード'), {
      target: { value: 'new-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'アカウントを作成して続ける' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '試行回数が上限に達しました。しばらく待ってから再度お試しください。',
    )
    expect(screen.queryByText(/private-person@example\.com|Email rate limit/)).not.toBeInTheDocument()
  })

  it.each([
    ['alreadyRegistered', 'このメールアドレスはすでに登録されています。ログインしてください。'],
    ['invalidCredentials', 'メールアドレスまたはパスワードが正しくありません。'],
    ['emailNotConfirmed', 'メールアドレスの確認が完了していません。確認メール内のリンクを開いてください。'],
  ] as const)('shows distinct Japanese copy for %s', async (code, message) => {
    const { authClient } = renderWithAppProviders(<AuthPanel />)
    vi.mocked(authClient.signInWithPassword).mockRejectedValue(new AuthError(code))

    fireEvent.change(screen.getByLabelText('メールアドレス'), {
      target: { value: 'reader@example.com' },
    })
    fireEvent.change(screen.getByLabelText('パスワード'), {
      target: { value: 'password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'ログインして続ける' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
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
