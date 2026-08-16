/**
 * Server grant path for book ownership (service_role / operator only).
 *
 * Mirrors the `public.grant_entitlement` SQL function in
 * supabase/migrations/0001_accounts.sql, extended by
 * supabase/migrations/0003_compliance_finance.sql (8-arg signature, provider-neutral
 * source/status). The function is `security definer` and its EXECUTE privilege is
 * revoked from `public` and `authenticated`, so a browser client using the anon key
 * can never call it — a client can never self-grant ownership. It is reachable only
 * by the `service_role` (operator scripts today; provider callback verification
 * later, which calls this same write point — see docs/accounts-and-entitlement.md).
 *
 * SAFETY: must NEVER be bundled with, or run against, an anon-key client.
 * The service-role key is a privileged secret and must only live in
 * server / operator contexts.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EntitlementStatus } from '../payments/contract';
import type { EntitlementProvider } from './types';

export interface GrantEntitlementInput {
  userId: string;
  bookId: string;
  provider: EntitlementProvider;
  /** Opaque provider reference (operator note / ECPay transaction id). */
  providerRef?: string | null;
  /** Source Order id for purchase grants; null/undefined for manual grants. */
  sourceOrderId?: string | null;
  /** Grant status; the SQL function defaults to 'active'. */
  status?: EntitlementStatus | null;
  /** ISO-8601 revocation timestamp (only meaningful when status='revoked'). */
  revokedAt?: string | null;
  /** Normalized revocation reason (e.g. 'refund'). */
  revocationReason?: string | null;
}

/**
 * Grants (or refreshes) ownership for a user+book through the single server write
 * point. The SQL upsert refreshes provider/provider_ref/granted_at on a genuine
 * re-grant (incoming non-NULL provider_ref) and applies status/revoked fields on
 * every call; pass provider_ref NULL for a pure status flip that preserves
 * existing provenance. Call ONLY for the first qualifying successful payment —
 * duplicate successful charges must never call grant (decision-record §13).
 */
export async function grantEntitlement(
  client: SupabaseClient,
  input: GrantEntitlementInput,
): Promise<void> {
  const params: Record<string, unknown> = {
    p_user_id: input.userId,
    p_book_id: input.bookId,
    p_provider: input.provider,
    p_provider_ref: input.providerRef ?? null,
  };
  // Forward the extended arguments only when supplied, so legacy 4-arg callers
  // keep the exact original RPC shape (the extended SQL params all have defaults).
  if (input.sourceOrderId !== undefined) params.p_source_order_id = input.sourceOrderId;
  if (input.status !== undefined) params.p_status = input.status;
  if (input.revokedAt !== undefined) params.p_revoked_at = input.revokedAt;
  if (input.revocationReason !== undefined) params.p_revocation_reason = input.revocationReason;

  const { error } = await client.rpc('grant_entitlement', params);

  if (error) {
    throw new Error(`grantEntitlement: ${error.message}`);
  }
}
