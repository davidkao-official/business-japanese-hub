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

describe('SupabaseAuthClient sign-up', () => {
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
