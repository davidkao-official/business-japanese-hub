/**
 * Shared payment orchestration core (decision-record §11.3 / §13 / §4.5).
 *
 * Owns the ONLY state-mutation paths used by the Edge Functions: applying a
 * `PaymentDomainEvent` to a payment / order via the pure state machine
 * (`src/lib/payments/state.ts`) and the verified-success path (payment
 * succeeded → order paid → grant entitlement exactly once via
 * `grantEntitlement`, decision-record §13). Imported by provider callback and
 * repair-reconcile handlers; the checkout handler uses `applyPaymentEvent` for
 * the `payment_initiated` transition.
 *
 * These functions do NOT decide policy (that stays in handlers); they are the
 * mechanical transition + persistence helpers. They throw
 * `IllegalStateTransitionError` (propagated from state.ts) on data-integrity
 * contradictions, which handlers surface as 5xx without an ACK.
 */
import type {
  Money,
  Order,
  OrderStatus,
  PaymentAttempt,
  PaymentStatus,
  Refund,
} from '../../../src/lib/payments/contract.ts';
import { nextOrderStatus, nextPaymentStatus, type PaymentDomainEvent } from '../../../src/lib/payments/state.ts';
import { applyConfirmedRefund, shouldGrantEntitlement } from '../../../src/lib/payments/domain.ts';
import { grantEntitlement } from '../../../src/lib/persistence/grant.ts';
import type { DbClient } from './db.ts';
import type { Logger } from './log.ts';

/* ------------------------------------------------------------------------- *
 * DB row shapes (snake_case, as persisted)
 * ------------------------------------------------------------------------- */

export interface OrderRow {
  id: string;
  user_id: string;
  book_id: string;
  item_name_snapshot: string;
  published_revision: string;
  amount_minor: number;
  currency: string;
  status: OrderStatus;
  /** Immutable consumer-jurisdiction snapshot (TW/JP; 'unresolved' defensive backfill). */
  jurisdiction: string;
  /** Immutable Japan consumption-tax status snapshot at purchase. */
  japan_tax_status_snapshot: string;
  created_at: string;
  paid_at: string | null;
  refunded_at: string | null;
}

export interface PaymentRow {
  id: string;
  order_id: string;
  provider: string;
  provider_merchant_ref: string;
  provider_payment_ref: string | null;
  amount_minor: number;
  currency: string;
  method: string;
  status: PaymentStatus;
  provider_status_code: string | null;
  provider_status_message: string | null;
  created_at: string;
  paid_at: string | null;
  last_verified_at: string | null;
  provider_fee_amount_minor: number | null;
  reconciliation_status: string | null;
}

/* ------------------------------------------------------------------------- *
 * Row → domain mapping (contract.ts)
 * ------------------------------------------------------------------------- */

export function orderFromRow(row: OrderRow): Order {
  return {
    id: row.id,
    userId: row.user_id,
    bookId: row.book_id,
    itemNameSnapshot: row.item_name_snapshot,
    publishedRevision: row.published_revision,
    amount: moneyOf(row.amount_minor, row.currency),
    status: row.status,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    refundedAt: row.refunded_at,
  };
}

export function paymentFromRow(row: PaymentRow): PaymentAttempt {
  return {
    id: row.id,
    orderId: row.order_id,
    provider: row.provider as PaymentAttempt['provider'],
    providerMerchantRef: row.provider_merchant_ref,
    providerPaymentRef: row.provider_payment_ref,
    amount: moneyOf(row.amount_minor, row.currency),
    method: row.method as 'credit',
    status: row.status,
    providerStatusCode: row.provider_status_code,
    providerStatusMessage: row.provider_status_message,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    lastVerifiedAt: row.last_verified_at,
    providerFeeAmount: row.provider_fee_amount_minor === null ? null : moneyOf(row.provider_fee_amount_minor, row.currency),
    reconciliationStatus: row.reconciliation_status as PaymentAttempt['reconciliationStatus'],
  };
}

export function moneyOf(amountMinor: number, currency: string): Money {
  return { amount: Number(amountMinor), currency };
}

/* ------------------------------------------------------------------------- *
 * Reads (service-role)
 * ------------------------------------------------------------------------- */

export async function loadPaymentByMerchantRef(
  db: DbClient,
  provider: string,
  ref: string,
): Promise<PaymentRow | null> {
  const { data, error } = await db
    .from('payments')
    .select('*')
    .eq('provider', provider)
    .eq('provider_merchant_ref', ref)
    .maybeSingle();
  if (error) throw new Error(`payment lookup failed: ${error.message}`);
  return (data as unknown as PaymentRow | null) ?? null;
}

export async function loadOrder(db: DbClient, id: string): Promise<OrderRow | null> {
  const { data, error } = await db.from('orders').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`order lookup failed: ${error.message}`);
  return (data as unknown as OrderRow | null) ?? null;
}

export async function loadPaymentById(db: DbClient, id: string): Promise<PaymentRow | null> {
  const { data, error } = await db.from('payments').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`payment lookup failed: ${error.message}`);
  return (data as unknown as PaymentRow | null) ?? null;
}

export async function loadLatestPaymentForOrder(db: DbClient, orderId: string): Promise<PaymentRow | null> {
  const { data, error } = await db
    .from('payments')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`payment lookup failed: ${error.message}`);
  return (data as unknown as PaymentRow | null) ?? null;
}

/* ------------------------------------------------------------------------- *
 * Transition + persistence
 * ------------------------------------------------------------------------- */

export interface FlowContext {
  db: DbClient;
  log: Logger;
  now: () => Date;
}

/** Apply a `PaymentDomainEvent` to a payment row (pure state.ts + one UPDATE). */
export async function applyPaymentEvent(
  ctx: FlowContext,
  paymentRow: PaymentRow,
  event: PaymentDomainEvent,
): Promise<PaymentStatus> {
  const nowIso = ctx.now().toISOString();
  const next = nextPaymentStatus(paymentRow.status, event);
  const patch: Record<string, unknown> = { status: next };

  switch (event.type) {
    case 'payment_verified':
      patch.provider_payment_ref = event.providerPaymentReference ?? paymentRow.provider_payment_ref;
      patch.last_verified_at = nowIso;
      // Preserve the existing ECPay status code contract; other adapters persist
      // their provider status at the callback boundary before this shared flow.
      if (paymentRow.provider === 'ecpay') patch.provider_status_code = '1';
      patch.provider_status_message = `payment confirmed by authoritative ${paymentRow.provider} verification`;
      if (next === 'succeeded') patch.paid_at = event.paidAt ?? nowIso;
      break;
    case 'payment_failed':
      patch.last_verified_at = nowIso;
      patch.provider_status_code = event.rawStatusCode ?? paymentRow.provider_status_code;
      patch.provider_status_message = `payment failed per verified ${paymentRow.provider} provider event`;
      break;
    case 'verification_pending':
      patch.last_verified_at = nowIso;
      break;
    case 'payment_initiated':
    case 'payment_cancelled':
    case 'refund_confirmed':
    case 'duplicate_success_detected':
      break;
  }

  const { error } = await ctx.db.from('payments').update(patch).eq('id', paymentRow.id);
  if (error) throw new Error(`payment update failed: ${error.message}`);
  ctx.log.info(
    {
      paymentId: paymentRow.id,
      provider: paymentRow.provider,
      merchantReference: event.merchantReference,
      status: next,
      event: event.type,
    },
    'payment status transition applied',
  );
  return next;
}

/** Apply a `PaymentDomainEvent` to an order row (pure state.ts + one UPDATE). */
export async function applyOrderEvent(
  ctx: FlowContext,
  orderRow: OrderRow,
  event: PaymentDomainEvent,
): Promise<OrderStatus> {
  const nowIso = ctx.now().toISOString();
  const next = nextOrderStatus(orderRow.status, event);
  const patch: Record<string, unknown> = { status: next };
  if (next === 'paid') {
    patch.paid_at = event.type === 'payment_verified' ? (event.paidAt ?? nowIso) : nowIso;
  }
  const { error } = await ctx.db.from('orders').update(patch).eq('id', orderRow.id);
  if (error) throw new Error(`order update failed: ${error.message}`);
  ctx.log.info({ orderId: orderRow.id, status: next, event: event.type }, 'order status transition applied');
  return next;
}

/* ------------------------------------------------------------------------- *
 * Verified-success path (§4.5 / §13) — shared by callback + repair
 * ------------------------------------------------------------------------- */

export interface ApplyVerifiedSuccessInput {
  db: DbClient;
  log: Logger;
  now: () => Date;
  orderRow: OrderRow;
  paymentRow: PaymentRow;
  merchantReference: string;
  providerPaymentReference?: string;
  paidAt?: string;
}

export interface ApplyVerifiedSuccessResult {
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  granted: boolean;
}

/**
 * Apply a verified paid result: transition the payment to `succeeded`, the order
 * to `paid`, and grant entitlement exactly once for the FIRST qualifying
 * successful payment (§13). Entitlement provenance comes from the verified
 * payment row itself, never from a provider hard-code. Idempotent: a repeated
 * verified event on an already succeeded payment / paid order is a no-change,
 * and `shouldGrantEntitlement` returns false once the order is no longer pending.
 */
export async function applyVerifiedSuccess(
  input: ApplyVerifiedSuccessInput,
): Promise<ApplyVerifiedSuccessResult> {
  const event: PaymentDomainEvent = {
    type: 'payment_verified',
    merchantReference: input.merchantReference,
    providerPaymentReference: input.providerPaymentReference,
    paidAt: input.paidAt,
  };

  const order = orderFromRow(input.orderRow);
  const payment = paymentFromRow(input.paymentRow);
  const isFirstQualifying = order.status === 'pending';
  const alreadySucceeded = payment.status === 'succeeded';

  // This payment genuinely succeeded at the provider (created/pending →
  // succeeded; already-succeeded → no-change replay).
  const paymentStatus = await applyPaymentEvent(
    { db: input.db, log: input.log, now: input.now },
    input.paymentRow,
    event,
  );

  let finalPaymentStatus = paymentStatus;
  let orderStatus = input.orderRow.status;
  let granted = false;

  if (isFirstQualifying) {
    // First qualifying success: order pending → paid, grant exactly once (§13).
    orderStatus = await applyOrderEvent(
      { db: input.db, log: input.log, now: input.now },
      input.orderRow,
      event,
    );
    if (shouldGrantEntitlement(order, { ...payment, status: finalPaymentStatus })) {
      type GrantClient = Parameters<typeof grantEntitlement>[0];
      await grantEntitlement(input.db as unknown as GrantClient, {
        userId: order.userId,
        bookId: order.bookId,
        provider: payment.provider,
        providerRef: input.providerPaymentReference ?? null,
        sourceOrderId: order.id,
      });
      granted = true;
      input.log.info(
        {
          orderId: order.id,
          bookId: order.bookId,
          paymentId: input.paymentRow.id,
          provider: payment.provider,
        },
        'entitlement granted',
      );
    }
  } else if (!alreadySucceeded) {
    // The order was already paid/refunded/cancelled by an EARLIER successful
    // payment — this is a genuine second charge (double charge), not a replay of
    // this payment's own success. Mark the payment `duplicate_success` for the
    // finance review queue (§11.3/§13). NEVER grant a second entitlement and
    // NEVER overwrite the existing entitlement's provenance. The order status is
    // left as-is (it already reflects the first success).
    finalPaymentStatus = await applyPaymentEvent(
      { db: input.db, log: input.log, now: input.now },
      // Pass the row WITH the just-applied `succeeded` status so the state
      // machine sees the legal `succeeded → duplicate_success` arc (a fresh
      // attempt is created/pending, never directly duplicate_success).
      { ...input.paymentRow, status: paymentStatus },
      { type: 'duplicate_success_detected', merchantReference: input.merchantReference },
    );
    input.log.info(
      { paymentId: input.paymentRow.id, orderId: order.id, merchantReference: input.merchantReference },
      'double charge: second payment marked duplicate_success (finance review); no second grant',
    );
  }
  // else: alreadySucceeded + order not pending → replay of THIS payment's own
  // success; keep succeeded, no grant, no order change (idempotent).

  return { paymentStatus: finalPaymentStatus, orderStatus, granted };
}

/* ------------------------------------------------------------------------- *
 * Refund-confirmed path (§7) — refunds is the fact source; provider-confirmed
 * refund drives derived state. Shared by the finance `confirm_refund` action and
 * the reconciliation (Layer C) refund discovery.
 * ------------------------------------------------------------------------- */

export interface RefundRow {
  id: string;
  payment_id: string;
  provider: string;
  provider_refund_ref: string | null;
  amount_minor: number;
  currency: string;
  status: 'requested' | 'processing' | 'succeeded' | 'failed';
  reason_code: string | null;
  requested_by: string | null;
  provider_status_code: string | null;
  requested_at: string;
  completed_at: string | null;
}

export function refundFromRow(row: RefundRow): Refund {
  return {
    id: row.id,
    paymentId: row.payment_id,
    provider: row.provider as Refund['provider'],
    providerRefundRef: row.provider_refund_ref,
    amount: moneyOf(row.amount_minor, row.currency),
    status: row.status,
    reasonCode: row.reason_code,
    requestedBy: row.requested_by,
    providerStatusCode: row.provider_status_code,
    requestedAt: row.requested_at,
    completedAt: row.completed_at,
  };
}

export async function loadRefundById(db: DbClient, id: string): Promise<RefundRow | null> {
  const { data, error } = await db.from('refunds').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`refund lookup failed: ${error.message}`);
  return (data as unknown as RefundRow | null) ?? null;
}

export async function loadRequestedRefundForPayment(
  db: DbClient,
  paymentId: string,
): Promise<RefundRow | null> {
  const { data, error } = await db
    .from('refunds')
    .select('*')
    .eq('payment_id', paymentId)
    .in('status', ['requested', 'processing'])
    .order('requested_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`refund lookup failed: ${error.message}`);
  return (data as unknown as RefundRow | null) ?? null;
}

export interface ConfirmRefundFlowInput {
  db: DbClient;
  log: Logger;
  now: () => Date;
  /** finance_admin actor for the audit log (undefined for scheduled jobs). */
  actor?: string | null;
}

export interface ConfirmRefundResult {
  refundId: string;
  refundStatus: Refund['status'];
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  entitlementRevoked: boolean;
  alreadyConfirmed: boolean;
}

/**
 * Apply a provider-confirmed refund (§7.1): mark the `refunds` row `succeeded`
 * (the fact source), then transition derived state via `applyConfirmedRefund`:
 *
 * - the refunded payment is the entitlement-bearing (primary) payment
 *   (`payments.status = 'succeeded'`) → payment `refunded`, order `refunded`,
 *   entitlement `revoked` (reason 'refund', audit row preserved);
 * - the refunded payment is a `duplicate_success` (non-entitlement-bearing) →
 *   payment `refunded` only; order stays `paid`, entitlement stays `active`.
 *
 * Idempotent: an already-`succeeded` refund is a no-op. Never revokes entitlement
 * before a provider-confirmed refund (§7.2).
 */
export async function confirmRefund(
  ctx: ConfirmRefundFlowInput,
  refundId: string,
): Promise<ConfirmRefundResult> {
  const refundRow = await loadRefundById(ctx.db, refundId);
  if (!refundRow) {
    throw new Error(`refund ${refundId} not found`);
  }
  if (refundRow.status === 'succeeded') {
    return {
      refundId,
      refundStatus: 'succeeded',
      paymentStatus: 'refunded',
      orderStatus: 'refunded',
      entitlementRevoked: true,
      alreadyConfirmed: true,
    };
  }

  const paymentRow = await loadPaymentById(ctx.db, refundRow.payment_id);
  if (!paymentRow) {
    throw new Error(`payment ${refundRow.payment_id} not found for refund ${refundId}`);
  }
  const orderRow = await loadOrder(ctx.db, paymentRow.order_id);
  if (!orderRow) {
    throw new Error(`order ${paymentRow.order_id} not found for refund ${refundId}`);
  }

  // §7.1: the entitlement-bearing (primary) payment is the non-duplicate
  // `succeeded` payment; a `duplicate_success` refund must NOT revoke ownership.
  const isPrimaryPayment = paymentRow.status === 'succeeded';

  const nowIso = ctx.now().toISOString();
  const { error: refundUpdateError } = await ctx.db
    .from('refunds')
    .update({ status: 'succeeded', completed_at: nowIso })
    .eq('id', refundId);
  if (refundUpdateError) {
    throw new Error(`refund confirm failed: ${refundUpdateError.message}`);
  }

  const confirmedRefund = { ...refundFromRow(refundRow), status: 'succeeded' as const };
  const decision = applyConfirmedRefund(confirmedRefund, isPrimaryPayment);

  const paymentStatus = await applyPaymentEvent(
    { db: ctx.db, log: ctx.log, now: ctx.now },
    paymentRow,
    { type: 'refund_confirmed', merchantReference: paymentRow.provider_merchant_ref, completedAt: nowIso },
  );

  let orderStatus = orderRow.status;
  let entitlementRevoked = false;
  if (decision.kind === 'revoke_entitlement') {
    orderStatus = await applyOrderEvent(
      { db: ctx.db, log: ctx.log, now: ctx.now },
      orderRow,
      { type: 'refund_confirmed', merchantReference: paymentRow.provider_merchant_ref, completedAt: nowIso },
    );
    const { error: revokeError } = await ctx.db
      .from('book_entitlement')
      .update({
        status: 'revoked',
        revoked_at: nowIso,
        revocation_reason: 'refund',
      })
      .eq('source_order_id', orderRow.id)
      .eq('status', 'active');
    if (revokeError) {
      throw new Error(`entitlement revoke failed: ${revokeError.message}`);
    }
    entitlementRevoked = true;
  }

  if (ctx.actor) {
    const { error: auditError } = await ctx.db.from('admin_audit_log').insert({
      actor: ctx.actor,
      action: 'refund.confirmed',
      entity_type: 'refund',
      entity_id: refundId,
      before_state: { status: refundRow.status },
      after_state: {
        status: 'succeeded',
        payment_status: paymentStatus,
        order_status: orderStatus,
        entitlement_revoked: entitlementRevoked,
      },
    });
    if (auditError) {
      ctx.log.error({ error: auditError.message }, 'admin_audit_log insert failed');
    }
  }

  ctx.log.info(
    {
      refundId,
      paymentId: paymentRow.id,
      orderId: orderRow.id,
      isPrimaryPayment,
      decision: decision.kind,
      entitlementRevoked,
    },
    'provider-confirmed refund applied',
  );

  return {
    refundId,
    refundStatus: 'succeeded',
    paymentStatus,
    orderStatus,
    entitlementRevoked,
    alreadyConfirmed: false,
  };
}
