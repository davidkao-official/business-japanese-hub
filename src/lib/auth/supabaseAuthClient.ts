/**
 * Supabase adapter for the `AuthClient` interface.
 *
 * Thin mapping over `supabase.auth` so the app surface never depends on
 * Supabase types directly. The wrapped `SupabaseClient` is injected; create it
 * once (e.g. at app startup) and reuse so the session/subscription is stable.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { AuthClient, SessionUser, SignInResult } from './types';

function mapUser(user: User | null): SessionUser | null {
  if (!user) return null;
  return { id: user.id, email: user.email ?? null };
}

export class SupabaseAuthClient implements AuthClient {
  constructor(private readonly client: SupabaseClient) {}

  async getSession(): Promise<SessionUser | null> {
    const { data } = await this.client.auth.getSession();
    return mapUser(data.session?.user ?? null);
  }

  async signInWithPassword(input: { email: string; password: string }): Promise<SignInResult> {
    const { data, error } = await this.client.auth.signInWithPassword(input);
    if (error) {
      throw new Error(`signInWithPassword: ${error.message}`);
    }
    if (!data.user) {
      throw new Error('signInWithPassword: sign-in succeeded without a user');
    }
    return { user: data.user };
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) {
      throw new Error(`signOut: ${error.message}`);
    }
  }

  onAuthStateChange(listener: (user: SessionUser | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      listener(mapUser(session?.user ?? null));
    });
    return () => data.subscription.unsubscribe();
  }
}
