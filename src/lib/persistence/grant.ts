/**
 * Server grant path for book ownership (service_role / operator only).
 *
 * Mirrors the `public.grant_entitlement` SQL function in
 * supabase/migrations/0001_accounts.sql. That function is `security definer`
 * and its EXECUTE privilege is revoked from `public` and `authenticated`, so a
 * browser client using the anon key can never call it — a client can never
 * self-grant ownership. It is reachable only by the `service_role` (operator
 * scripts today; ECPay server callback verification later, which calls this same
 * write point — see docs/accounts-and-entitlement.md).
 *
 * SAFETY: must NEVER be bundled with, or run against, an anon-key client.
 * The service-role key is a privileged secret and must only live in
 * server / operator contexts.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EntitlementProvider } from './types';

export interface GrantEntitlementInput {
  userId: string;
  bookId: string;
  provider: EntitlementProvider;
  /** Opaque provider reference (operator note / ECPay transaction id). */
  providerRef?: string | null;
}

/**
 * Grants (or refreshes) ownership for a user+book through the single server
 * write point. Idempotent: re-granting updates provider/provider_ref/granted_at.
 */
export async function grantEntitlement(
  client: SupabaseClient,
  input: GrantEntitlementInput,
): Promise<void> {
  const { error } = await client.rpc('grant_entitlement', {
    p_user_id: input.userId,
    p_book_id: input.bookId,
    p_provider: input.provider,
    p_provider_ref: input.providerRef ?? null,
  });

  if (error) {
    throw new Error(`grantEntitlement: ${error.message}`);
  }
}
