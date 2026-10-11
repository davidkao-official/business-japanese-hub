import { AuthApiError } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { SupabaseAuthClient } from '@business-japanese-hub/platform-auth'

function clientWithSignUp(result: unknown): SupabaseClient {
  return {
    auth: {
      signUp: vi.fn().mockResolvedValue(result),
    },
  } as unknown as SupabaseClient
}

function clientWithSignOut(result: unknown): SupabaseClient {
  return {
    auth: {
      signOut: vi.fn().mockResolvedValue(result),
    },
  } as unknown as SupabaseClient
}

describe('SupabaseAuthClient sign-up', () => {
  it.each([
    'https://business-japanese-hub.pages.dev/my-learning',
    'https://business-japanese-career-game.pages.dev/cases/rookie-survival',
  ])('passes the app-owned confirmation redirect to Supabase: %s', async (emailRedirectTo) => {
    const client = clientWithSignUp({
      data: { user: { id: 'u-new', email: 'new@example.com' }, session: null },
      error: null,
    })

    await new SupabaseAuthClient(client).signUpWithPassword({
      email: 'new@example.com',
      password: 'new-password',
      emailRedirectTo,
    })

    expect(client.auth.signUp).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'new-password',
      options: { emailRedirectTo },
    })
  })

  it('reports a confirmation-pending account without claiming a session', async () => {
    const client = clientWithSignUp({
      data: { user: { id: 'u-new', email: 'new@example.com' }, session: null },
      error: null,
    })

    const result = await new SupabaseAuthClient(client).signUpWithPassword({
      email: 'new@example.com',
      password: 'new-password',
    })

    expect(result).toEqual({
      user: { id: 'u-new', email: 'new@example.com' },
      signedIn: false,
    })
  })

  it('reports signed in only when Supabase returned a real session', async () => {
    const client = clientWithSignUp({
      data: {
        user: { id: 'u-new', email: 'new@example.com' },
        session: { access_token: 'tok-123' },
      },
      error: null,
    })

    const result = await new SupabaseAuthClient(client).signUpWithPassword({
      email: 'new@example.com',
      password: 'new-password',
    })

    expect(result.signedIn).toBe(true)
  })
})

describe.each(['signUpWithPassword', 'signInWithPassword'] as const)('SupabaseAuthClient %s errors', (method) => {
  it.each([
    [429, undefined, 'rateLimited'],
    [400, 'over_email_send_rate_limit', 'rateLimited'],
    [400, 'over_request_rate_limit', 'rateLimited'],
    [422, 'user_already_exists', 'alreadyRegistered'],
    [422, 'email_exists', 'alreadyRegistered'],
    [400, 'invalid_credentials', 'invalidCredentials'],
    [400, 'email_not_confirmed', 'emailNotConfirmed'],
    [500, 'unexpected_failure', 'failure'],
  ])('classifies status %s / code %s without provider text', async (status, code, reason) => {
    const providerMethod = method === 'signUpWithPassword' ? 'signUp' : 'signInWithPassword'
    const client = {
      auth: {
        [providerMethod]: vi.fn().mockResolvedValue({
          data: { user: null, session: null },
          error: new AuthApiError('Provider details for private-person@example.com', status, code),
        }),
      },
    } as unknown as SupabaseClient

    await expect(new SupabaseAuthClient(client)[method]({
      email: 'new@example.com',
      password: 'new-password',
    })).rejects.toMatchObject({ name: 'AuthError', code: reason, message: reason })
  })
})

describe('SupabaseAuthClient sign-out', () => {
  it('ends only the current browser session', async () => {
    const client = clientWithSignOut({ error: null })

    await new SupabaseAuthClient(client).signOut()

    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
})
