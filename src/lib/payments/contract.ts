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

import type { Locale } from '../../i18n/locales';

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

export type PaymentMethod = 'credit' | 'paypal';

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
  /** Provider-authoritative checkout channel; never an inferred card funding source. */
  method: PaymentMethod;
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
  /** Provider refund/capture reference carried by a confirmed refund/reversal event. */
  providerRefundRef?: string;
  eventFingerprint: string;
  status: 'succeeded' | 'failed' | 'refunded' | 'unknown';
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
  /** Server-generated merchant reference; never client-supplied. */
  merchantReference: string;
  amount: Money;
  itemNameSnapshot: string;
  /**
   * Authoritative server callback URL (ECPay ReturnURL). Not used by PayPal —
   * its webhook is a server-configured endpoint, not a per-order callback.
   */
  returnUrl?: string;
  /**
   * Browser return target after provider payment / approval
   * (ECPay OrderResultURL / PayPal approval return_url). Never payment evidence.
   */
  orderResultUrl: string;
  /** Browser cancel target (PayPal cancel_url); ECPay ignores. */
  cancelUrl?: string;
  /** Provider display language (ECPay Language CHT/JPN/ENG); PayPal ignores. */
  locale?: string;
  /**
   * Previously persisted provider checkout/session id. When present, an adapter
   * may recover that exact provider resource but must never create a replacement
   * under the same local PaymentAttempt.
   */
  existingCheckoutReference?: string;
}

/**
 * Provider checkout instruction — a discriminated union over transport kinds so
 * the provider-neutral seam genuinely supports both ECPay form POST and PayPal
 * approval redirect (§17.1 / §21). The SERVER picks the transport by routing
 * currency → provider; the client only renders whatever instruction came back
 * and NEVER decides the provider, the price, or the payment-success state.
 */
export type CheckoutInstruction =
  | {
      kind: 'form-post';
      /** URL the browser must full-page POST to (never iframe / modal). */
      action: string;
      /** Form fields (form-urlencoded), including provider signature. */
      fields: Record<string, string>;
      provider: PaymentProvider;
      merchantReference: string;
      /** Provider payment reference known at checkout time (PayPal order id). */
      providerPaymentReference?: string;
    }
  | {
      kind: 'redirect';
      /** URL the browser must navigate to (PayPal approval link). */
      url: string;
      provider: PaymentProvider;
      merchantReference: string;
      /** Provider payment reference known at checkout time (PayPal order id). */
      providerPaymentReference?: string;
    };

/**
 * Raw provider callback / webhook request. A discriminated union over transport
 * kinds: ECPay ReturnURL callbacks are `application/x-www-form-urlencoded`
 * (`form`); PayPal webhooks are JSON and carry the exact raw body + transmission
 * headers the signature verification needs (§21).
 */
export type ProviderCallbackRequest =
  | {
      provider: 'ecpay';
      /** Raw form-urlencoded callback body parsed as key/value pairs (never JSON). */
      form: Record<string, string>;
    }
  | {
      provider: 'paypal';
      /** Exact raw webhook body bytes (byte-for-byte; required for verification). */
      body: string;
      /** Webhook transmission headers (PAYPAL-TRANSMISSION-* / PayPal-Signature). */
      headers: Record<string, string>;
      /** Content-Type of the webhook body. */
      contentType?: string;
    };

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

/** Existing provider state needs authoritative repair/status polling, not a new handoff. */
export class CheckoutVerificationPendingError extends Error {
  constructor(message = 'checkout requires authoritative provider verification') {
    super(message);
    this.name = 'CheckoutVerificationPendingError';
  }
}

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

/**
 * Consumer-jurisdiction resolution state. `unresolved` is the fail-closed
 * default: jurisdiction is NEVER inferred from the UI locale or the payment
 * currency/provider — it is an explicit consumer self-declaration made at
 * checkout. An unresolved jurisdiction blocks checkout before any payment
 * handoff (reviewer finding: locale-derived jurisdiction is unreachable).
 */
export type Jurisdiction = 'TW' | 'JP' | 'unresolved';

/** A resolved jurisdiction a consumer may declare and an Order may persist. */
export type ResolvedJurisdiction = 'TW' | 'JP';

/** True only for an explicitly declared TW/JP jurisdiction (unresolved fails closed). */
export function isResolvedJurisdiction(jurisdiction: Jurisdiction): jurisdiction is ResolvedJurisdiction {
  return jurisdiction === 'TW' || jurisdiction === 'JP';
}

export interface ComplianceEvidence {
  orderId: string;
  jurisdiction: ResolvedJurisdiction;
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
  /** The declared consumer jurisdiction — always resolved; `unresolved` is the ABSENCE of a submission. */
  jurisdiction: ResolvedJurisdiction;
  locale: string;
  /** Buyer-facing UI/email locale, separate from the fixed legal-copy locale above. */
  presentationLocale: Locale;
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

/**
 * Immutable order-linked compliance snapshot, persisted with the Order at
 * creation and exposed by the orders-status contract for the receipt.
 *
 * Server-authoritative by design: `jurisdiction` is the consumer declaration
 * frozen at purchase; `japanConsumptionTaxStatus` is the `platform_tax_config`
 * value AT PURCHASE — it is never re-derived from the live config or the client,
 * so a later operator change to the platform tax config cannot rewrite a
 * historical receipt, and currency/provider never determine tax treatment.
 */
export interface OrderComplianceSnapshot {
  /** Consumer jurisdiction frozen at purchase (TW/JP; 'unresolved' only as a defensive backfill). */
  jurisdiction: Jurisdiction;
  /** Japan consumption-tax status frozen at purchase (unresolved ⇒ no JP tax treatment). */
  japanConsumptionTaxStatus: JapanConsumptionTaxStatus;
}

/** Order-status payload from `GET /functions/v1/orders-status/:orderId/status`. */
export interface OrderStatusResponse {
  orderId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus | null;
  bookId: string;
  /** Immutable title snapshot from the authoritative server catalog at checkout. */
  itemName: string;
  amount: Money;
  paidAt: string | null;
  paymentProvider: PaymentProvider | null;
  paymentMethod: string | null;
  deliveryMethod: 'library';
  deliveryStatus: 'pending' | 'available' | 'revoked';
  /** Immutable server snapshot required by the receipt (jurisdiction + tax treatment). */
  compliance: OrderComplianceSnapshot;
}
