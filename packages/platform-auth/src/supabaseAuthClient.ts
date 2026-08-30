import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { AuthClient, SessionUser, SignInResult, SignUpResult } from './types'

function mapUser(user: User | null): SessionUser | null {
  if (!user) return null
  return { id: user.id, email: user.email ?? null }
}

/** Thin shared identity adapter over one injected Supabase browser client. */
export class SupabaseAuthClient implements AuthClient {
  constructor(private readonly client: SupabaseClient) {}

  async getSession(): Promise<SessionUser | null> {
    const { data } = await this.client.auth.getSession()
    return mapUser(data.session?.user ?? null)
  }

  async signInWithPassword(input: { email: string; password: string }): Promise<SignInResult> {
    const { data, error } = await this.client.auth.signInWithPassword(input)
    if (error) throw new Error(`signInWithPassword: ${error.message}`)
    if (!data.user) throw new Error('signInWithPassword: sign-in succeeded without a user')
    return { user: mapUser(data.user)! }
  }

  async signUpWithPassword(input: { email: string; password: string }): Promise<SignUpResult> {
    const { data, error } = await this.client.auth.signUp(input)
    if (error) throw new Error(`signUpWithPassword: ${error.message}`)
    if (!data.user) throw new Error('signUpWithPassword: sign-up succeeded without a user')
    return { user: mapUser(data.user)!, signedIn: data.session !== null }
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut({ scope: 'local' })
    if (error) throw new Error(`signOut: ${error.message}`)
  }

  onAuthStateChange(listener: (user: SessionUser | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      listener(mapUser(session?.user ?? null))
    })
    return () => data.subscription.unsubscribe()
  }
}
