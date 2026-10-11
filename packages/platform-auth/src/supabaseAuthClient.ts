import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { AuthClient, SessionUser, SignInResult, SignUpResult } from './types'

function mapUser(user: User | null, accessToken?: string): SessionUser | null {
  if (!user) return null
  const mapped: SessionUser = { id: user.id, email: user.email ?? null }
  // Decode only a local lifecycle hint. Server-side token verification and
  // entitlement checks remain unchanged; this never grants access.
  const encoded = accessToken?.split('.')[1]
  if (encoded) {
    try {
      const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
      const claims = JSON.parse(globalThis.atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))) as {
        sub?: unknown; session_id?: unknown
      }
      if (claims.sub === user.id && typeof claims.session_id === 'string' && claims.session_id.length > 0) {
        mapped.sessionId = claims.session_id
      }
    } catch {
      // Unknown session identity fails conservatively to a new local scope.
    }
  }
  return mapped
}

/** Thin shared identity adapter over one injected Supabase browser client. */
export class SupabaseAuthClient implements AuthClient {
  constructor(private readonly client: SupabaseClient) {}

  async getSession(): Promise<SessionUser | null> {
    const { data } = await this.client.auth.getSession()
    return mapUser(data.session?.user ?? null, data.session?.access_token)
  }

  async getAccessToken(): Promise<string | null> {
    const { data } = await this.client.auth.getSession()
    return data.session?.access_token ?? null
  }

  async signInWithPassword(input: { email: string; password: string }): Promise<SignInResult> {
    const { data, error } = await this.client.auth.signInWithPassword(input)
    if (error) throw new Error(`signInWithPassword: ${error.message}`)
    if (!data.user) throw new Error('signInWithPassword: sign-in succeeded without a user')
    return { user: mapUser(data.user, data.session?.access_token)! }
  }

  async signUpWithPassword(input: { email: string; password: string }): Promise<SignUpResult> {
    const { data, error } = await this.client.auth.signUp(input)
    if (error) throw new Error(`signUpWithPassword: ${error.message}`)
    if (!data.user) throw new Error('signUpWithPassword: sign-up succeeded without a user')
    return { user: mapUser(data.user, data.session?.access_token)!, signedIn: data.session !== null }
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut({ scope: 'local' })
    if (error) throw new Error(`signOut: ${error.message}`)
  }

  onAuthStateChange(listener: (user: SessionUser | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      listener(mapUser(session?.user ?? null, session?.access_token))
    })
    return () => data.subscription.unsubscribe()
  }
}
