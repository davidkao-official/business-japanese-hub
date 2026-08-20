import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
})
