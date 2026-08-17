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
} from '../contract';
import { isSafeMoney, minorUnitFor } from '../money';
import { sha256Hex } from '../crypto';
import { resolvePaypalEnv, type PaypalEnv, type PaypalUrls } from './urls';
import { PAYPAL_CAPTURE_EVENT_STATUS, type PaypalCapture, type PaypalOrder, type PaypalWebhookEvent } from './types';

/* ------------------------------------------------------------------------- *
 * Constants / errors
 * ------------------------------------------------------------------------- */

/** Default finite deadline for PayPal REST calls (no unbounded waits). */
export const PAYPAL_REQUEST_TIMEOUT_MS = 15_000;

/** `PayPal-Request-Id` prefix for provider-side idempotency keys (§21). */
export const PAYPAL_REQUEST_ID_PREFIX = 'bjh';

/** Thrown when a webhook's transmission signature fails verification. */
export class InvalidWebhookSignatureError extends Error {
  constructor() {
    super('PayPal webhook signature verification failed');
    this.name = 'InvalidWebhookSignatureError';
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
  /** `'sandbox'` or `'prod'`; `undefined` fails closed to sandbox (§16). */
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
  const major = money.amount / minor;
  if (!Number.isFinite(major) || major <= 0) {
    throw new Error(`PayPal value must be a positive USD amount, got ${JSON.stringify(money)}`);
  }
  return major.toFixed(2);
}

/**
 * Convert a PayPal decimal major-unit string to canonical `Money` (minor units).
 * Throws on a non-USD currency or an unsafe / negative result.
 */
export function paypalMoneyFromString(value: string, currency: string): Money {
  const amount = Number(value);
  if (currency !== 'USD' || !Number.isFinite(amount) || amount < 0) {
    throw new Error(`PayPal amount must be a non-negative USD decimal, got ${JSON.stringify({ value, currency })}`);
  }
  const minor = Math.round(amount * minorUnitFor('USD'));
  if (!Number.isSafeInteger(minor)) {
    throw new Error(`PayPal amount is not a safe integer in minor units: ${JSON.stringify({ value, currency })}`);
  }
  return { amount: minor, currency: 'USD' };
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
    summary: event.summary ?? null,
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
   * raw request body is kept byte-for-byte for the event fingerprint and
   * sanitized evidence; the `webhook_event` field posted back is the parsed
   * event object. Verification is fail-closed: any non-SUCCESS result (or
   * missing transmission header / malformed body) throws and grants nothing. A
   * verified event with a non-successful capture status is NOT a rejection — it
   * is returned as a normalized `failed` / `unknown` event for durable
   * persistence.
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
    const verifyRes = await this.transport.request(
      'POST',
      `${this.urls.apiBase}/v1/notifications/verify-webhook-signature`,
      {
        body: JSON.stringify({
          transmission_id: transmissionId,
          transmission_time: transmissionTime,
          cert_url: certUrl,
          auth_algo: authAlgo,
          transmission_sig: transmissionSig,
          webhook_id: this.webhookId,
          webhook_event: event,
        }),
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

    // Normalized status per event type (§21): only a real CAPTURE.COMPLETED is a
    // succeeded candidate; APPROVED / PENDING / REFUNDED / REVERSED are not.
    const status: VerifiedProviderEvent['status'] =
      PAYPAL_CAPTURE_EVENT_STATUS[event.event_type] ?? 'unknown';

    // custom_id (our local merchant ref) + order id location differs by event
    // type: APPROVED events carry them on the order resource; capture events on
    // the capture resource (+ related order id).
    const resource = event.resource ?? {};
    const customId =
      event.event_type === 'CHECKOUT.ORDER.APPROVED'
        ? resource.purchase_units?.[0]?.custom_id
        : resource.custom_id;
    const orderId =
      event.event_type === 'CHECKOUT.ORDER.APPROVED'
        ? resource.id
        : resource.supplementary_data?.related_ids?.order_id;
    if (!customId || !orderId) {
      throw new Error('paypal webhook missing custom_id / order id');
    }

    const amountField =
      event.event_type === 'CHECKOUT.ORDER.APPROVED'
        ? resource.purchase_units?.[0]?.amount
        : resource.amount;

    return {
      provider: 'paypal',
      providerMerchantRef: customId,
      providerPaymentRef: orderId,
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
   * captured amount). Returns the normalized provider result; entitlement is
   * only revoked after the refund is provider-confirmed (`refunds` is the source
   * of truth, §7.1).
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
      return { ok: false, status: 'failed', rawStatusCode: 'OAUTH_FAILED' };
    }
    const res = await this.transport.request(
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
    if (res.status !== 201 && res.status !== 200) {
      return { ok: false, status: 'failed', rawStatusCode: `HTTP_${res.status}` };
    }
    let data: { id?: string; status?: string };
    try {
      data = JSON.parse(res.body) as { id?: string; status?: string };
    } catch {
      return { ok: false, status: 'failed', rawStatusCode: 'BAD_RESPONSE' };
    }
    if (data.status === 'COMPLETED') {
      return { ok: true, status: 'succeeded', providerRefundRef: data.id, rawStatusCode: data.status };
    }
    if (data.status === 'PENDING') {
      return { ok: true, status: 'pending', providerRefundRef: data.id, rawStatusCode: data.status };
    }
    return { ok: false, status: 'failed', providerRefundRef: data.id, rawStatusCode: data.status };
  }

  /**
   * Reporting-based reconciliation (§21 / §6 Layer C analog): query the PayPal
   * transactions report for a date range and return the raw entries. The
   * orchestration layer matches them against local payments; download is bounded
   * to the 31-day reporting window.
   */
  async reconcile(input: ReconciliationRange): Promise<ProviderReconciliationData> {
    const token = await this.accessToken();
    const params = new URLSearchParams({
      start_date: `${input.from}T00:00:00Z`,
      end_date: `${input.to}T23:59:59Z`,
      fields: 'all',
    });
    const res = await this.transport.request(
      'GET',
      `${this.urls.apiBase}/v1/reporting/transactions?${params.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.status !== 200) {
      throw new PaypalApiError('reporting transactions', res.status, res.body);
    }
    let data: { transaction_details?: unknown[] };
    try {
      data = JSON.parse(res.body) as { transaction_details?: unknown[] };
    } catch {
      throw new PaypalApiError('reporting transactions response parse', res.status, res.body);
    }
    return { provider: 'paypal', entries: data.transaction_details ?? [] };
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

/** The order-level amount (purchase_units[0].amount), if present. */
function orderAmountOf(order: PaypalOrder): Money | undefined {
  const amount = order.purchase_units?.[0]?.amount;
  if (!amount) return undefined;
  return paypalMoneyFromString(amount.value, amount.currency_code);
}
