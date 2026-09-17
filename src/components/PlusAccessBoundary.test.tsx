import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@business-japanese-hub/platform-auth'
import { renderWithAppProviders } from '../test/appProviders'
import type { PlusMembershipAccess } from '../lib/membership/access'
import { PlusAccessBoundary } from './PlusAccessBoundary'

function renderBoundary(
  repository: { getAccess(): Promise<PlusMembershipAccess> } | null,
  session: SessionUser | null = null,
  access: 'public' | 'plus' = 'plus',
) {
  return renderWithAppProviders(
    <PlusAccessBoundary
      access={access}
      preview={<p>Locked preview metadata</p>}
    >
      <p>Unlocked Plus content</p>
    </PlusAccessBoundary>,
    { session, membershipAccessRepository: repository },
  )
}

describe('PlusAccessBoundary', () => {
  it('renders public/free content without consulting membership state', () => {
    const repository = { getAccess: vi.fn().mockResolvedValue('non-member') }
    const view = renderBoundary(repository, null, 'public')

    expect(view.container.querySelector('[data-access-state="public"]')).not.toBeNull()
    expect(screen.getByText('Unlocked Plus content')).toBeInTheDocument()
    expect(repository.getAccess).not.toHaveBeenCalled()
  })

  it('shows a signed-out preview and authentication surface without Plus content', async () => {
    const view = renderBoundary(null, null)

    await waitFor(() =>
      expect(view.container.querySelector('[data-access-state="signed-out"]')).not.toBeNull(),
    )
    expect(screen.getByText('ログインして会員状態を確認')).toBeInTheDocument()
    expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument()
    expect(screen.queryByText('Unlocked Plus content')).not.toBeInTheDocument()
  })

  it('keeps a signed-in non-member locked even if local storage claims active access', async () => {
    window.localStorage.setItem('plus-membership', 'active')
    const view = renderBoundary(
      { getAccess: vi.fn().mockResolvedValue('non-member') },
      { id: 'user-1', email: 'reader@example.com' },
    )

    await waitFor(() =>
      expect(view.container.querySelector('[data-access-state="non-member"]')).not.toBeNull(),
    )
    expect(screen.getByText('現在は Free 状態です')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '無料の学習を始める' })).toHaveAttribute('href', '/learn')
    expect(screen.queryByText('Unlocked Plus content')).not.toBeInTheDocument()
  })

  it('renders active Plus content only after the repository returns an active server projection', async () => {
    const view = renderBoundary(
      { getAccess: vi.fn().mockResolvedValue('active') },
      { id: 'member-1', email: 'member@example.com' },
    )

    await waitFor(() =>
      expect(view.container.querySelector('[data-access-state="active-member"]')).not.toBeNull(),
    )
    expect(screen.getByText('Unlocked Plus content')).toBeInTheDocument()
    expect(screen.getByText('Plus が有効です')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My Learning を見る' })).toHaveAttribute(
      'href',
      '/my-learning',
    )
  })

  it('keeps content locked while checking and when membership is unavailable', async () => {
    let resolveAccess!: (value: PlusMembershipAccess) => void
    const checkingView = renderBoundary(
      { getAccess: vi.fn(() => new Promise<PlusMembershipAccess>((resolve) => {
        resolveAccess = resolve
      })) },
      { id: 'user-2', email: 'reader@example.com' },
    )

    expect(checkingView.container.querySelector('[data-access-state="checking"]')).not.toBeNull()
    expect(screen.queryByText('Unlocked Plus content')).not.toBeInTheDocument()
    await waitFor(() => expect(resolveAccess).toBeTypeOf('function'))
    resolveAccess('non-member')
    await waitFor(() =>
      expect(checkingView.container.querySelector('[data-access-state="non-member"]')).not.toBeNull(),
    )
    checkingView.unmount()

    const unavailableView = renderBoundary(
      { getAccess: vi.fn().mockResolvedValue('unavailable') },
      { id: 'user-3', email: 'reader@example.com' },
    )
    await waitFor(() =>
      expect(unavailableView.container.querySelector('[data-access-state="unavailable"]')).not.toBeNull(),
    )
    expect(screen.getByText('会員状態を確認できません')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'もう一度確認する' })).toBeInTheDocument()
    expect(screen.queryByText('Unlocked Plus content')).not.toBeInTheDocument()
  })
})
