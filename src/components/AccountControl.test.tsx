import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithAppProviders } from '../test/appProviders'
import { AccountControl } from './AccountControl'

describe('AccountControl', () => {
  it('opens the shared auth panel and closes it after sign-in', async () => {
    renderWithAppProviders(<AccountControl />)

    const trigger = await screen.findByRole('button', { name: 'ログイン' })
    fireEvent.click(trigger)
    expect(screen.getByRole('region', { name: 'ログイン' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('メールアドレス'), {
      target: { value: 'reader@example.com' },
    })
    fireEvent.change(screen.getByLabelText('パスワード'), {
      target: { value: 'correct-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'ログインして続ける' }))

    expect(await screen.findByText('reader@example.com')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'ログイン' })).not.toBeInTheDocument()
  })

  it('keeps the account visible and reports a generic error when sign-out fails', async () => {
    const { authClient } = renderWithAppProviders(<AccountControl />, {
      session: { id: 'u-1', email: 'reader@example.com' },
    })
    authClient.signOut = vi.fn().mockRejectedValue(new Error('provider details must stay hidden'))

    fireEvent.click(await screen.findByRole('button', { name: 'ログアウト' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('認証できませんでした')
    expect(screen.getByText('reader@example.com')).toBeInTheDocument()
  })
})
