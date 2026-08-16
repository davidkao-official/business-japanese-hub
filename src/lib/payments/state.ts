/**
 * Provider-neutral payment state-transition decision functions (decision-record
 * §11.3, §13). Pure, total, conservative: no DB / fetch / global state.
 *
 * These functions consume a minimal typed event vocabulary and return either a
 * new status, the unchanged status (idempotent replay / terminal-state no-op),
 * or throw `IllegalStateTransitionError` (data-integrity contradiction the
 * orchestration layer must treat as an anomaly).
 */

import type { OrderStatus, PaymentStatus } from './contract';

/**
 * Minimal event vocabulary the orchestration layer feeds in, normalized from
 * contract.ts `VerifiedProviderEvent` / `ProviderPaymentSnapshot`:
 *
 * - `payment_initiated`        — checkout instruction built & redirect issued
 *                                (orchestration lifecycle; drives created→pending)
 * - `payment_verified`         — adapter status 'succeeded' (provider/query confirmed paid)
 * - `payment_failed`           — adapter status 'failed' (terminal provider failure)
 * - `payment_cancelled`        — order-level cancellation; payment status unchanged
 *                                (abandoned attempts resolved by the repair loop, §6 Layer B)
 * - `verification_pending`     — callback ok but provider confirmation ambiguous
 *                                (wait for repair loop / scheduled query)
 * - `refund_confirmed`         — provider-confirmed full refund (§7 source of truth)
 * - `duplicate_success_detected' — this attempt succeeded but the order is already
 *                                paid by another attempt (§13 double-charge)
 *
 * Transition functions consume ONLY the `type` discriminant; the remaining
 * fields carry provenance for the orchestration layer's persistence.
 */
export type PaymentDomainEvent =
  | { type: 'payment_initiated'; merchantReference: string }
  | {
      type: 'payment_verified';
      merchantReference: string;
      providerPaymentReference?: string;
      paidAt?: string;
      /** Provider status code from the confirmed snapshot (e.g. ECPay '1', PayPal 'COMPLETED'). */
      rawStatusCode?: string;
    }
  | { type: 'payment_failed'; merchantReference: string; rawStatusCode?: string }
  | { type: 'payment_cancelled'; merchantReference: string }
  | { type: 'verification_pending'; merchantReference: string }
  | { type: 'refund_confirmed'; merchantReference: string; completedAt?: string }
  | { type: 'duplicate_success_detected'; merchantReference: string };

/** Thrown on illegal / contradictory transitions (never on idempotent replays). */
export class IllegalStateTransitionError extends Error {
  readonly domain: 'order' | 'payment';
  readonly current: string;
  readonly eventType: string;

  constructor(domain: 'order' | 'payment', current: string, eventType: string) {
    super(`Illegal ${domain} state transition from '${current}' on event '${eventType}'`);
    this.name = 'IllegalStateTransitionError';
    this.domain = domain;
    this.current = current;
    this.eventType = eventType;
  }
}

const ILLEGAL = null;

function orderTransition(current: OrderStatus, eventType: string): OrderStatus | null {
  switch (current) {
    case 'pending':
      switch (eventType) {
        case 'payment_verified':
          return 'paid';
        case 'payment_cancelled':
          return 'cancelled';
        case 'payment_failed':
        case 'payment_initiated':
        case 'verification_pending':
          return 'pending'; // no-change: a failed attempt keeps the order retryable
        case 'refund_confirmed':
        case 'duplicate_success_detected':
          return ILLEGAL; // contradiction: nothing paid to refund / duplicate implies paid
      }
      break;
    case 'paid':
      switch (eventType) {
        case 'refund_confirmed':
          return 'refunded';
        case 'payment_verified':
        case 'payment_failed':
        case 'payment_cancelled':
        case 'payment_initiated':
        case 'verification_pending':
        case 'duplicate_success_detected':
          return 'paid'; // no-change: a paid order NEVER downgrades (late failed callback etc.)
      }
      break;
    case 'refunded':
      return 'refunded'; // terminal: no-change for any event
    case 'cancelled':
      switch (eventType) {
        case 'payment_verified':
        case 'refund_confirmed':
        case 'duplicate_success_detected':
          return ILLEGAL; // verified/refunded money on a cancelled order is an anomaly
        case 'payment_failed':
        case 'payment_cancelled':
        case 'payment_initiated':
        case 'verification_pending':
          return 'cancelled'; // terminal: no-change
      }
  }
  throw new IllegalStateTransitionError('order', current, eventType);
}

/**
 * Next order status per §11.3: `pending → paid`, `pending → cancelled`,
 * `paid → refunded`. A paid order never transitions back (even a late failed
 * callback leaves it `paid`). Contradictions throw.
 */
export function nextOrderStatus(current: OrderStatus, event: PaymentDomainEvent): OrderStatus {
  const next = orderTransition(current, event.type);
  if (next === ILLEGAL) {
    throw new IllegalStateTransitionError('order', current, event.type);
  }
  return next;
}

function paymentTransition(current: PaymentStatus, eventType: string): PaymentStatus | null {
  switch (current) {
    case 'created':
      switch (eventType) {
        case 'payment_initiated':
          return 'pending';
        case 'payment_verified':
          return 'succeeded';
        case 'payment_failed':
          return 'failed';
        case 'verification_pending':
          return 'verification_pending';
        case 'payment_cancelled':
          return 'created'; // no-change
        case 'refund_confirmed':
        case 'duplicate_success_detected':
          return ILLEGAL; // contradiction
      }
      break;
    case 'pending':
      switch (eventType) {
        case 'payment_verified':
          return 'succeeded';
        case 'payment_failed':
          return 'failed';
        case 'verification_pending':
          return 'verification_pending';
        case 'payment_initiated':
        case 'payment_cancelled':
          return 'pending'; // no-change (abandoned resolved by repair loop)
        case 'refund_confirmed':
        case 'duplicate_success_detected':
          return ILLEGAL; // contradiction
      }
      break;
    case 'verification_pending':
      switch (eventType) {
        case 'payment_verified':
          return 'succeeded';
        case 'payment_failed':
          return 'failed';
        case 'payment_initiated':
        case 'payment_cancelled':
        case 'verification_pending':
          return 'verification_pending'; // no-change
        case 'refund_confirmed':
        case 'duplicate_success_detected':
          return ILLEGAL; // contradiction
      }
      break;
    case 'succeeded':
      switch (eventType) {
        case 'refund_confirmed':
          return 'refunded';
        case 'duplicate_success_detected':
          return 'duplicate_success';
        case 'payment_verified':
          return 'succeeded'; // no-change: duplicate callback is idempotent
        case 'payment_failed':
          return 'succeeded'; // no-change: a late failed callback NEVER downgrades succeeded
        case 'payment_cancelled':
        case 'payment_initiated':
        case 'verification_pending':
          return 'succeeded'; // no-change
      }
      break;
    case 'failed':
      switch (eventType) {
        case 'payment_verified':
        case 'payment_failed':
        case 'payment_cancelled':
        case 'payment_initiated':
        case 'verification_pending':
          return 'failed'; // no-change: failed is terminal, never a status revert
        case 'refund_confirmed':
        case 'duplicate_success_detected':
          return ILLEGAL; // contradiction: cannot refund / duplicate a failed payment
      }
      break;
    case 'duplicate_success':
      switch (eventType) {
        case 'refund_confirmed':
          return 'refunded';
        default:
          return 'duplicate_success'; // no-change
      }
    case 'refunded':
      return 'refunded'; // terminal: no-change for any event
  }
  throw new IllegalStateTransitionError('payment', current, eventType);
}

/**
 * Next payment status per §11.3 + §13:
 * `created → pending → verification_pending → succeeded`, `created → pending → failed`
 * (failed is terminal — a retry is a NEW PaymentAttempt row, never a status revert),
 * `succeeded → refunded`, `succeeded → duplicate_success` (a second REAL charge when the
 * order is already paid — NOT a second grant). A succeeded payment is never downgraded by
 * a late failed callback (returns 'succeeded' unchanged). Contradictions throw.
 */
export function nextPaymentStatus(current: PaymentStatus, event: PaymentDomainEvent): PaymentStatus {
  const next = paymentTransition(current, event.type);
  if (next === ILLEGAL) {
    throw new IllegalStateTransitionError('payment', current, event.type);
  }
  return next;
}
