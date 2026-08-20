/**
 * Shared payment orchestration core (decision-record §11.3 / §13 / §4.5).
 *
 * Owns the ONLY state-mutation paths used by the Edge Functions: applying a
 * `PaymentDomainEvent` to a payment / order via the pure state machine
 * (`src/lib/payments/state.ts`) and the verified-success path (payment
 * succeeded → order paid → grant entitlement exactly once in one locked
 * Postgres transaction, decision-record §13). Imported by the ecpay-callback and
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
  PaymentMethod,
  PaymentStatus,
  Refund,
} from '../../../src/lib/payments/contract.ts';
import { nextOrderStatus, nextPaymentStatus, type PaymentDomainEvent } from '../../../src/lib/payments/state.ts';
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
  customer_email_snapshot?: string;
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
  provider_checkout_ref?: string | null;
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
  if (row.method !== 'credit' && row.method !== 'paypal') {
    throw new Error(`unsupported persisted payment method: ${row.method}`);
  }
  const method: PaymentMethod = row.method;
  return {
    id: row.id,
    orderId: row.order_id,
    provider: row.provider as PaymentAttempt['provider'],
    providerMerchantRef: row.provider_merchant_ref,
    providerPaymentRef: row.provider_payment_ref,
    amount: moneyOf(row.amount_minor, row.currency),
    method,
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

const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'created',
  'pending',
  'verification_pending',
  'succeeded',
  'failed',
  'duplicate_success',
  'refunded',
];

const ORDER_STATUSES: readonly OrderStatus[] = ['pending', 'paid', 'refunded', 'cancelled'];

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === 'string' && PAYMENT_STATUSES.includes(value as PaymentStatus);
}

function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && ORDER_STATUSES.includes(value as OrderStatus);
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

export async function loadPaymentByProviderPaymentRef(
  db: DbClient,
  provider: string,
  ref: string,
): Promise<PaymentRow | null> {
  const { data, error } = await db
    .from('payments')
    .select('*')
    .eq('provider', provider)
    .eq('provider_payment_ref', ref)
    .maybeSingle();
  if (error) throw new Error(`payment lookup failed: ${error.message}`);
  return (data as unknown as PaymentRow | null) ?? null;
}

/** Lookup by the provider checkout/session id, which remains stable after capture. */
export async function loadPaymentByProviderCheckoutRef(
  db: DbClient,
  provider: string,
  ref: string,
): Promise<PaymentRow | null> {
  const { data, error } = await db
    .from('payments')
    .select('*')
    .eq('provider', provider)
    .eq('provider_checkout_ref', ref)
    .maybeSingle();
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
      // Provider-neutral: the confirmed status code comes from the snapshot
      // (ECPay '1', PayPal 'COMPLETED'); the message never names a provider.
      patch.provider_status_code = event.rawStatusCode ?? paymentRow.provider_status_code ?? '1';
      patch.provider_status_message = 'payment confirmed';
      if (next === 'succeeded') patch.paid_at = event.paidAt ?? nowIso;
      break;
    case 'payment_failed':
      patch.last_verified_at = nowIso;
      patch.provider_status_code = event.rawStatusCode ?? paymentRow.provider_status_code;
      patch.provider_status_message = 'payment failed';
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
    { paymentId: paymentRow.id, merchantReference: event.merchantReference, status: next, event: event.type },
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
  paymentRow: PaymentRow;
  merchantReference: string;
  providerPaymentReference?: string;
  paidAt?: string;
  /** Provider status code from the confirmed snapshot (ECPay '1', PayPal 'COMPLETED'). */
  rawStatusCode?: string;
}

export interface ApplyVerifiedSuccessResult {
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  granted: boolean;
}

/**
 * Apply a verified paid result through the service-role-only Postgres RPC. The
 * database locks the Payment and Order rows and commits Payment + Order +
 * Entitlement together, so concurrent successes serialize and only the first
 * qualifying payment grants (§4.5/§13).
 */
export async function applyVerifiedSuccess(
  input: ApplyVerifiedSuccessInput,
): Promise<ApplyVerifiedSuccessResult> {
  const { data, error } = await input.db.rpc('finalize_payment_success', {
    p_payment_id: input.paymentRow.id,
    p_provider_payment_ref: input.providerPaymentReference ?? null,
    p_paid_at: input.paidAt ?? input.now().toISOString(),
    p_provider_status_code: input.rawStatusCode ?? null,
  });
  if (error || !data) {
    throw new Error(`verified success transaction failed: ${error?.message ?? 'no result returned'}`);
  }

  const paymentStatus = data.payment_status as PaymentStatus;
  const orderStatus = data.order_status as OrderStatus;
  const granted = data.granted === true;
  if (!isPaymentStatus(paymentStatus) || !isOrderStatus(orderStatus)) {
    throw new Error('verified success transaction returned invalid status');
  }

  input.log.info(
    {
      paymentId: input.paymentRow.id,
      merchantReference: input.merchantReference,
      paymentStatus,
      orderStatus,
      granted,
    },
    'verified payment transaction applied',
  );
  return { paymentStatus, orderStatus, granted };
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

interface FinalizeRefundInput {
  refundId?: string;
  paymentId?: string;
  providerRefundRef?: string;
  providerStatusCode?: string;
}

async function finalizeRefundSuccess(
  ctx: ConfirmRefundFlowInput,
  input: FinalizeRefundInput,
  beforeStatus: Refund['status'] | null,
): Promise<ConfirmRefundResult> {
  const { data, error } = await ctx.db.rpc('finalize_refund_success', {
    p_refund_id: input.refundId ?? null,
    p_payment_id: input.paymentId ?? null,
    p_provider_refund_ref: input.providerRefundRef ?? null,
    p_provider_status_code: input.providerStatusCode ?? null,
    p_completed_at: ctx.now().toISOString(),
  });
  if (error || !data) {
    throw new Error(`refund transaction failed: ${error?.message ?? 'no result returned'}`);
  }

  const refundStatus = data.refund_status;
  const paymentStatus = data.payment_status as PaymentStatus;
  const orderStatus = data.order_status as OrderStatus;
  if (refundStatus !== 'succeeded' || !isPaymentStatus(paymentStatus) || !isOrderStatus(orderStatus)) {
    throw new Error('refund transaction returned invalid status');
  }

  const result: ConfirmRefundResult = {
    refundId: String(data.refund_id),
    refundStatus,
    paymentStatus,
    orderStatus,
    entitlementRevoked: data.entitlement_revoked === true,
    alreadyConfirmed: data.already_confirmed === true,
  };

  if (ctx.actor) {
    const { error: auditError } = await ctx.db.from('admin_audit_log').insert({
      actor: ctx.actor,
      action: 'refund.confirmed',
      entity_type: 'refund',
      entity_id: result.refundId,
      before_state: { status: beforeStatus },
      after_state: {
        status: result.refundStatus,
        payment_status: result.paymentStatus,
        order_status: result.orderStatus,
        entitlement_revoked: result.entitlementRevoked,
      },
    });
    if (auditError) {
      ctx.log.error({ error: auditError.message }, 'admin_audit_log insert failed');
    }
  }

  ctx.log.info(
    {
      refundId: result.refundId,
      paymentId: input.paymentId ?? null,
      paymentStatus: result.paymentStatus,
      orderStatus: result.orderStatus,
      entitlementRevoked: result.entitlementRevoked,
      alreadyConfirmed: result.alreadyConfirmed,
    },
    'provider-confirmed refund transaction applied',
  );
  return result;
}

/** Finalize an existing finance/operator refund through one DB transaction. */
export async function confirmRefund(
  ctx: ConfirmRefundFlowInput,
  refundId: string,
  providerResult: { providerRefundRef?: string; providerStatusCode?: string } = {},
): Promise<ConfirmRefundResult> {
  const refundRow = await loadRefundById(ctx.db, refundId);
  if (!refundRow) throw new Error(`refund ${refundId} not found`);
  return finalizeRefundSuccess(
    ctx,
    {
      refundId,
      providerRefundRef: providerResult.providerRefundRef,
      providerStatusCode: providerResult.providerStatusCode,
    },
    refundRow.status,
  );
}

/** Record and finalize a provider-originated full refund/reversal atomically. */
export async function confirmProviderRefund(
  ctx: ConfirmRefundFlowInput,
  paymentId: string,
  providerRefundRef?: string,
  providerStatusCode?: string,
): Promise<ConfirmRefundResult> {
  return finalizeRefundSuccess(
    ctx,
    { paymentId, providerRefundRef, providerStatusCode },
    null,
  );
}
