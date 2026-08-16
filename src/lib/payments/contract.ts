/**
 * Shared payment / compliance contracts — architecture lock for #9 / #25.
 *
 * Single source of truth for the provider-neutral payment domain contracts
 * defined by `docs/payments/decision-record.md` (canonical) and this repo's
 * reconciled architecture. Pure TS, zero runtime dependencies; imported by the
 * DB layer (A1), the pure domain (A2), the ECPay adapter (A3), the Supabase
 * Edge Functions (A4), and the checkout / compliance UI (B2).
 *
 * DO NOT modify any contract here without updating this header and
 * coordinating across every consumer — sub-agents must not invent or change
 * these shared contracts on their own.
 */

/* ------------------------------------------------------------------------- *
 * Money (§8.1)
 * ------------------------------------------------------------------------- */

export interface Money {
  /** Integer canonical amount in the currency's minor unit (JS safe integer, >= 0). */
  amount: number;
  /** Uppercase ISO 4217 code (registry-validated via `src/content/iso4217.ts`). */
  currency: string;
}

export function isSafeMoney(money: Money): boolean {
  return Number.isSafeInteger(money.amount) && money.amount >= 0;
}

/* ------------------------------------------------------------------------- *
 * Provider registry / status vocabulary (§10.2, §11.3, §12)
 * ------------------------------------------------------------------------- */

export type PaymentProvider = 'ecpay' | 'newebpay' | 'stripe' | 'paypal';

export type PaymentStatus =
  | 'created'
  | 'pending'
  | 'verification_pending'
  | 'succeeded'
  | 'failed'
  | 'duplicate_success'
  | 'refunded';

export type OrderStatus = 'pending' | 'paid' | 'refunded' | 'cancelled';

export type EntitlementStatus = 'active' | 'revoked';

/* ------------------------------------------------------------------------- *
 * Order (§12) — amount / currency / published_revision immutable after creation
 * ------------------------------------------------------------------------- */

export interface Order {
  id: string;
  userId: string;
  bookId: string;
  /** Historical book title snapshot at purchase time. */
  itemNameSnapshot: string;
  /** Immutable catalog snapshot id (e.g. "keigo-essentials@e1-r1"). */
  publishedRevision: string;
  /** Immutable domain amount (canonical Money). */
  amount: Money;
  status: OrderStatus;
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
}

/* ------------------------------------------------------------------------- *
 * PaymentAttempt (§12)
 * ------------------------------------------------------------------------- */

export interface PaymentAttempt {
  id: string;
  orderId: string;
  provider: PaymentProvider;
  /** Provider merchant reference (ECPay MerchantTradeNo); unique per attempt, never reused. */
  providerMerchantRef: string;
  /** Provider payment reference (ECPay TradeNo); null until known. */
  providerPaymentRef: string | null;
  /** Immutable amount. */
  amount: Money;
  method: 'credit';
  status: PaymentStatus;
  providerStatusCode: string | null;
  /** Sanitized provider status message (log redaction; never raw secrets / card data). */
  providerStatusMessage: string | null;
  createdAt: string;
  paidAt: string | null;
  lastVerifiedAt: string | null;
  providerFeeAmount: Money | null;
  reconciliationStatus: 'matched' | 'mismatch' | null;
}

/* ------------------------------------------------------------------------- *
 * Refund (§7) — `refunds` is the source of truth; MVP full refund only
 * ------------------------------------------------------------------------- */

export type RefundStatus = 'requested' | 'processing' | 'succeeded' | 'failed';

export interface Refund {
  id: string;
  paymentId: string;
  provider: PaymentProvider;
  providerRefundRef: string | null;
  /** MVP: must equal the refundable full amount. */
  amount: Money;
  status: RefundStatus;
  reasonCode: string | null;
  requestedBy: string | null;
  providerStatusCode: string | null;
  requestedAt: string;
  completedAt: string | null;
}

/* ------------------------------------------------------------------------- *
 * PaymentEvent (§12) — reliability ledger; UNIQUE(provider, event_fingerprint)
 * ------------------------------------------------------------------------- */

export interface PaymentEvent {
  id: string;
  provider: PaymentProvider;
  paymentId: string | null;
  providerMerchantRef: string;
  /** SHA-256 hex of the canonical verified payload. */
  eventFingerprint: string;
  eventType: string;
  signatureValid: boolean;
  /** Allowlisted financial / status fields only — never a raw provider payload dump. */
  sanitizedPayloadJson: unknown;
  receivedAt: string;
  processedAt: string | null;
  processingResult: string | null;
}

/* ------------------------------------------------------------------------- *
 * Verified provider event / snapshot (§10.2)
 * ------------------------------------------------------------------------- */

export type ProviderSnapshotStatus = 'pending' | 'succeeded' | 'failed' | 'refunded' | 'unknown';

/** A callback whose CheckMacValue (+ local invariants) passed; provider-normalized. */
export interface VerifiedProviderEvent {
  provider: PaymentProvider;
  providerMerchantRef: string;
  providerPaymentRef?: string;
  eventFingerprint: string;
  status: 'succeeded' | 'failed' | 'unknown';
  amount?: Money;
  paidAt?: string;
  rawStatusCode?: string;
}

export interface ProviderPaymentSnapshot {
  provider: PaymentProvider;
  merchantReference: string;
  providerPaymentReference?: string;
  status: ProviderSnapshotStatus;
  amount: Money;
  paidAt?: string;
  rawStatusCode?: string;
  /**
   * The raw QueryTradeInfo response fields parsed by `confirmPayment`, so the
   * success predicate can genuinely cross-check the QUERY response (its own
   * MerchantTradeNo / TradeNo / TradeAmt / TradeStatus) rather than re-checking
   * callback-derived values (§4.4).
   */
  queryResponse?: {
    merchantTradeNo?: string;
    tradeNo?: string;
    tradeAmt?: string;
    tradeStatus?: string;
  };
}

/* ------------------------------------------------------------------------- *
 * Adapter input / output types (§10.1)
 * ------------------------------------------------------------------------- */

export interface CreateCheckoutInput {
  orderId: string;
  paymentId: string;
  /** Server-generated merchant reference (ECPay MerchantTradeNo); never client-supplied. */
  merchantReference: string;
  amount: Money;
  itemNameSnapshot: string;
  /** ECPay Language value (CHT / JPN / ENG). */
  locale: string;
  returnUrl: string;
  orderResultUrl: string;
}

export interface CheckoutInstruction {
  /** URL the browser must full-page POST to (never iframe / modal). */
  action: string;
  /** Form fields (form-urlencoded), including provider signature. */
  fields: Record<string, string>;
  provider: PaymentProvider;
  merchantReference: string;
}

/** Raw form-urlencoded callback body parsed as key/value pairs (never JSON). */
export interface ProviderCallbackRequest {
  form: Record<string, string>;
  provider: PaymentProvider;
}

export interface RefundInput {
  paymentId: string;
  providerPaymentRef?: string;
  amount: Money;
  merchantReference: string;
}

export interface ProviderRefundResult {
  ok: boolean;
  providerRefundRef?: string;
  status: 'succeeded' | 'failed' | 'pending';
  rawStatusCode?: string;
}

export interface ReconciliationRange {
  /** ISO date (inclusive). */
  from: string;
  /** ISO date (inclusive). */
  to: string;
}

export interface ProviderReconciliationData {
  provider: PaymentProvider;
  entries: unknown[];
}

/* ------------------------------------------------------------------------- *
 * PaymentProviderAdapter (§10.2)
 *
 * The adapter only initiates / verifies / parses / normalizes / queries /
 * refunds. It NEVER directly updates Order / PaymentAttempt / Entitlement —
 * state mutation belongs to the orchestration layer.
 * ------------------------------------------------------------------------- */

export interface PaymentProviderAdapter {
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutInstruction>;
  verifyCallback(request: ProviderCallbackRequest): Promise<VerifiedProviderEvent>;
  confirmPayment(event: VerifiedProviderEvent): Promise<ProviderPaymentSnapshot>;
  refund(input: RefundInput): Promise<ProviderRefundResult>;
  reconcile?(input: ReconciliationRange): Promise<ProviderReconciliationData>;
}

/* ------------------------------------------------------------------------- *
 * Errors
 * ------------------------------------------------------------------------- */

/** ECPay only accepts integer TWD; a non-TWD amount is a hard refusal. */
export class UnsupportedCurrencyForProvider extends Error {
  constructor(provider: PaymentProvider) {
    super(`Unsupported currency for provider ${provider}`);
    this.name = 'UnsupportedCurrencyForProvider';
  }
}

/* ------------------------------------------------------------------------- *
 * Compliance evidence (#25 + #9)
 *
 * Order-linked immutable evidence; durably persisted in the SAME transaction
 * as Order creation, BEFORE redirecting to the payment provider.
 * ------------------------------------------------------------------------- */

export type Jurisdiction = 'TW' | 'JP';

export interface ComplianceEvidence {
  orderId: string;
  jurisdiction: Jurisdiction;
  /** BCP-47 locale, e.g. "zh-TW" | "ja". */
  locale: string;
  /** Version id of the notice text shown, e.g. "tw-7day-removal-notice-v1". */
  noticeVersion: string;
  /** Version id of the consent text shown, e.g. "tw-digital-content-consent-v1". */
  consentVersion: string;
  consentGranted: boolean;
  /** Immutable snapshot of the notice text actually displayed. */
  noticeTextSnapshot: string;
  /** Immutable snapshot of the consent text actually displayed. */
  consentTextSnapshot: string;
  /** Server-authoritative ISO-8601 timestamp. */
  consentTimestamp: string;
}

/* ------------------------------------------------------------------------- *
 * Japan tax-status configuration boundary (#25 pre-sale gate)
 *
 * `unresolved` is the fail-closed default: never apply a 10% consumption tax,
 * never claim tax-inclusive pricing, until explicitly resolved.
 * ------------------------------------------------------------------------- */

export type JapanConsumptionTaxStatus = 'unresolved' | 'taxable' | 'exempt';

export interface TaxConfig {
  japanConsumptionTaxStatus: JapanConsumptionTaxStatus;
}

export const DEFAULT_TAX_CONFIG: TaxConfig = {
  japanConsumptionTaxStatus: 'unresolved',
};

/* ------------------------------------------------------------------------- *
 * Purchase seam (§15)
 *
 * Client only sends `bookId`; amount / currency are never client-supplied.
 * `src/lib/purchase/types.ts` re-exports these so the existing seam does not
 * drift from this contract.
 * ------------------------------------------------------------------------- */

export interface PurchaseIntent {
  bookId: string;
  /**
   * Display-only metadata. NEVER sent to the server and NEVER used for
   * arithmetic (§8.3): the checkout executor sends only `bookId` (+ consent)
   * and the server prices from the authoritative `catalog`. Kept optional for
   * backward compatibility with display surfaces that still carry the label.
   */
  amount?: number;
  currency?: string;
}

export type PurchaseResult =
  | { ok: true; orderId: string; status: 'pending' | 'succeeded' | 'failed' | 'cancelled' }
  | {
      ok: false;
      reason: 'unavailable' | 'canceled' | 'failed' | 'consent_required' | 'signed_out';
      message?: string;
    };

export type PurchaseExecutor = (intent: PurchaseIntent) => Promise<PurchaseResult>;

/* ------------------------------------------------------------------------- *
 * Checkout / orders-status contract (A4 Edge Functions ↔ B2 UI)
 *
 * The browser sends ONLY `bookId` + the collected compliance consent (never a
 * price/amount). The checkout Edge Function reads the authoritative `catalog`,
 * creates the Order + `order_compliance` evidence in ONE transaction BEFORE
 * any provider redirect, then returns a signed provider checkout instruction.
 * ------------------------------------------------------------------------- */

/** Consent submitted by the client at checkout (persisted as order_compliance). */
export interface ConsentSubmission {
  jurisdiction: Jurisdiction;
  locale: string;
  noticeVersion: string;
  consentVersion: string;
  consentGranted: boolean;
  noticeTextSnapshot: string;
  consentTextSnapshot: string;
}

/** Checkout request body to `POST /functions/v1/checkout/books/:bookId`. */
export interface CheckoutRequest {
  bookId: string;
  consent?: ConsentSubmission;
}

/** Checkout response: the created order + the signed provider instruction. */
export interface CheckoutResponse {
  orderId: string;
  paymentId: string;
  instruction: CheckoutInstruction;
}

/** Order-status payload from `GET /functions/v1/orders-status/:orderId/status`. */
export interface OrderStatusResponse {
  orderId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus | null;
  bookId: string;
  amount: Money;
}
