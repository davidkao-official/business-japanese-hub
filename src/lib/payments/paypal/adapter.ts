/**
 * PayPal USD adapter (#21, decision-record §17.2 / §19 / §22).
 *
 * Boundary: this adapter performs PayPal OAuth/API calls, verifies webhook
 * authenticity, normalizes provider payloads, captures approved Orders v2
 * orders, issues full refunds, and exposes reconciliation data. It NEVER writes
 * Order / PaymentAttempt / Refund / Entitlement state directly.
 *
 * USD is canonical integer cents in the domain. PayPal REST amounts are decimal
 * major-unit strings, so conversion is explicit and float-free.
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

export type PaypalEnv = 'sandbox' | 'prod';

export const PAYPAL_API_TIMEOUT_MS = 15_000;

export interface PaypalHttpRequest {
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
}

export interface PaypalHttpResponse {
  status: number;
  body: string;
}

export interface PaypalTransport {
  request(url: string, request: PaypalHttpRequest): Promise<PaypalHttpResponse>;
}

export interface PaypalAdapterConfig {
  /** Server-only REST app credentials. */
  clientId: string;
  clientSecret: string;
  /** Server-only webhook subscription id used for signature verification. */
  webhookId: string;
  /** Anything other than explicit prod is wired by the Edge boundary as sandbox. */
  env?: PaypalEnv;
  transport?: PaypalTransport;
  now?: () => Date;
}

interface AccessTokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
}

interface JsonObject {
  [key: string]: unknown;
}

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseJsonObject(body: string, context: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`PayPal ${context} returned invalid JSON`);
  }
  const object = asObject(parsed);
  if (!object) throw new Error(`PayPal ${context} returned a non-object JSON body`);
  return object;
}

function normalizeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}

/** Convert canonical USD cents to PayPal's decimal major-unit string. */
export function paypalUsdValue(money: Money): string {
  if (money.currency !== 'USD') throw new UnsupportedCurrencyForProvider('paypal');
  if (!isSafeMoney(money) || money.amount <= 0) {
    throw new Error(`PayPal requires a positive safe USD amount, got ${JSON.stringify(money)}`);
  }
  const minor = minorUnitFor('USD');
  const whole = Math.floor(money.amount / minor);
  const fraction = money.amount % minor;
  return `${whole}.${String(fraction).padStart(2, '0')}`;
}

/** Parse a PayPal USD decimal value to canonical integer cents without floats. */
export function paypalUsdMinor(value: string): number {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error(`Invalid PayPal USD value '${value}'`);
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? '').padEnd(2, '0') || '0');
  const amount = whole * minorUnitFor('USD') + fraction;
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error(`PayPal USD value is outside safe canonical range: '${value}'`);
  }
  return amount;
}

function parsePaypalMoney(value: unknown, context: string): Money {
  const amount = asObject(value);
  const currency = asString(amount?.currency_code);
  const major = asString(amount?.value);
  if (currency !== 'USD' || major === null) {
    throw new Error(`PayPal ${context} must contain a USD amount`);
  }
  return { amount: paypalUsdMinor(major), currency: 'USD' };
}

function statusFromCapture(status: string): ProviderPaymentSnapshot['status'] {
  switch (status) {
    case 'COMPLETED':
      return 'succeeded';
    case 'PENDING':
      return 'pending';
    case 'REFUNDED':
      return 'refunded';
    case 'DECLINED':
    case 'DENIED':
    case 'FAILED':
      return 'failed';
    default:
      return 'unknown';
  }
}

function requireString(object: JsonObject, key: string, context: string): string {
  const value = asString(object[key]);
  if (!value) throw new Error(`PayPal ${context} missing ${key}`);
  return value;
}

function firstObject(array: unknown): JsonObject | null {
  return Array.isArray(array) ? asObject(array[0]) : null;
}

function merchantRefFromWebhook(eventType: string, resource: JsonObject): string {
  if (eventType === 'CHECKOUT.ORDER.APPROVED') {
    const purchaseUnit = firstObject(resource.purchase_units);
    const customId = asString(purchaseUnit?.custom_id);
    const referenceId = asString(purchaseUnit?.reference_id);
    const ref = customId ?? referenceId;
    if (!ref) throw new Error('PayPal approved-order webhook missing merchant reference');
    return ref;
  }
  const customId = asString(resource.custom_id);
  if (!customId) throw new Error(`PayPal ${eventType} webhook missing custom_id`);
  return customId;
}

function amountFromWebhook(eventType: string, resource: JsonObject): Money | undefined {
  if (eventType === 'CHECKOUT.ORDER.APPROVED') {
    const purchaseUnit = firstObject(resource.purchase_units);
    return purchaseUnit?.amount ? parsePaypalMoney(purchaseUnit.amount, eventType) : undefined;
  }
  return resource.amount ? parsePaypalMoney(resource.amount, eventType) : undefined;
}

function eventStatus(eventType: string): VerifiedProviderEvent['status'] {
  switch (eventType) {
    case 'PAYMENT.CAPTURE.COMPLETED':
      return 'succeeded';
    case 'PAYMENT.CAPTURE.DENIED':
    case 'CHECKOUT.PAYMENT-APPROVAL.REVERSED':
      return 'failed';
    case 'CHECKOUT.ORDER.APPROVED':
    case 'PAYMENT.CAPTURE.PENDING':
      return 'unknown';
    default:
      throw new Error(`Unsupported PayPal webhook event type '${eventType}'`);
  }
}

function providerRefFromWebhook(eventType: string, resource: JsonObject): string | undefined {
  const id = asString(resource.id);
  if (!id) return undefined;
  return id;
}

function eventPaidAt(eventType: string, resource: JsonObject): string | undefined {
  if (eventType !== 'PAYMENT.CAPTURE.COMPLETED') return undefined;
  return asString(resource.update_time) ?? asString(resource.create_time) ?? undefined;
}

/** Default transport with a finite timeout. */
export function createDefaultPaypalTransport(): PaypalTransport {
  return {
    async request(url, request) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), request.timeoutMs);
      try {
        const response = await fetch(url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          signal: controller.signal,
        });
        return { status: response.status, body: await response.text() };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export class PaypalPaymentProviderAdapter implements PaymentProviderAdapter {
  readonly provider: PaymentProvider = 'paypal';

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly webhookId: string;
  private readonly baseUrl: string;
  private readonly transport: PaypalTransport;
  private readonly now: () => Date;
  private cachedToken: { value: string; expiresAtMs: number } | null = null;

  constructor(config: PaypalAdapterConfig) {
    if (!config.clientId || !config.clientSecret || !config.webhookId) {
      throw new Error('PayPal clientId, clientSecret, and webhookId are required');
    }
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.webhookId = config.webhookId;
    this.baseUrl = config.env === 'prod' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
    this.transport = config.transport ?? createDefaultPaypalTransport();
    this.now = config.now ?? (() => new Date());
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutInstruction> {
    const value = paypalUsdValue(input.amount);
    const token = await this.accessToken();
    const response = await this.transport.request(`${this.baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      timeoutMs: PAYPAL_API_TIMEOUT_MS,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `create-${input.paymentId}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: input.merchantReference,
            custom_id: input.merchantReference,
            invoice_id: input.orderId,
            description: input.itemNameSnapshot,
            amount: { currency_code: 'USD', value },
          },
        ],
        application_context: {
          return_url: input.returnUrl,
          cancel_url: input.orderResultUrl,
          user_action: 'PAY_NOW',
          shipping_preference: 'NO_SHIPPING',
        },
      }),
    });
    if (response.status !== 201) {
      throw new Error(`PayPal create order failed with HTTP ${response.status}`);
    }
    const body = parseJsonObject(response.body, 'create order');
    requireString(body, 'id', 'create order');
    const links = Array.isArray(body.links) ? body.links : [];
    const approval = links
      .map(asObject)
      .find((link) => link && asString(link.rel) === 'approve');
    const approvalUrl = approval ? asString(approval.href) : null;
    if (!approvalUrl) throw new Error('PayPal create order response missing approve link');
    return {
      action: approvalUrl,
      fields: {},
      method: 'GET',
      provider: 'paypal',
      merchantReference: input.merchantReference,
    };
  }

  async verifyCallback(request: ProviderCallbackRequest): Promise<VerifiedProviderEvent> {
    if (request.provider !== 'paypal') {
      throw new Error(`paypal adapter cannot verify provider '${request.provider}'`);
    }
    if (!request.bodyText) throw new Error('PayPal webhook missing raw body');
    const headers = normalizeHeaders(request.headers);
    const transmissionId = headers['paypal-transmission-id'];
    const transmissionTime = headers['paypal-transmission-time'];
    const transmissionSig = headers['paypal-transmission-sig'];
    const certUrl = headers['paypal-cert-url'];
    const authAlgo = headers['paypal-auth-algo'];
    if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
      throw new Error('PayPal webhook missing signature headers');
    }
    const event = parseJsonObject(request.bodyText, 'webhook');
    const token = await this.accessToken();
    const verify = await this.transport.request(
      `${this.baseUrl}/v1/notifications/verify-webhook-signature`,
      {
        method: 'POST',
        timeoutMs: PAYPAL_API_TIMEOUT_MS,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auth_algo: authAlgo,
          cert_url: certUrl,
          transmission_id: transmissionId,
          transmission_sig: transmissionSig,
          transmission_time: transmissionTime,
          webhook_id: this.webhookId,
          webhook_event: event,
        }),
      },
    );
    if (verify.status !== 200) {
      throw new Error(`PayPal webhook signature verification failed with HTTP ${verify.status}`);
    }
    const verification = parseJsonObject(verify.body, 'webhook signature verification');
    if (verification.verification_status !== 'SUCCESS') {
      throw new Error('PayPal webhook signature verification failed');
    }

    const eventId = requireString(event, 'id', 'webhook');
    const eventType = requireString(event, 'event_type', 'webhook');
    const resource = asObject(event.resource);
    if (!resource) throw new Error('PayPal webhook missing resource');
    const merchantReference = merchantRefFromWebhook(eventType, resource);
    const amount = amountFromWebhook(eventType, resource);

    return {
      provider: 'paypal',
      providerMerchantRef: merchantReference,
      providerPaymentRef: providerRefFromWebhook(eventType, resource),
      eventFingerprint: eventId,
      status: eventStatus(eventType),
      amount,
      paidAt: eventPaidAt(eventType, resource),
      rawStatusCode: eventType,
    };
  }

  async confirmPayment(event: VerifiedProviderEvent): Promise<ProviderPaymentSnapshot> {
    if (event.provider !== 'paypal') throw new Error('PayPal confirmPayment requires a PayPal event');
    const providerRef = event.providerPaymentRef;
    if (!providerRef) throw new Error('PayPal confirmPayment requires a provider reference');
    const token = await this.accessToken();

    if (event.rawStatusCode === 'CHECKOUT.ORDER.APPROVED') {
      const response = await this.transport.request(
        `${this.baseUrl}/v2/checkout/orders/${encodeURIComponent(providerRef)}/capture`,
        {
          method: 'POST',
          timeoutMs: PAYPAL_API_TIMEOUT_MS,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'PayPal-Request-Id': `capture-${providerRef}`,
          },
          body: '{}',
        },
      );
      if (response.status !== 201 && response.status !== 200) {
        return this.unknownSnapshot(event, `CAPTURE_HTTP_${response.status}`);
      }
      const order = parseJsonObject(response.body, 'capture order');
      const purchaseUnit = firstObject(order.purchase_units);
      const payments = asObject(purchaseUnit?.payments);
      const capture = firstObject(payments?.captures);
      if (!capture) return this.unknownSnapshot(event, 'CAPTURE_MISSING');
      return this.snapshotFromCapture(capture, event.providerMerchantRef);
    }

    const response = await this.transport.request(
      `${this.baseUrl}/v2/payments/captures/${encodeURIComponent(providerRef)}`,
      {
        method: 'GET',
        timeoutMs: PAYPAL_API_TIMEOUT_MS,
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (response.status !== 200) {
      return this.unknownSnapshot(event, `CAPTURE_QUERY_HTTP_${response.status}`);
    }
    return this.snapshotFromCapture(
      parseJsonObject(response.body, 'show captured payment'),
      event.providerMerchantRef,
    );
  }

  async refund(input: RefundInput): Promise<ProviderRefundResult> {
    if (input.amount.currency !== 'USD') throw new UnsupportedCurrencyForProvider('paypal');
    paypalUsdValue(input.amount);
    if (!input.providerPaymentRef) {
      return { ok: false, status: 'failed', rawStatusCode: 'CAPTURE_ID_REQUIRED' };
    }
    const token = await this.accessToken();
    const response = await this.transport.request(
      `${this.baseUrl}/v2/payments/captures/${encodeURIComponent(input.providerPaymentRef)}/refund`,
      {
        method: 'POST',
        timeoutMs: PAYPAL_API_TIMEOUT_MS,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'PayPal-Request-Id': `refund-${input.paymentId}`,
        },
        // Empty JSON requests a full refund. Partial refunds are deliberately out of scope.
        body: '{}',
      },
    );
    if (response.status !== 201 && response.status !== 200) {
      return { ok: false, status: 'failed', rawStatusCode: `REFUND_HTTP_${response.status}` };
    }
    const refund = parseJsonObject(response.body, 'refund capture');
    const id = asString(refund.id) ?? undefined;
    const status = asString(refund.status) ?? 'UNKNOWN';
    const normalized: ProviderRefundResult['status'] =
      status === 'COMPLETED' ? 'succeeded' : status === 'PENDING' ? 'pending' : 'failed';
    if (refund.amount) {
      const returned = parsePaypalMoney(refund.amount, 'refund capture');
      if (returned.amount !== input.amount.amount || returned.currency !== input.amount.currency) {
        return { ok: false, providerRefundRef: id, status: 'failed', rawStatusCode: 'REFUND_AMOUNT_MISMATCH' };
      }
    }
    return {
      ok: normalized !== 'failed',
      providerRefundRef: id,
      status: normalized,
      rawStatusCode: status,
    };
  }

  async reconcile(input: ReconciliationRange): Promise<ProviderReconciliationData> {
    const token = await this.accessToken();
    const start = `${input.from}T00:00:00Z`;
    const end = `${input.to}T23:59:59Z`;
    const params = new URLSearchParams({
      start_date: start,
      end_date: end,
      fields: 'all',
      page_size: '500',
    });
    const response = await this.transport.request(
      `${this.baseUrl}/v1/reporting/transactions?${params.toString()}`,
      {
        method: 'GET',
        timeoutMs: PAYPAL_API_TIMEOUT_MS,
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (response.status !== 200) {
      throw new Error(`PayPal reconciliation failed with HTTP ${response.status}`);
    }
    const body = parseJsonObject(response.body, 'transaction search');
    const details = Array.isArray(body.transaction_details) ? body.transaction_details : [];
    const entries = details.flatMap((detail) => {
      const info = asObject(asObject(detail)?.transaction_info);
      if (!info) return [];
      return [
        {
          transactionId: asString(info.transaction_id),
          eventCode: asString(info.transaction_event_code),
          status: asString(info.transaction_status),
          updatedAt: asString(info.transaction_updated_date),
          invoiceId: asString(info.invoice_id),
          customField: asString(info.custom_field),
          amount: asObject(info.transaction_amount)
            ? {
                currency: asString(asObject(info.transaction_amount)?.currency_code),
                value: asString(asObject(info.transaction_amount)?.value),
              }
            : null,
        },
      ];
    });
    return { provider: 'paypal', entries };
  }

  private async accessToken(): Promise<string> {
    const nowMs = this.now().getTime();
    if (this.cachedToken && this.cachedToken.expiresAtMs > nowMs + 30_000) {
      return this.cachedToken.value;
    }
    const basic = globalThis.btoa(`${this.clientId}:${this.clientSecret}`);
    const response = await this.transport.request(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      timeoutMs: PAYPAL_API_TIMEOUT_MS,
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (response.status !== 200) {
      throw new Error(`PayPal OAuth failed with HTTP ${response.status}`);
    }
    const body = parseJsonObject(response.body, 'OAuth');
    const typed = body as AccessTokenResponse;
    const token = asString(typed.access_token);
    const expiresIn = typeof typed.expires_in === 'number' ? typed.expires_in : Number(typed.expires_in);
    if (!token || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw new Error('PayPal OAuth response missing token or expiry');
    }
    this.cachedToken = { value: token, expiresAtMs: nowMs + expiresIn * 1000 };
    return token;
  }

  private snapshotFromCapture(capture: JsonObject, expectedMerchantReference: string): ProviderPaymentSnapshot {
    const id = requireString(capture, 'id', 'capture');
    const status = requireString(capture, 'status', 'capture');
    const merchantReference = asString(capture.custom_id);
    if (!merchantReference || merchantReference !== expectedMerchantReference) {
      throw new Error('PayPal capture custom_id does not match local merchant reference');
    }
    const amount = parsePaypalMoney(capture.amount, 'capture');
    return {
      provider: 'paypal',
      merchantReference,
      providerPaymentReference: id,
      status: statusFromCapture(status),
      amount,
      paidAt:
        status === 'COMPLETED'
          ? (asString(capture.update_time) ?? asString(capture.create_time) ?? undefined)
          : undefined,
      rawStatusCode: status,
    };
  }

  private unknownSnapshot(event: VerifiedProviderEvent, rawStatusCode: string): ProviderPaymentSnapshot {
    return {
      provider: 'paypal',
      merchantReference: event.providerMerchantRef,
      providerPaymentReference: event.providerPaymentRef,
      status: 'unknown',
      amount: event.amount ?? { amount: 0, currency: 'USD' },
      rawStatusCode,
    };
  }
}
