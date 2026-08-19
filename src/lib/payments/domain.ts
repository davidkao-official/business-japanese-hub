/**
 * Provider-neutral payment orchestration decision functions (decision-record
 * §7, §13, §4.4). Pure functions only: no DB / fetch / global state. These
 * decide WHAT to do; persistence / side effects belong to the orchestration
 * layer (Edge Functions), and provider-specific signature verification belongs
 * to the ECPay adapter (A3) — not here.
 */

import { moneyEquals } from './money';
import type { Order, PaymentAttempt, PaymentProvider, ProviderPaymentSnapshot, Refund } from './contract';

/**
 * Thrown when a currency has no approved payment provider (e.g. JPY before #20).
 * Distinct from the adapter-level `UnsupportedCurrencyForProvider` (a provider
 * refusing a currency it cannot take); this is routing-level — no provider is
 * assigned at all.
 */
export class NoProviderForCurrencyError extends Error {
  constructor(currency: string) {
    super(`No payment provider supports currency ${currency}`);
    this.name = 'NoProviderForCurrencyError';
  }
}

/**
 * Server-authoritative currency → provider routing (§21). TWD → ecpay (first
 * adapter), USD → paypal. Anything else (JPY, …) is unsupported and refuses
 * checkout before any order / payment row is created — #20 stays untouched. The
 * client never decides the provider; this is the ONLY routing decision point.
 */
export function resolveProviderForCurrency(currency: string): PaymentProvider {
  if (currency === 'TWD') return 'ecpay';
  if (currency === 'USD') return 'paypal';
  throw new NoProviderForCurrencyError(currency);
}

/**
 * True only when this payment qualifies to grant entitlement (§13):
 * exactly the FIRST successful payment of a still-`pending` order grants.
 *
 * - a `duplicate_success` payment never grants;
 * - an already-`paid` (already-owned) order never gets a second entitlement;
 * - `refunded` / `cancelled` orders never grant (a re-purchase is a NEW order).
 *
 * The orchestration layer must pass the payment that belongs to `order` and
 * call this BEFORE applying the order `paid` transition.
 */
export function shouldGrantEntitlement(order: Order, payment: PaymentAttempt): boolean {
  return order.status === 'pending' && payment.status === 'succeeded';
}

/**
 * Derived-state delta after a provider-confirmed refund (§7).
 *
 * `refunds` is the refund source of truth; entitlement is revoked only once the
 * refund is provider-confirmed (`refund.status === 'succeeded'`).
 *
 * - refunded payment IS the entitlement-bearing (primary) payment
 *   → `revoke_entitlement`: order `refunded`, entitlement revoked (reason 'refund').
 * - refunded payment is a `duplicate_success` (non-entitlement-bearing)
 *   → `keep_entitlement`: only the payment becomes refunded, order stays `paid`,
 *   entitlement stays `active`.
 * - refund not yet confirmed → `noop` (never revoke on a merely requested refund).
 */
export type RefundDecision =
  | { kind: 'revoke_entitlement'; orderStatus: 'refunded'; entitlementRevocationReason: 'refund' }
  | { kind: 'keep_entitlement'; orderStatus: 'paid' }
  | { kind: 'noop'; reason: 'refund_not_confirmed' };

export function applyConfirmedRefund(refund: Refund, isPrimaryPayment: boolean): RefundDecision {
  if (refund.status !== 'succeeded') {
    return { kind: 'noop', reason: 'refund_not_confirmed' };
  }
  if (isPrimaryPayment) {
    return { kind: 'revoke_entitlement', orderStatus: 'refunded', entitlementRevocationReason: 'refund' };
  }
  return { kind: 'keep_entitlement', orderStatus: 'paid' };
}

/**
 * Generic amount / currency / status gate on a provider-normalized snapshot
 * (§4.4 success-predicate shape). Provider-specific authenticity verification
 * (CheckMacValue, QueryTradeInfo confirmation, SimulatePaid) stays in the ECPay
 * adapter, not here.
 */
export function isVerifiedSuccessSnapshot(
  snapshot: ProviderPaymentSnapshot,
  expectedAmount: number,
  expectedCurrency: string,
): boolean {
  return (
    snapshot.status === 'succeeded' &&
    moneyEquals(snapshot.amount, { amount: expectedAmount, currency: expectedCurrency })
  );
}
