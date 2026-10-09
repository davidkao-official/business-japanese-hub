import { act, renderHook, waitFor } from '@testing-library/react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider, SupabaseAuthClient, useAuth } from '@business-japanese-hub/platform-auth'

function session(userId: string, sessionId?: string, suffix = 'initial'): Session {
  const claims = { sub: userId, ...(sessionId ? { session_id: sessionId } : {}) }
  return {
    user: { id: userId, email: `${userId}@example.com` },
    access_token: `header.${btoa(JSON.stringify(claims))}.${suffix}`,
  } as unknown as Session
}

async function setup(initial: Session) {
  let current: Session | null = initial
  let listener: (_event: string, _session: Session | null) => void = () => {}
  const sdk = { auth: {
    getSession: vi.fn(async () => ({ data: { session: current }, error: null })),
    onAuthStateChange: vi.fn((callback: typeof listener) => {
      listener = callback
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    }),
    signInWithPassword: vi.fn(async () => ({ data: { user: current?.user, session: current }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  } } as unknown as SupabaseClient
  const client = new SupabaseAuthClient(sdk)
  const view = renderHook(() => useAuth(), {
    wrapper: ({ children }) => <AuthProvider authClient={client}>{children}</AuthProvider>,
  })
  await waitFor(() => expect(view.result.current.loading).toBe(false))
  return { ...view, client, emit(event: string, next: Session | null) {
    current = next
    listener(event, next)
  } }
}

describe('local session scope through the real Supabase adapter', () => {
  it.each(['TOKEN_REFRESHED', 'SIGNED_IN'])('retains scope for %s in the same session', async (event) => {
    const view = await setup(session('account-a', 'session-a'))
    const before = view.result.current.sessionVersion
    act(() => view.emit(event, session('account-a', 'session-a', 'rotated')))
    expect(view.result.current.user?.sessionId).toBe('session-a')
    expect(view.result.current.sessionVersion).toBe(before)
    expect(view.result.current.user).not.toHaveProperty('access_token')
  })

  it('starts a new scope for a new session of the same account', async () => {
    const view = await setup(session('account-a', 'session-a'))
    const before = view.result.current.sessionVersion
    act(() => view.emit('SIGNED_IN', session('account-a', 'session-b')))
    expect(view.result.current.sessionVersion).toBeGreaterThan(before)
  })

  it('does not share scope between accounts even when the session hint is the same', async () => {
    const view = await setup(session('account-a', 'session-a'))
    const before = view.result.current.sessionVersion
    act(() => view.emit('SIGNED_IN', session('account-b', 'session-a')))
    expect(view.result.current.sessionVersion).toBeGreaterThan(before)
  })

  it('retains a sign-out boundary when React batches the next sign-in', async () => {
    const initial = session('account-a', 'session-a')
    const view = await setup(initial)
    const before = view.result.current.sessionVersion
    act(() => {
      view.emit('SIGNED_OUT', null)
      view.emit('SIGNED_IN', initial)
    })
    expect(view.result.current.sessionVersion).toBe(before + 2)
  })

  it.each(['missing', 'malformed', 'wrong-subject'])('isolates an unknown %s session identity conservatively', async (kind) => {
    const view = await setup(session('account-a', 'session-a'))
    const before = view.result.current.sessionVersion
    const next = session('account-a')
    if (kind === 'malformed') next.access_token = 'not-a-jwt'
    if (kind === 'wrong-subject') next.access_token = session('someone-else', 'session-a').access_token
    act(() => view.emit('TOKEN_REFRESHED', next))
    expect(view.result.current.user?.sessionId).toBeUndefined()
    expect(view.result.current.sessionVersion).toBeGreaterThan(before)
  })

  it('uses the same session identity for the password result and its SDK event', async () => {
    const view = await setup(session('account-a', 'session-a'))
    const before = view.result.current.sessionVersion
    await act(async () => { await view.result.current.signIn('account-a@example.com', 'test-only') })
    expect(view.result.current.sessionVersion).toBe(before)
  })
})
