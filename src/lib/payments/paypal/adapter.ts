/**
 * PayPal USD adapter (decision-record §17.2 / §18 / §21).
 *
 * Implements `PaymentProviderAdapter` for PayPal REST API v2 Orders (INTENT=
 * CAPTURE) with a server-side OAuth2 client-credentials token, an approval-URL
 * checkout redirect, verified webhook ingestion (`POST /v1/notifications/
 * verify-webhook-signature`), server capture, full refund, and reporting-based
 * reconciliation.
 *
 * BOUNDARY (§10): this adapter ONLY initiates / verifies / parses / normalizes /
 * queries / captures / refunds. It NEVER updates `Order` / `PaymentAttempt` /
 * `Entitlement` and holds no DB / global state. The only network it performs is
 * the REST calls below (bounded by finite timeouts).
 *
 * SECRETS (§15): `clientId` / `clientSecret` are server-only and passed to the
 * constructor from server env at the Edge Function boundary (e.g.
 * `Deno.env.get('PAYPAL_CLIENT_SECRET')`). They are NEVER accepted from or
 * emitted to client-facing inputs, never logged, and never exported.
 *
 * CURRENCY (§8.1, §21): PayPal Orders v2 accepts USD as a major-unit decimal
 * string (e.g. `"19.99"`). The canonical domain `Money.amount` is in minor units
 * (USD 19.99 → `{ amount: 1999, currency: 'USD' }`), so the adapter converts via
 * `minorUnitFor('USD')` before sending `amount.value`. Any non-USD amount is a
 * hard refusal: `UnsupportedCurrencyForProvider('paypal')`.
 *
 * IDEMPOTENCY (§13, §21): provider write requests (create order, capture,
 * refund) carry a stable `PayPal-Request-Id`; replay/duplicate/idempotency of
 * events is orchestration + DB responsibility (`UNIQUE(provider,
 * event_fingerprint)`), not the adapter's.
 */

import {
  CheckoutVerificationPendingError,
  UnsupportedCurrencyForProvider,
  type CheckoutInstruction,
  type CreateCheckoutInput,
  type Money,
  type PaymentProvider,
  type PaymentProviderAdapter,
  type ProviderCallbackRequest,
  type ProviderPaymentSnapshot,
  type ProviderReconciliationData,
  type ProviderRefundResult,
  type ReconciliationRange,
  type RefundInput,
  type VerifiedProviderEvent,
} from '../contract.ts';
import { isSafeMoney, minorUnitFor } from '../money.ts';
import { sha256Hex } from '../crypto.ts';
import { resolvePaypalEnv, type PaypalEnv, type PaypalUrls } from './urls.ts';
import {
  PAYPAL_CAPTURE_EVENT_STATUS,
  PAYPAL_REFUND_EVENT_STATUS,
  type PaypalCapture,
  type PaypalOrder,
  type PaypalReconciliationEntry,
  type PaypalWebhookEvent,
} from './types.ts';

/* ------------------------------------------------------------------------- *
 * Constants / errors
 * ------------------------------------------------------------------------- */

/** Default finite deadline for PayPal REST calls (no unbounded waits). */
export const PAYPAL_REQUEST_TIMEOUT_MS = 15_000;

/** Conservative redirect window below PayPal Orders' default six-hour bound. */
export const PAYPAL_APPROVAL_MAX_AGE_MS = 5 * 60 * 60 * 1000;

/** `PayPal-Request-Id` prefix for provider-side idempotency keys (§21). */
export const PAYPAL_REQUEST_ID_PREFIX = 'bjh';

/** Transaction-search page size (PayPal max is 500; §21/B4). */
export const RECONCILE_PAGE_SIZE = 500;

/**
 * Hard cap on reconciliation pages. A range that needs more pages than this is
 * never silently truncated — the caller must narrow the range.
 */
export const RECONCILE_MAX_PAGES = 20;
export const RECONCILE_MAX_RANGE_DAYS = 31;

/** Thrown when a webhook's transmission signature fails verification. */
export class InvalidWebhookSignatureError extends Error {
  constructor() {
    super('PayPal webhook signature verification failed');
    this.name = 'InvalidWebhookSignatureError';
  }
}

/** Thrown when a reconciliation range exceeds the provider/API hard limits. */
export class ReconciliationIncompleteError extends Error {
  constructor(range: ReconciliationRange, pagesNeeded: number) {
    super(
      `PayPal reconciliation range ${range.from}..${range.to} is incomplete (needs ${pagesNeeded} pages, cap ${RECONCILE_MAX_PAGES}); narrow the range`,
    );
    this.name = 'ReconciliationIncompleteError';
  }
}

export class InvalidReconciliationRangeError extends Error {
  constructor(range: ReconciliationRange) {
    super(`PayPal reconciliation range ${range.from}..${range.to} must be valid ISO dates spanning at most 31 days`);
    this.name = 'InvalidReconciliationRangeError';
  }
}

/** Thrown when a PayPal REST call returns a non-2xx (HTTP-level failure). */
export class PaypalApiError extends Error {
  readonly status: number;
  readonly debugId: string | null;

  constructor(context: string, status: number, body: string) {
    let debugId: string | null = null;
    let message = body;
    try {
      const parsed = JSON.parse(body) as { message?: string; debug_id?: string; name?: string };
      message = parsed.message ?? parsed.name ?? body;
      debugId = parsed.debug_id ?? null;
    } catch {
      // non-JSON error body — keep the raw text as the message
    }
    super(`PayPal ${context} failed (${status}): ${message}`);
    this.name = 'PaypalApiError';
    this.status = status;
    this.debugId = debugId;
  }
}

/* ------------------------------------------------------------------------- *
 * Transport / config
 * ------------------------------------------------------------------------- */

/** Minimal HTTP transport seam — the ONLY place the adapter performs I/O. */
export interface PaypalTransport {
  request(
    method: 'GET' | 'POST',
    url: string,
    init?: { body?: string; headers?: Record<string, string>; timeoutMs?: number },
  ): Promise<{ status: number; body: string }>;
}

/** Default transport backed by global `fetch` with an AbortController deadline. */
export function createDefaultPaypalTransport(): PaypalTransport {
  return {
    async request(method, url, init = {}) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? PAYPAL_REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          method,
          headers: init.headers,
          body: init.body,
          signal: controller.signal,
        });
        return { status: res.status, body: await res.text() };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export interface PaypalAdapterConfig {
  /** PayPal REST app client id (server-only; never client-facing). */
  clientId: string;
  /** PayPal REST app client secret (server-only; never client-facing). */
  clientSecret: string;
  /** Server-configured webhook id used by verify-webhook-signature. */
  webhookId: string;
  /** `'sandbox'` or `'prod'`; server adapter construction rejects undefined. */
  env?: PaypalEnv;
  /** Injectable clock for deterministic token expiry (tests). */
  now?: () => Date;
  /** Injectable transport; defaults to `createDefaultPaypalTransport()`. */
  transport?: PaypalTransport;
}

/* ------------------------------------------------------------------------- *
 * Pure helpers (exported for tests / downstream use)
 * ------------------------------------------------------------------------- */

/**
 * Convert the canonical USD `Money` (minor units, §8.1) to the PayPal decimal
 * major-unit string (e.g. `{ amount: 1999, currency: 'USD' }` → `"19.99"`).
 * USD is a 2-decimal currency (never zero-decimal).
 */
export function usdMajorFromCanonical(money: Money): string {
  const minor = minorUnitFor('USD');
  if (money.currency !== 'USD' || !Number.isSafeInteger(money.amount) || money.amount <= 0) {
    throw new Error(`PayPal value must be a positive USD amount, got ${JSON.stringify(money)}`);
  }
  const whole = Math.floor(money.amount / minor);
  const fraction = String(money.amount % minor).padStart(2, '0');
  return `${whole}.${fraction}`;
}

/**
 * Convert a PayPal decimal major-unit string to canonical `Money` (minor units).
 * Throws on a non-USD currency or an unsafe / negative result.
 */
export function paypalMoneyFromString(value: string, currency: string): Money {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (currency !== 'USD' || !match || value.length > 32) {
    throw new Error(`PayPal amount must be a non-negative USD decimal, got ${JSON.stringify({ value, currency })}`);
  }
  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? '').padEnd(2, '0') || '0');
  const minor = whole * BigInt(minorUnitFor('USD')) + fraction;
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`PayPal amount is not a safe integer in minor units: ${JSON.stringify({ value, currency })}`);
  }
  return { amount: Number(minor), currency: 'USD' };
}

function isTrustedApprovalUrl(href: string, checkoutBase: string): boolean {
  try {
    const candidate = new URL(href);
    const expected = new URL(checkoutBase);
    return candidate.protocol === 'https:' && candidate.origin === expected.origin;
  } catch {
    return false;
  }
}

/** Money-moving PayPal T-codes that remove a prior captured payment. */
const PAYPAL_REFUND_OR_REVERSAL_CODES = new Set(['T1100', 'T1106', 'T1107', 'T1120', 'T1201']);

/**
 * Normalize one Transaction Search row. Malformed/unsupported currencies are
 * dropped rather than guessed; the scheduled matcher then remains fail closed.
 */
export function normalizePaypalReconciliationEntry(raw: unknown): PaypalReconciliationEntry | null {
  if (raw === null || typeof raw !== 'object') return null;
  const transactionInfo = (raw as { transaction_info?: unknown }).transaction_info;
  if (transactionInfo === null || typeof transactionInfo !== 'object') return null;
  const info = transactionInfo as Record<string, unknown>;
  const transactionId = typeof info.transaction_id === 'string' ? info.transaction_id : '';
  const eventCode = typeof info.transaction_event_code === 'string' ? info.transaction_event_code : '';
  const status = typeof info.transaction_status === 'string' ? info.transaction_status : '';
  const rawAmount = info.transaction_amount;
  if (!transactionId || !eventCode || !status || rawAmount === null || typeof rawAmount !== 'object') return null;
  const money = rawAmount as Record<string, unknown>;
  if (typeof money.currency_code !== 'string' || typeof money.value !== 'string') return null;

  let amount: Money;
  try {
    amount = paypalMoneyFromString(money.value.replace(/^-/, ''), money.currency_code);
  } catch {
    return null;
  }

  const isRefund = PAYPAL_REFUND_OR_REVERSAL_CODES.has(eventCode) || status === 'V';
  const providerReference = typeof info.paypal_reference_id === 'string' ? info.paypal_reference_id : undefined;
  const referenceTransactionId = isRefund ? (providerReference || (status === 'V' ? transactionId : undefined)) : undefined;
  if (isRefund && !referenceTransactionId) return null;

  return {
    kind: isRefund ? 'refund' : 'payment',
    transactionId,
    ...(referenceTransactionId ? { referenceTransactionId } : {}),
    eventCode,
    status,
    amount: amount as { amount: number; currency: 'USD' },
    ...(typeof info.transaction_updated_date === 'string'
      ? { occurredAt: info.transaction_updated_date }
      : {}),
  };
}

/**
 * Allowlisted webhook evidence fields persisted into `payment_events`
 * (`sanitized_payload_json`) — financial / status fields only, never a raw
 * payload dump (§12).
 */
export function sanitizePaypalEvent(event: PaypalWebhookEvent): Record<string, unknown> {
  return {
    id: event.id ?? null,
    event_type: event.event_type ?? null,
    resource_type: event.resource_type ?? null,
    resource_status: event.resource?.status ?? null,
    resource_custom_id: event.resource?.custom_id ?? null,
    resource_amount: event.resource?.amount ?? null,
    order_id: event.resource?.supplementary_data?.related_ids?.order_id ?? null,
  };
}

/** Case-insensitive header lookup (request headers are stored lowercased). */
function header(headers: Record<string, string>, name: string): string | undefined {
  return headers[name.toLowerCase()];
}

/* ------------------------------------------------------------------------- *
 * Adapter
 * ------------------------------------------------------------------------- */

export class PaypalPaymentProviderAdapter implements PaymentProviderAdapter {
  readonly provider: PaymentProvider = 'paypal';

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly webhookId: string;
  private readonly urls: PaypalUrls;
  private readonly now: () => Date;
  private readonly transport: PaypalTransport;
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(config: PaypalAdapterConfig) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.webhookId = config.webhookId;
    this.urls = resolvePaypalEnv(config.env);
    this.now = config.now ?? (() => new Date());
    this.transport = config.transport ?? createDefaultPaypalTransport();
  }

  /**
   * Build the Orders v2 checkout instruction (§21). Refuses any non-USD amount.
   * Creates a CAPTURE-intent order with a stable `PayPal-Request-Id`, the local
   * merchant reference as `custom_id` (so the webhook can map back to the local
   * payment), and returns the buyer-facing approval URL as a `redirect`
   * instruction. The PayPal order id is exposed as `providerPaymentReference` so
   * the orchestration layer can persist it (browser-return / repair lookup).
   */
  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutInstruction> {
    if (input.amount.currency !== 'USD') {
      throw new UnsupportedCurrencyForProvider('paypal');
    }
    if (!isSafeMoney(input.amount)) {
      throw new Error(`PayPal requires a safe non-negative USD amount, got ${JSON.stringify(input.amount)}`);
    }
    if (input.existingCheckoutReference) {
      const existingOrder = await this.getOrder(input.existingCheckoutReference);
      return this.recoverCheckoutInstruction(input, existingOrder);
    }
    const token = await this.accessToken();
    const res = await this.transport.request('POST', `${this.urls.apiBase}/v2/checkout/orders`, {
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: input.paymentId,
            custom_id: input.merchantReference,
            amount: { currency_code: 'USD', value: usdMajorFromCanonical(input.amount) },
          },
        ],
        application_context: {
          return_url: input.orderResultUrl,
          cancel_url: input.cancelUrl ?? input.orderResultUrl,
          shipping_preference: 'NO_SHIPPING',
          user_action: 'PAY_NOW',
        },
      }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'PayPal-Request-Id': `${PAYPAL_REQUEST_ID_PREFIX}-checkout-${input.merchantReference}`,
      },
    });
    if (res.status !== 201 && res.status !== 200) {
      throw new PaypalApiError('create order', res.status, res.body);
    }
    let order: PaypalOrder;
    try {
      order = JSON.parse(res.body) as PaypalOrder;
    } catch {
      throw new PaypalApiError('create order response parse', res.status, res.body);
    }
    const approve = order.links?.find((link) => link.rel === 'approve');
    if (!approve?.href || !order.id) {
      throw new Error('PayPal create order response missing approve link / order id');
    }
    if (!isTrustedApprovalUrl(approve.href, this.urls.checkoutBase)) {
      throw new Error('PayPal create order response contains an untrusted approval link');
    }
    return {
      kind: 'redirect',
      url: approve.href,
      provider: 'paypal',
      merchantReference: input.merchantReference,
      providerPaymentReference: order.id,
    };
  }

  /**
   * Rebuild a redirect only from the exact persisted PayPal Order. This uses a
   * read-only GET, validates immutable local facts, and refuses stale/terminal
   * Orders. It never falls back to POST because Request-Id retention is finite.
   */
  private recoverCheckoutInstruction(
    input: CreateCheckoutInput,
    order: PaypalOrder | null,
  ): CheckoutInstruction {
    if (!order || order.id !== input.existingCheckoutReference) {
      throw new CheckoutVerificationPendingError('persisted PayPal Order is unavailable');
    }
    const createdAtMs = Date.parse(order.create_time ?? '');
    const ageMs = this.now().getTime() - createdAtMs;
    if (!Number.isFinite(createdAtMs) || ageMs < 0 || ageMs > PAYPAL_APPROVAL_MAX_AGE_MS) {
      throw new CheckoutVerificationPendingError('persisted PayPal Order is outside the safe approval window');
    }
    if (!['CREATED', 'SAVED', 'PAYER_ACTION_REQUIRED'].includes(order.status ?? '')) {
      throw new CheckoutVerificationPendingError('persisted PayPal Order is not redirectable');
    }
    const unit = order.purchase_units?.find((candidate) => candidate.reference_id === input.paymentId);
    let recoveredAmount: Money | null = null;
    try {
      if (unit?.amount) {
        recoveredAmount = paypalMoneyFromString(unit.amount.value, unit.amount.currency_code);
      }
    } catch {
      recoveredAmount = null;
    }
    if (
      !unit ||
      unit.custom_id !== input.merchantReference ||
      !recoveredAmount ||
      recoveredAmount.amount !== input.amount.amount ||
      recoveredAmount.currency !== input.amount.currency
    ) {
      throw new CheckoutVerificationPendingError('persisted PayPal Order facts do not match the local attempt');
    }
    const approve = order.links?.find((link) => link.rel === 'approve');
    if (!approve?.href) {
      throw new CheckoutVerificationPendingError('persisted PayPal Order has no approval redirect');
    }
    if (!isTrustedApprovalUrl(approve.href, this.urls.checkoutBase)) {
      throw new CheckoutVerificationPendingError('persisted PayPal Order has an untrusted approval redirect');
    }
    return {
      kind: 'redirect',
      url: approve.href,
      provider: 'paypal',
      merchantReference: input.merchantReference,
      providerPaymentReference: order.id,
    };
  }

  /**
   * Verify a PayPal webhook (§21): requires the transmission headers, then
   * checks the signature via PayPal's postback `POST /v1/notifications/
   * verify-webhook-signature` endpoint (the authoritative SDK-free path). The
   * `webhook_event` field is the EXACT received event bytes spliced into the
   * postback (never a re-serialization of the parsed object), because PayPal's
   * signature covers the event exactly as received (B1, #21). The raw request
   * body is also kept byte-for-byte for the event fingerprint and sanitized
   * evidence. Verification is fail-closed: any non-SUCCESS result (or missing
   * transmission header / malformed body) throws and grants nothing. A verified
   * event with a non-successful capture status is NOT a rejection — it is
   * returned as a normalized `failed` / `unknown` event for durable persistence.
   */
  async verifyCallback(request: ProviderCallbackRequest): Promise<VerifiedProviderEvent> {
    if (request.provider !== 'paypal') {
      throw new Error(`paypal adapter cannot verify provider '${request.provider}'`);
    }
    const { headers, body } = request;

    const transmissionId = header(headers, 'paypal-transmission-id');
    const transmissionTime = header(headers, 'paypal-transmission-time');
    const transmissionSig = header(headers, 'paypal-transmission-sig');
    const certUrl = header(headers, 'paypal-cert-url');
    const authAlgo = header(headers, 'paypal-auth-algo');
    if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
      throw new Error('paypal webhook missing transmission headers');
    }

    let event: PaypalWebhookEvent;
    try {
      event = JSON.parse(body) as PaypalWebhookEvent;
    } catch {
      throw new Error('paypal webhook body is not valid JSON');
    }
    if (!event?.id || !event?.event_type) {
      throw new Error('paypal webhook missing event id / event_type');
    }

    const token = await this.accessToken();
    // Build the postback JSON by splicing the EXACT received event bytes into
    // `webhook_event` — never re-serialize the parsed object, or PayPal's CRC32
    // over the event can diverge from what was signed (B1, #21). The scalar
    // fields are JSON-stringified (they are plain strings, safe to embed).
    const verifyBody =
      `{"transmission_id":${JSON.stringify(transmissionId)}` +
      `,"transmission_time":${JSON.stringify(transmissionTime)}` +
      `,"cert_url":${JSON.stringify(certUrl)}` +
      `,"auth_algo":${JSON.stringify(authAlgo)}` +
      `,"transmission_sig":${JSON.stringify(transmissionSig)}` +
      `,"webhook_id":${JSON.stringify(this.webhookId)}` +
      `,"webhook_event":${body}}`;
    const verifyRes = await this.transport.request(
      'POST',
      `${this.urls.apiBase}/v1/notifications/verify-webhook-signature`,
      {
        body: verifyBody,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      },
    );
    if (verifyRes.status !== 200) {
      throw new PaypalApiError('verify webhook signature', verifyRes.status, verifyRes.body);
    }
    let verification: { verification_status?: string };
    try {
      verification = JSON.parse(verifyRes.body) as { verification_status?: string };
    } catch {
      throw new Error('paypal webhook verification response is not valid JSON');
    }
    if (verification.verification_status !== 'SUCCESS') {
      throw new InvalidWebhookSignatureError();
    }

    // Normalized status per event type (§21): CAPTURE.COMPLETED is the only paid
    // success; provider-confirmed REFUNDED/REVERSED events use the distinct
    // refund path; APPROVED/PENDING remain non-granting unknown events.
    const status: VerifiedProviderEvent['status'] =
      PAYPAL_CAPTURE_EVENT_STATUS[event.event_type] ?? 'unknown';
    const refundStatus = PAYPAL_REFUND_EVENT_STATUS[event.event_type];
    const isRefundResource = event.event_type.startsWith('PAYMENT.REFUND.');
    const isCaptureRefundEvidence =
      event.event_type === 'PAYMENT.CAPTURE.REFUNDED' ||
      event.event_type === 'PAYMENT.CAPTURE.REVERSED';

    // custom_id (our local merchant ref) + order id location differs by event
    // type (§21/B6): APPROVED events carry them on the order resource; capture
    // events on the capture resource (+ related order id). Refund/reversal
    // events may carry only HATEOAS links — resolve the parent capture → order
    // before correlating. NEVER treat a refund id as an Orders v2 order id.
    const resource = event.resource ?? {};
    const isOrderApproved = event.event_type === 'CHECKOUT.ORDER.APPROVED';
    let customId: string | null | undefined = isOrderApproved
      ? resource.purchase_units?.[0]?.custom_id
      : resource.custom_id;
    const orderId = await this.resolveEventOrderId(event.event_type ?? '', resource, isOrderApproved);
    if (!orderId) {
      throw new Error('paypal webhook missing order id');
    }
    if (!customId) {
      // A capture webhook may omit `resource.custom_id` while carrying the
      // related order id (§21/B5). Recover the local merchant ref from the
      // authoritative PayPal Order's purchase unit; fail closed if it cannot be
      // resolved (never correlate by guessing).
      if (isOrderApproved) {
        throw new Error('paypal webhook missing custom_id');
      }
      customId = await this.resolveOrderCustomId(orderId);
      if (!customId) {
        throw new Error('paypal webhook missing custom_id (capture correlation)');
      }
    }

    const amountField =
      event.event_type === 'CHECKOUT.ORDER.APPROVED'
        ? resource.purchase_units?.[0]?.amount
        : resource.amount;

    return {
      provider: 'paypal',
      providerMerchantRef: customId,
      providerPaymentRef: orderId,
      providerRefundRef: isRefundResource ? resource.id : undefined,
      providerCaptureRef: isCaptureRefundEvidence ? resource.id : undefined,
      refundEvidence: isRefundResource ? 'refund' : isCaptureRefundEvidence ? 'capture' : undefined,
      refundStatus,
      eventFingerprint: await sha256Hex(body),
      status,
      amount: amountField ? paypalMoneyFromString(amountField.value, amountField.currency_code) : undefined,
      paidAt: resource.create_time,
      rawStatusCode: resource.status ?? event.event_type,
    };
  }

  /**
   * Confirm a verified event against the authoritative order state (§21): GET the
   * order; if it is APPROVED (but not yet captured) issue the server capture with
   * a stable `PayPal-Request-Id`; then map the capture status to a snapshot. Any
   * network error / non-200 / missing data fails closed to `unknown` so the
   * orchestration layer persists `verification_pending` (repair loop retries).
   */
  async confirmPayment(event: VerifiedProviderEvent): Promise<ProviderPaymentSnapshot> {
    if (!event.providerPaymentRef) {
      throw new Error('confirmPayment requires a verified event with a PayPal order id');
    }
    let order: PaypalOrder | null;
    try {
      order = await this.getOrder(event.providerPaymentRef);
    } catch {
      return this.unknownSnapshot(event, 'ORDER_UNAVAILABLE');
    }
    if (!order) {
      return this.unknownSnapshot(event, 'ORDER_NOT_FOUND');
    }

    // Cross-check: the order's custom_id must be THIS payment's merchant ref.
    const orderCustomId = order.purchase_units?.[0]?.custom_id;
    if (orderCustomId !== event.providerMerchantRef) {
      return this.unknownSnapshot(event, 'CUSTOM_ID_MISMATCH');
    }

    let capture: PaypalCapture | null | undefined = order.purchase_units?.[0]?.payments?.captures?.[0];
    if (order.status === 'APPROVED' && !capture) {
      try {
        capture = await this.captureOrder(event.providerPaymentRef);
      } catch {
        return this.unknownSnapshot(event, 'CAPTURE_FAILED');
      }
    }
    if (!capture) {
      // Not approved yet (CREATED / PAYER_ACTION_REQUIRED) → pending, not terminal.
      return {
        provider: 'paypal',
        merchantReference: event.providerMerchantRef,
        providerPaymentReference: event.providerPaymentRef,
        status: 'pending',
        amount: orderAmountOf(order) ?? (event.amount as Money),
        rawStatusCode: order.status,
      };
    }

    return this.snapshotFromCapture(event, capture, order);
  }

  /**
   * Full refund via the capture (§7 / §21): `POST /v2/payments/captures/{id}/
   * refund` with an empty body (MVP full refund only — PayPal refunds the full
   * captured amount). Uses a stable `PayPal-Request-Id` keyed on the local
   * payment id, so a retry with the same id is provider-idempotent (§21/B3).
   *
   * AMBIGUITY (§21/B3): a transport exception (timeout/network reset) or an
   * ambiguous HTTP 5xx/429 after the POST may mean PayPal processed the refund
   * even though we never received the response. Those are returned as
   * `ok: true, status: 'pending'` (recoverable) — NEVER a terminal `failed` —
   * so the orchestration layer leaves the refund requested/processing and the
   * repair loop resumes it with the same `PayPal-Request-Id`. A definitive 4xx
   * means the refund was rejected → `failed`. Entitlement is only revoked after
   * a provider-confirmed `succeeded` (refunds is the source of truth, §7.1).
   */
  async refund(input: RefundInput): Promise<ProviderRefundResult> {
    if (input.amount.currency !== 'USD') {
      throw new UnsupportedCurrencyForProvider('paypal');
    }
    if (!input.providerPaymentRef) {
      return { ok: false, status: 'failed', rawStatusCode: 'NO_CAPTURE_REF' };
    }
    let token: string;
    try {
      token = await this.accessToken();
    } catch {
      // No monetary request was dispatched, so keep the local Refund eligible
      // for repair instead of terminally rejecting it on transient auth/API
      // availability.
      return { ok: true, status: 'pending', rawStatusCode: 'OAUTH_FAILED' };
    }
    let res: { status: number; body: string };
    try {
      res = await this.transport.request(
        'POST',
        `${this.urls.apiBase}/v2/payments/captures/${encodeURIComponent(input.providerPaymentRef)}/refund`,
        {
          body: '{}',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'PayPal-Request-Id': `${PAYPAL_REQUEST_ID_PREFIX}-refund-${input.paymentId}`,
          },
        },
      );
    } catch {
      // Network reset / timeout after dispatch — the provider may have processed
      // the refund. Leave it recoverable (pending), never a terminal failure.
      return { ok: true, status: 'pending', rawStatusCode: 'TRANSPORT_UNAVAILABLE' };
    }
    if (res.status === 201 || res.status === 200) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(res.body) as unknown;
      } catch {
        // The provider accepted the money-moving request but returned evidence
        // we cannot safely classify. Retry with the stable PayPal-Request-Id.
        return { ok: true, status: 'pending', rawStatusCode: 'BAD_RESPONSE' };
      }
      if (
        parsed === null ||
        typeof parsed !== 'object' ||
        typeof (parsed as { id?: unknown }).id !== 'string' ||
        (parsed as { id: string }).id.trim().length === 0 ||
        typeof (parsed as { status?: unknown }).status !== 'string'
      ) {
        return { ok: true, status: 'pending', rawStatusCode: 'BAD_RESPONSE' };
      }
      const data = parsed as { id: string; status: string };
      if (data.status === 'COMPLETED') {
        return { ok: true, status: 'succeeded', providerRefundRef: data.id, rawStatusCode: data.status };
      }
      if (data.status === 'PENDING') {
        return { ok: true, status: 'pending', providerRefundRef: data.id, rawStatusCode: data.status };
      }
      return {
        ok: true,
        status: 'pending',
        providerRefundRef: data.id,
        rawStatusCode: data.status ?? 'UNKNOWN_2XX_STATUS',
      };
    }
    // Ambiguous 5xx / rate limit: the provider may have processed the refund.
    // Recoverable via the stable PayPal-Request-Id on retry (§21/B3).
    if (res.status >= 500 || res.status === 429) {
      return { ok: true, status: 'pending', rawStatusCode: `HTTP_${res.status}` };
    }
    // Definitive 4xx → the refund request was rejected by the provider.
    return { ok: false, status: 'failed', rawStatusCode: `HTTP_${res.status}` };
  }

  /**
   * Reporting-based reconciliation (§21 / §6 Layer C analog): query the PayPal
   * transactions report for a date range, paginating ALL pages (page/page_size/
   * total_pages, page_size ≤ 500) and aggregating every `transaction_details`
   * entry. The orchestration layer matches them against local payments.
   *
   * Never silently truncates: if the range requires more than
   * `RECONCILE_MAX_PAGES` (a provider/API hard limit), it throws
   * `ReconciliationIncompleteError` so the caller can narrow the range.
   */
  async reconcile(input: ReconciliationRange): Promise<ProviderReconciliationData> {
    const fromMs = isoDateMs(input.from);
    const toMs = isoDateMs(input.to);
    const inclusiveDays = fromMs === null || toMs === null ? Number.POSITIVE_INFINITY : Math.floor((toMs - fromMs) / 86_400_000) + 1;
    if (fromMs === null || toMs === null || toMs < fromMs || inclusiveDays > RECONCILE_MAX_RANGE_DAYS) {
      throw new InvalidReconciliationRangeError(input);
    }
    const baseParams = new URLSearchParams({
      start_date: `${input.from}T00:00:00Z`,
      end_date: `${input.to}T23:59:59Z`,
      fields: 'all',
      page_size: String(RECONCILE_PAGE_SIZE),
    });
    const entries: PaypalReconciliationEntry[] = [];
    let page = 1;
    let totalPages: number | null = null;
    do {
      // Re-check the cached token on every page so a long paginated report can
      // refresh safely at expiry instead of failing mid-scan.
      const token = await this.accessToken();
      const params = new URLSearchParams(baseParams);
      params.set('page', String(page));
      const res = await this.transport.request(
        'GET',
        `${this.urls.apiBase}/v1/reporting/transactions?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.status !== 200) {
        throw new PaypalApiError('reporting transactions', res.status, res.body);
      }
      let data: { transaction_details?: unknown[]; total_pages?: number };
      try {
        data = JSON.parse(res.body) as { transaction_details?: unknown[]; total_pages?: number };
      } catch {
        throw new PaypalApiError('reporting transactions response parse', res.status, res.body);
      }
      for (const rawEntry of data.transaction_details ?? []) {
        const entry = normalizePaypalReconciliationEntry(rawEntry);
        if (entry) entries.push(entry);
      }
      totalPages = typeof data.total_pages === 'number' ? data.total_pages : 1;
      if (totalPages > RECONCILE_MAX_PAGES) {
        throw new ReconciliationIncompleteError(input, totalPages);
      }
      page += 1;
    } while (page <= totalPages);
    return { provider: 'paypal', entries };
  }

  /* ------------------------- private helpers ------------------------- */

  private async accessToken(): Promise<string> {
    const cached = this.tokenCache;
    const nowMs = this.now().getTime();
    if (cached && cached.expiresAt > nowMs) {
      return cached.token;
    }
    const basic = btoa(`${this.clientId}:${this.clientSecret}`);
    const res = await this.transport.request('POST', `${this.urls.apiBase}/v1/oauth2/token`, {
      body: 'grant_type=client_credentials',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
      },
    });
    if (res.status !== 200) {
      throw new PaypalApiError('OAuth token', res.status, res.body);
    }
    let data: { access_token?: string; expires_in?: number };
    try {
      data = JSON.parse(res.body) as { access_token?: string; expires_in?: number };
    } catch {
      throw new PaypalApiError('OAuth token response parse', res.status, res.body);
    }
    if (!data.access_token) {
      throw new PaypalApiError('OAuth token missing access_token', res.status, res.body);
    }
    const expiresIn = Number(data.expires_in) || 3600;
    this.tokenCache = {
      token: data.access_token,
      // Refresh a little early to avoid racing the expiry boundary.
      expiresAt: nowMs + Math.max(0, expiresIn - 30) * 1000,
    };
    return data.access_token;
  }

  private async getOrder(orderId: string): Promise<PaypalOrder | null> {
    const token = await this.accessToken();
    const res = await this.transport.request('GET', `${this.urls.apiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) {
      return null;
    }
    if (res.status !== 200) {
      throw new PaypalApiError('get order', res.status, res.body);
    }
    return JSON.parse(res.body) as PaypalOrder;
  }

  /**
   * Recover the purchase-unit `custom_id` from the authoritative PayPal Order
   * (§21/B5). Used when a capture webhook omits `resource.custom_id` but carries
   * the related order id. Returns null (fail-closed) on any failure.
   */
  private async resolveOrderCustomId(orderId: string): Promise<string | null> {
    try {
      const order = await this.getOrder(orderId);
      return order?.purchase_units?.[0]?.custom_id ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Resolve the Orders v2 order id for a webhook event (§21/B6). Resolution
   * chain (fail-closed — returns null only when the chain is genuinely broken):
   *   1. APPROVED events → `resource.id` (the order id).
   *   2. Direct `resource.supplementary_data.related_ids.order_id` (capture events).
   *   3. HATEOAS `up` link on the resource that points at an order.
   *   4. For a REFUND event (resource is a refund), resolve the parent capture
   *      from its `up` link, then the capture's order.
   *   5. For a CAPTURE event, GET the capture and read its order id.
   * A refund id is NEVER used as an order id.
   */
  private async resolveEventOrderId(
    eventType: string,
    resource: {
      id?: string;
      links?: Array<{ href: string; rel: string }>;
      supplementary_data?: { related_ids?: { order_id?: string } };
    },
    isOrderApproved: boolean,
  ): Promise<string | null> {
    if (isOrderApproved) {
      return resource.id ?? null;
    }
    const direct = resource.supplementary_data?.related_ids?.order_id;
    if (direct) return direct;
    const fromResourceLink = this.orderIdFromLinks(resource.links);
    if (fromResourceLink) return fromResourceLink;

    // No direct order id. A refund resource's `up` link points at its parent
    // capture; a capture resource's `id` IS the capture. Resolve the capture.
    const isRefundEvent = eventType.startsWith('PAYMENT.REFUND.');
    const captureId = isRefundEvent ? this.captureIdFromLinks(resource.links) : resource.id;
    if (!captureId) return null;
    return this.resolveCaptureOrderId(captureId);
  }

  /** Resolve the order id of a capture (direct related id, then its `up` link). */
  private async resolveCaptureOrderId(captureId: string): Promise<string | null> {
    try {
      const capture = await this.getCapture(captureId);
      if (!capture) return null;
      const direct = capture.supplementary_data?.related_ids?.order_id;
      if (direct) return direct;
      return this.orderIdFromLinks(capture.links);
    } catch {
      return null;
    }
  }

  /** Extract an Orders v2 order id from a HATEOAS `up` link href. */
  private orderIdFromLinks(links?: Array<{ href: string; rel: string }>): string | null {
    const href = links?.find((l) => l.rel === 'up')?.href ?? '';
    const match = /\/(?:v2\/checkout\/orders|checkout\/orders)\/([^/?]+)/.exec(href);
    return match?.[1] ?? null;
  }

  /** Extract a capture id from a HATEOAS `up` link href (refund → capture). */
  private captureIdFromLinks(links?: Array<{ href: string; rel: string }>): string | null {
    const href = links?.find((l) => l.rel === 'up')?.href ?? '';
    const match = /\/(?:v2\/payments\/captures|payments\/captures)\/([^/?]+)/.exec(href);
    return match?.[1] ?? null;
  }

  private async getCapture(captureId: string): Promise<PaypalCapture | null> {
    const token = await this.accessToken();
    const res = await this.transport.request('GET', `${this.urls.apiBase}/v2/payments/captures/${encodeURIComponent(captureId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) {
      return null;
    }
    if (res.status !== 200) {
      throw new PaypalApiError('get capture', res.status, res.body);
    }
    return JSON.parse(res.body) as PaypalCapture;
  }

  private async captureOrder(orderId: string): Promise<PaypalCapture | null> {
    const token = await this.accessToken();
    const res = await this.transport.request('POST', `${this.urls.apiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      body: '{}',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'PayPal-Request-Id': `${PAYPAL_REQUEST_ID_PREFIX}-capture-${orderId}`,
        Prefer: 'return=representation',
      },
    });
    if (res.status !== 201 && res.status !== 200) {
      throw new PaypalApiError('capture order', res.status, res.body);
    }
    const data = JSON.parse(res.body) as PaypalOrder;
    return data.purchase_units?.[0]?.payments?.captures?.[0] ?? null;
  }

  private snapshotFromCapture(
    event: VerifiedProviderEvent,
    capture: PaypalCapture,
    order: PaypalOrder,
  ): ProviderPaymentSnapshot {
    const status: ProviderPaymentSnapshot['status'] =
      capture.status === 'COMPLETED'
        ? 'succeeded'
        : capture.status === 'PENDING'
          ? 'pending'
          : capture.status === 'DECLINED' || capture.status === 'FAILED'
            ? 'failed'
            : 'unknown'; // PARTIALLY_REFUNDED / REFUNDED / missing → not grantable

    return {
      provider: 'paypal',
      merchantReference: event.providerMerchantRef,
      providerPaymentReference: capture.id ?? event.providerPaymentRef,
      status,
      amount:
        capture.amount !== undefined
          ? paypalMoneyFromString(capture.amount.value, capture.amount.currency_code)
          : (orderAmountOf(order) ?? (event.amount as Money)),
      paidAt: status === 'succeeded' ? (capture.create_time ?? event.paidAt) : undefined,
      rawStatusCode: capture.status ?? order.status,
    };
  }

  private unknownSnapshot(event: VerifiedProviderEvent, code: string): ProviderPaymentSnapshot {
    return {
      provider: 'paypal',
      merchantReference: event.providerMerchantRef,
      providerPaymentReference: event.providerPaymentRef,
      status: 'unknown',
      amount: event.amount as Money,
      rawStatusCode: code,
    };
  }
}

function isoDateMs(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date.getTime();
}

/** The order-level amount (purchase_units[0].amount), if present. */
function orderAmountOf(order: PaypalOrder): Money | undefined {
  const amount = order.purchase_units?.[0]?.amount;
  if (!amount) return undefined;
  return paypalMoneyFromString(amount.value, amount.currency_code);
}
