import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@business-japanese-hub/platform-auth'
import { renderWithAppProviders } from '../test/appProviders'
import {
  HttpPlusMembershipAccessRepository,
  type PlusMembershipAccess,
  type PlusMembershipAccessRepository,
} from '../lib/membership/access'
import { PlusAccessBoundary } from './PlusAccessBoundary'

const jwtFor = (sub: string) => `header.${btoa(JSON.stringify({ sub })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.signature`

function renderBoundary(
  repository: PlusMembershipAccessRepository | null,
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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

async function flushPromises(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0)
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
    expect(screen.getByRole('link', { name: '学習記録を見る' })).toHaveAttribute(
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

  it.each(['token', 'fetch', 'body'] as const)(
    'recovers after the %s stage times out and ignores late A/B results',
    async (heldStage) => {
      vi.useFakeTimers()
      const heldTokens = [deferred<string | null>(), deferred<string | null>()]
      const heldFetches = [deferred<Response>(), deferred<Response>()]
      const heldBodies = [deferred<unknown>(), deferred<unknown>()]
      const pendingBodyResponses: Response[] = []
      const response = (access: string): Response => ({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ access }),
      } as unknown as Response)
      let currentUserId = 'member-a'
      let tokenIndex = 0
      let fetchIndex = 0
      const getAccessToken = (): Promise<string | null> => {
        const index = tokenIndex++
        if (heldStage === 'token' && index < 2) return heldTokens[index]!.promise
        return Promise.resolve(jwtFor(currentUserId))
      }
      const fetchImpl = vi.fn<typeof fetch>((): Promise<Response> => {
        const index = fetchIndex++
        if (index < 2 && heldStage === 'fetch') return heldFetches[index]!.promise
        if (index < 2 && heldStage === 'body') {
          const pendingResponse = response('active')
          pendingResponse.json = vi.fn(() => heldBodies[index]!.promise)
          pendingBodyResponses[index] = pendingResponse
          return Promise.resolve(pendingResponse)
        }
        return Promise.resolve(response('active'))
      })
      const repository = new HttpPlusMembershipAccessRepository(
        getAccessToken,
        { baseUrl: 'https://edge.test/functions/v1', fetchImpl },
      )

      try {
        const view = renderBoundary(repository, { id: 'member-a', email: 'a@example.com' })
        await act(async () => { await flushPromises() })
        expect(fetchImpl).toHaveBeenCalledTimes(heldStage === 'token' ? 0 : 1)

        currentUserId = 'member-b'
        act(() => view.authClient.emitAuthStateChange({ id: 'member-b', email: 'b@example.com' }))
        await act(async () => { await flushPromises() })
        expect(fetchImpl).toHaveBeenCalledTimes(heldStage === 'token' ? 0 : 2)
        if (heldStage === 'body') {
          expect(pendingBodyResponses[0]?.json).toHaveBeenCalledTimes(1)
          expect(pendingBodyResponses[1]?.json).toHaveBeenCalledTimes(1)
        }

        await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
        expect(view.container.querySelector('[data-access-state="unavailable"]')).not.toBeNull()
        expect(screen.getByText('会員状態を確認できません')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'もう一度確認する' })).toBeInTheDocument()
        expect(screen.queryByText('Unlocked Plus content')).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'もう一度確認する' }))
        await act(async () => { await flushPromises() })
        await act(async () => { await flushPromises() })
        expect(view.container.querySelector('[data-access-state="active-member"]')).not.toBeNull()
        expect(screen.getByText('Unlocked Plus content')).toBeInTheDocument()

        if (heldStage === 'token') {
          heldTokens[0]!.resolve(jwtFor('member-a'))
          heldTokens[1]!.resolve(jwtFor('member-b'))
        } else if (heldStage === 'fetch') {
          const lateA = response('active')
          const lateB = response('non-member')
          heldFetches[0]!.resolve(lateA)
          heldFetches[1]!.resolve(lateB)
          await act(async () => { await flushPromises() })
          expect(lateA.json).not.toHaveBeenCalled()
          expect(lateB.json).not.toHaveBeenCalled()
        } else {
          heldBodies[0]!.resolve({ access: 'active' })
          heldBodies[1]!.resolve({ access: 'non-member' })
        }
        await act(async () => { await flushPromises() })
        expect(view.container.querySelector('[data-access-state="active-member"]')).not.toBeNull()
        expect(screen.getByText('Unlocked Plus content')).toBeInTheDocument()
        if (heldStage === 'token') expect(fetchImpl).toHaveBeenCalledTimes(1)
        expect(vi.getTimerCount()).toBe(0)
      } finally {
        vi.useRealTimers()
      }
    },
  )
})
