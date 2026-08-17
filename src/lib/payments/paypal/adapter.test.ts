import { describe, expect, it } from 'vitest';
import {
  InvalidWebhookSignatureError,
  PaypalPaymentProviderAdapter,
  RECONCILE_MAX_PAGES,
  ReconciliationIncompleteError,
  paypalMoneyFromString,
  sanitizePaypalEvent,
  usdMajorFromCanonical,
  type PaypalAdapterConfig,
  type PaypalTransport,
} from './adapter';
import { PAYPAL_URLS } from './urls';
import { UnsupportedCurrencyForProvider, type CreateCheckoutInput, type VerifiedProviderEvent } from '../contract';

/** Test-only sandbox credentials (decision-record §16 / §21). */
const CLIENT_ID = 'test-paypal-client-id';
const CLIENT_SECRET = 'test-paypal-client-secret';
const WEBHOOK_ID = 'test-webhook-id';

const SANDBOX_API = PAYPAL_URLS.sandbox.apiBase;

const APPROVE_URL = 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1';

function makeAdapter(overrides?: Partial<PaypalAdapterConfig>): PaypalPaymentProviderAdapter {
  return new PaypalPaymentProviderAdapter({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    webhookId: WEBHOOK_ID,
    env: 'sandbox',
    now: () => new Date('2026-08-16T10:30:00Z'),
    ...overrides,
  });
}

function makeCheckoutInput(overrides?: Partial<CreateCheckoutInput>): CreateCheckoutInput {
  return {
    orderId: 'order-1',
    paymentId: 'pay-1',
    merchantReference: 'BJH202608160001',
    amount: { amount: 1999, currency: 'USD' },
    itemNameSnapshot: 'Keigo Essentials',
    orderResultUrl: 'https://example.com/functions/v1/paypal-browser-return',
    cancelUrl: 'https://example.com/functions/v1/paypal-browser-return',
    ...overrides,
  };
}

interface RecordedRequest {
  method: string;
  url: string;
  body: string;
  headers: Record<string, string>;
}

const OAUTH_BODY = JSON.stringify({
  access_token: 'ACCESS-TOKEN-1',
  token_type: 'Bearer',
  expires_in: 3600,
  app_id: 'APP-1',
  scope: '',
});

/** A transport that records requests and routes responses by URL (longest match first). */
function fakeTransport(
  routes: Array<{
    match: string;
    status: number;
    body: string;
  }>,
): { transport: PaypalTransport; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const sorted = [...routes].sort((a, b) => b.match.length - a.match.length);
  const transport: PaypalTransport = {
    async request(method, url, init = {}) {
      requests.push({ method, url, body: init.body ?? '', headers: init.headers ?? {} });
      for (const route of sorted) {
        if (url.includes(route.match)) {
          return { status: route.status, body: route.body };
        }
      }
      throw new Error(`fake transport: no route for ${method} ${url}`);
    },
  };
  return { transport, requests };
}

function jsonRoute(match: string, status: number, data: unknown): { match: string; status: number; body: string } {
  return { match, status, body: JSON.stringify(data) };
}

const CREATE_ORDER_BODY = JSON.stringify({
  id: 'ORDER-1',
  status: 'CREATED',
  intent: 'CAPTURE',
  links: [{ href: `${SANDBOX_API}/v2/checkout/orders/ORDER-1`, rel: 'self', method: 'GET' }, { href: APPROVE_URL, rel: 'approve', method: 'GET' }],
});

const VERIFY_OK = JSON.stringify({ verification_status: 'SUCCESS' });
const VERIFY_FAIL = JSON.stringify({ verification_status: 'FAILURE' });

function captureCompletedBody(customId = 'BJH202608160001'): string {
  return JSON.stringify({
    id: 'WEBHOOK-1',
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource_type: 'capture',
    summary: 'Payment completed',
    create_time: '2026-08-16T10:31:00Z',
    resource: {
      id: 'CAPTURE-1',
      status: 'COMPLETED',
      custom_id: customId,
      create_time: '2026-08-16T10:31:00Z',
      amount: { currency_code: 'USD', value: '19.99' },
      supplementary_data: { related_ids: { order_id: 'ORDER-1' } },
    },
  });
}

const VERIFIED_CAPTURE_EVENT: VerifiedProviderEvent = {
  provider: 'paypal',
  providerMerchantRef: 'BJH202608160001',
  providerPaymentRef: 'ORDER-1',
  eventFingerprint: 'x'.repeat(64),
  status: 'succeeded',
  amount: { amount: 1999, currency: 'USD' },
  paidAt: '2026-08-16T10:31:00Z',
  rawStatusCode: 'COMPLETED',
};

function webhookHeaders(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    'paypal-transmission-id': 'TX-1',
    'paypal-transmission-time': '2026-08-16T10:31:00Z',
    'paypal-transmission-sig': 'SIG-1',
    'paypal-cert-url': 'https://api-m.sandbox.paypal.com/cert',
    'paypal-auth-algo': 'SHA256withRSA',
    ...overrides,
  };
}

describe('PaypalPaymentProviderAdapter.createCheckout', () => {  it('creates a CAPTURE order and returns a redirect instruction with the approval URL', async () => {
    const { transport, requests } = fakeTransport([
      jsonRoute('/v1/oauth2/token', 200, JSON.parse(OAUTH_BODY)),
      jsonRoute('/v2/checkout/orders', 201, JSON.parse(CREATE_ORDER_BODY)),
    ]);
    const adapter = makeAdapter({ transport });
    const instruction = await adapter.createCheckout(makeCheckoutInput());

    expect(instruction.kind).toBe('redirect');
    if (instruction.kind !== 'redirect') throw new Error('expected redirect');
    expect(instruction.url).toBe(APPROVE_URL);
    expect(instruction.provider).toBe('paypal');
    expect(instruction.merchantReference).toBe('BJH202608160001');
    expect(instruction.providerPaymentReference).toBe('ORDER-1');

    const orderRequest = requests.find((r) => r.url.includes('/v2/checkout/orders'));
    expect(orderRequest).toBeDefined();
    const body = JSON.parse(orderRequest!.body);
    expect(body.intent).toBe('CAPTURE');
    expect(body.purchase_units[0]).toMatchObject({
      custom_id: 'BJH202608160001',
      reference_id: 'pay-1',
      amount: { currency_code: 'USD', value: '19.99' },
    });
    expect(orderRequest!.headers['PayPal-Request-Id']).toBe('bjh-checkout-BJH202608160001');
  });

  it('throws UnsupportedCurrencyForProvider for a non-USD amount', async () => {
    const adapter = makeAdapter();
    await expect(
      adapter.createCheckout(makeCheckoutInput({ amount: { amount: 79000, currency: 'TWD' } })),
    ).rejects.toBeInstanceOf(UnsupportedCurrencyForProvider);
  });
});

describe('PaypalPaymentProviderAdapter.verifyCallback', () => {
  it('verifies a CAPTURE.COMPLETED webhook and returns a normalized succeeded event', async () => {
    const body = captureCompletedBody();
    const { transport, requests } = fakeTransport([
      jsonRoute('/v1/oauth2/token', 200, JSON.parse(OAUTH_BODY)),
      jsonRoute('/v1/notifications/verify-webhook-signature', 200, JSON.parse(VERIFY_OK)),
    ]);
    const adapter = makeAdapter({ transport });
    const event = await adapter.verifyCallback({ provider: 'paypal', body, headers: webhookHeaders() });

    expect(event.provider).toBe('paypal');
    expect(event.providerMerchantRef).toBe('BJH202608160001');
    expect(event.providerPaymentRef).toBe('ORDER-1');
    expect(event.status).toBe('succeeded');
    expect(event.amount).toEqual({ amount: 1999, currency: 'USD' });
    expect(event.rawStatusCode).toBe('COMPLETED');

    // The verification request embeds the raw event object + transmission headers.
    const verify = requests.find((r) => r.url.includes('/v1/notifications/verify-webhook-signature'));
    expect(verify).toBeDefined();
    const verifyBody = JSON.parse(verify!.body);
    expect(verifyBody.webhook_id).toBe(WEBHOOK_ID);
    expect(verifyBody.transmission_id).toBe('TX-1');
    expect(verifyBody.webhook_event.event_type).toBe('PAYMENT.CAPTURE.COMPLETED');
    expect(verifyBody.webhook_event.resource.id).toBe('CAPTURE-1');
  });

  it('rejects a webhook whose signature verification is not SUCCESS', async () => {
    const { transport } = fakeTransport([
      jsonRoute('/v1/oauth2/token', 200, JSON.parse(OAUTH_BODY)),
      jsonRoute('/v1/notifications/verify-webhook-signature', 200, JSON.parse(VERIFY_FAIL)),
    ]);
    const adapter = makeAdapter({ transport });
    await expect(
      adapter.verifyCallback({ provider: 'paypal', body: captureCompletedBody(), headers: webhookHeaders() }),
    ).rejects.toBeInstanceOf(InvalidWebhookSignatureError);
  });

  it('rejects a webhook missing transmission headers', async () => {
    const adapter = makeAdapter();
    await expect(
      adapter.verifyCallback({ provider: 'paypal', body: captureCompletedBody(), headers: {} }),
    ).rejects.toThrow(/missing transmission headers/);
  });

  it('maps CHECKOUT.ORDER.APPROVED to a non-granting unknown status', async () => {
    const body = JSON.stringify({
      id: 'WEBHOOK-2',
      event_type: 'CHECKOUT.ORDER.APPROVED',
      resource_type: 'checkout-order',
      create_time: '2026-08-16T10:31:00Z',
      resource: {
        id: 'ORDER-1',
        status: 'APPROVED',
        purchase_units: [{ custom_id: 'BJH202608160001', amount: { currency_code: 'USD', value: '19.99' } }],
      },
    });
    const { transport } = fakeTransport([
      jsonRoute('/v1/oauth2/token', 200, JSON.parse(OAUTH_BODY)),
      jsonRoute('/v1/notifications/verify-webhook-signature', 200, JSON.parse(VERIFY_OK)),
    ]);
    const adapter = makeAdapter({ transport });
    const event = await adapter.verifyCallback({ provider: 'paypal', body, headers: webhookHeaders() });
    expect(event.status).toBe('unknown');
    expect(event.providerMerchantRef).toBe('BJH202608160001');
    expect(event.providerPaymentRef).toBe('ORDER-1');
  });

  it('rejects a request for a different provider', async () => {
    const adapter = makeAdapter();
    await expect(
      adapter.verifyCallback({ form: {}, provider: 'ecpay' }),
    ).rejects.toThrow(/cannot verify provider 'ecpay'/);
  });

  it('B1: posts the EXACT received event bytes as webhook_event (no re-serialization)', async () => {
    // Deliberately non-canonical JSON: unusual whitespace + non-alphabetical key
    // order. PayPal's signature covers the event exactly as received, so the
    // postback must embed these exact bytes — never a re-serialized object.
    const rawBody =
      '{ "summary" :   "Payment completed", "resource" : { "status" : "COMPLETED", "custom_id" : "BJH202608160001", "amount" : { "value" : "19.99", "currency_code" : "USD" }, "id" : "CAPTURE-1", "supplementary_data" : { "related_ids" : { "order_id" : "ORDER-1" } } }, "event_type" : "PAYMENT.CAPTURE.COMPLETED", "id" : "WEBHOOK-1" }';
    const { transport, requests } = fakeTransport([
      jsonRoute('/v1/oauth2/token', 200, JSON.parse(OAUTH_BODY)),
      jsonRoute('/v1/notifications/verify-webhook-signature', 200, JSON.parse(VERIFY_OK)),
    ]);
    const adapter = makeAdapter({ transport });
    await adapter.verifyCallback({ provider: 'paypal', body: rawBody, headers: webhookHeaders() });

    const verify = requests.find((r) => r.url.includes('/v1/notifications/verify-webhook-signature'));
    expect(verify).toBeDefined();
    // The exact received bytes are embedded verbatim as the webhook_event value.
    expect(verify!.body).toContain(`"webhook_event":${rawBody}`);
    // The odd whitespace/key-order representation is present — a canonical
    // re-serialization would not contain it.
    expect(verify!.body).toContain('{ "summary" :   "Payment completed"');
    // The embedded event still parses (it is the raw event object, intact).
    expect(JSON.parse(verify!.body).webhook_event.id).toBe('WEBHOOK-1');
  });

  it('B5: correlates a CAPTURE.COMPLETED without resource.custom_id via the related order', async () => {
    const rawBody = JSON.stringify({
      id: 'WEBHOOK-3',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: 'CAPTURE-1',
        status: 'COMPLETED',
        amount: { currency_code: 'USD', value: '19.99' },
        create_time: '2026-08-16T10:31:00Z',
        // No resource.custom_id — documented omission; only the related order id.
        supplementary_data: { related_ids: { order_id: 'ORDER-1' } },
      },
    });
    const orderBody = JSON.stringify({
      id: 'ORDER-1',
      status: 'COMPLETED',
      purchase_units: [{ custom_id: 'BJH202608160001', amount: { currency_code: 'USD', value: '19.99' } }],
    });
    const { transport } = fakeTransport([
      jsonRoute('/v1/oauth2/token', 200, JSON.parse(OAUTH_BODY)),
      jsonRoute('/v1/notifications/verify-webhook-signature', 200, JSON.parse(VERIFY_OK)),
      jsonRoute('/v2/checkout/orders/ORDER-1', 200, JSON.parse(orderBody)),
    ]);
    const adapter = makeAdapter({ transport });
    const event = await adapter.verifyCallback({ provider: 'paypal', body: rawBody, headers: webhookHeaders() });
    expect(event.providerMerchantRef).toBe('BJH202608160001');
    expect(event.providerPaymentRef).toBe('ORDER-1');
    expect(event.status).toBe('succeeded');
  });

  it('B5: fails closed when the capture custom_id is absent AND the order cannot resolve it', async () => {
    const rawBody = JSON.stringify({
      id: 'WEBHOOK-4',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: 'CAPTURE-1',
        status: 'COMPLETED',
        supplementary_data: { related_ids: { order_id: 'ORDER-X' } },
      },
    });
    const { transport } = fakeTransport([
      jsonRoute('/v1/oauth2/token', 200, JSON.parse(OAUTH_BODY)),
      jsonRoute('/v1/notifications/verify-webhook-signature', 200, JSON.parse(VERIFY_OK)),
      { match: '/v2/checkout/orders/ORDER-X', status: 404, body: '{}' },
    ]);
    const adapter = makeAdapter({ transport });
    await expect(
      adapter.verifyCallback({ provider: 'paypal', body: rawBody, headers: webhookHeaders() }),
    ).rejects.toThrow(/missing custom_id/);
  });

  it('B6: correlates a CAPTURE.REVERSED event with related_ids.order_id (never grants)', async () => {
    const rawBody = JSON.stringify({
      id: 'WEBHOOK-R1',
      event_type: 'PAYMENT.CAPTURE.REVERSED',
      resource: {
        id: 'CAPTURE-1',
        status: 'REVERSED',
        custom_id: 'BJH202608160001',
        amount: { currency_code: 'USD', value: '19.99' },
        supplementary_data: { related_ids: { order_id: 'ORDER-1' } },
      },
    });
    const { transport } = fakeTransport([
      jsonRoute('/v1/oauth2/token', 200, JSON.parse(OAUTH_BODY)),
      jsonRoute('/v1/notifications/verify-webhook-signature', 200, JSON.parse(VERIFY_OK)),
    ]);
    const adapter = makeAdapter({ transport });
    const event = await adapter.verifyCallback({ provider: 'paypal', body: rawBody, headers: webhookHeaders() });
    expect(event.providerMerchantRef).toBe('BJH202608160001');
    expect(event.providerPaymentRef).toBe('ORDER-1'); // order id, NEVER the capture id
    expect(event.status).toBe('unknown'); // non-granting
  });

  it('B6: correlates a CAPTURE.REFUNDED event without related_ids via its HATEOAS up link', async () => {
    const rawBody = JSON.stringify({
      id: 'WEBHOOK-R2',
      event_type: 'PAYMENT.CAPTURE.REFUNDED',
      resource: {
        id: 'CAPTURE-1',
        status: 'REFUNDED',
        custom_id: 'BJH202608160001',
        amount: { currency_code: 'USD', value: '19.99' },
        // No related_ids.order_id — only the HATEOAS up link to the order.
        links: [{ href: `${SANDBOX_API}/v2/checkout/orders/ORDER-1`, rel: 'up', method: 'GET' }],
      },
    });
    const { transport } = fakeTransport([
      jsonRoute('/v1/oauth2/token', 200, JSON.parse(OAUTH_BODY)),
      jsonRoute('/v1/notifications/verify-webhook-signature', 200, JSON.parse(VERIFY_OK)),
    ]);
    const adapter = makeAdapter({ transport });
    const event = await adapter.verifyCallback({ provider: 'paypal', body: rawBody, headers: webhookHeaders() });
    expect(event.providerMerchantRef).toBe('BJH202608160001');
    expect(event.providerPaymentRef).toBe('ORDER-1');
    expect(event.status).toBe('unknown');
  });

  it('B6: resolves a PAYMENT.REFUND.* event (refund resource) via parent capture → order, and never uses the refund id as an order id', async () => {
    const rawBody = JSON.stringify({
      id: 'WEBHOOK-R3',
      event_type: 'PAYMENT.REFUND.COMPLETED',
      resource: {
        id: 'REFUND-1',
        status: 'COMPLETED',
        amount: { currency_code: 'USD', value: '19.99' },
        // No custom_id, no related_ids — only the up link to the parent capture.
        links: [{ href: `${SANDBOX_API}/v2/payments/captures/CAPTURE-1`, rel: 'up', method: 'GET' }],
      },
    });
    const captureBody = JSON.stringify({
      id: 'CAPTURE-1',
      status: 'REFUNDED',
      amount: { currency_code: 'USD', value: '19.99' },
      links: [{ href: `${SANDBOX_API}/v2/checkout/orders/ORDER-1`, rel: 'up', method: 'GET' }],
    });
    const orderBody = JSON.stringify({
      id: 'ORDER-1',
      status: 'COMPLETED',
      purchase_units: [{ custom_id: 'BJH202608160001', amount: { currency_code: 'USD', value: '19.99' } }],
    });
    const { transport } = fakeTransport([
      jsonRoute('/v1/oauth2/token', 200, JSON.parse(OAUTH_BODY)),
      jsonRoute('/v1/notifications/verify-webhook-signature', 200, JSON.parse(VERIFY_OK)),
      jsonRoute('/v2/payments/captures/CAPTURE-1', 200, JSON.parse(captureBody)),
      jsonRoute('/v2/checkout/orders/ORDER-1', 200, JSON.parse(orderBody)),
    ]);
    const adapter = makeAdapter({ transport });
    const event = await adapter.verifyCallback({ provider: 'paypal', body: rawBody, headers: webhookHeaders() });
    expect(event.providerMerchantRef).toBe('BJH202608160001'); // from the order purchase unit
    expect(event.providerPaymentRef).toBe('ORDER-1'); // real order id, never 'REFUND-1'
    expect(event.status).toBe('unknown');
  });

  it('B6: fails closed when a refund event chain cannot resolve an order id', async () => {
    const rawBody = JSON.stringify({
      id: 'WEBHOOK-R4',
      event_type: 'PAYMENT.REFUND.COMPLETED',
      resource: { id: 'REFUND-1', status: 'COMPLETED' }, // no links, no related order
    });
    const { transport } = fakeTransport([
      jsonRoute('/v1/oauth2/token', 200, JSON.parse(OAUTH_BODY)),
      jsonRoute('/v1/notifications/verify-webhook-signature', 200, JSON.parse(VERIFY_OK)),
    ]);
    const adapter = makeAdapter({ transport });
    await expect(
      adapter.verifyCallback({ provider: 'paypal', body: rawBody, headers: webhookHeaders() }),
    ).rejects.toThrow(/missing order id/);
  });
});

describe('PaypalPaymentProviderAdapter.confirmPayment', () => {
  const orderCompleted = JSON.stringify({
    id: 'ORDER-1',
    status: 'COMPLETED',
    purchase_units: [
      {
        custom_id: 'BJH202608160001',
        amount: { currency_code: 'USD', value: '19.99' },
        payments: {
          captures: [{ id: 'CAPTURE-1', status: 'COMPLETED', custom_id: 'BJH202608160001', amount: { currency_code: 'USD', value: '19.99' }, create_time: '2026-08-16T10:31:00Z' }],
        },
      },
    ],
  });

  it('confirms a completed order as succeeded (no capture needed)', async () => {
    const { transport } = fakeTransport([
      jsonRoute('/v1/oauth2/token', 200, JSON.parse(OAUTH_BODY)),
      jsonRoute('/v2/checkout/orders/ORDER-1', 200, JSON.parse(orderCompleted)),
    ]);
    const adapter = makeAdapter({ transport });
    const snapshot = await adapter.confirmPayment(VERIFIED_CAPTURE_EVENT);
    expect(snapshot.status).toBe('succeeded');
    expect(snapshot.providerPaymentReference).toBe('CAPTURE-1');
    expect(snapshot.amount).toEqual({ amount: 1999, currency: 'USD' });
    expect(snapshot.rawStatusCode).toBe('COMPLETED');
  });

  it('captures an APPROVED order (server capture) and confirms success', async () => {
    const orderApproved = JSON.stringify({
      id: 'ORDER-1',
      status: 'APPROVED',
      purchase_units: [{ custom_id: 'BJH202608160001', amount: { currency_code: 'USD', value: '19.99' }, payments: { captures: [] } }],
    });
    const { transport, requests } = fakeTransport([
      jsonRoute('/v1/oauth2/token', 200, JSON.parse(OAUTH_BODY)),
      jsonRoute('/v2/checkout/orders/ORDER-1', 200, JSON.parse(orderApproved)),
      jsonRoute('/v2/checkout/orders/ORDER-1/capture', 201, JSON.parse(orderCompleted)),
    ]);
    const adapter = makeAdapter({ transport });
    const snapshot = await adapter.confirmPayment(VERIFIED_CAPTURE_EVENT);
    expect(snapshot.status).toBe('succeeded');
    expect(snapshot.providerPaymentReference).toBe('CAPTURE-1');
    expect(requests.some((r) => r.url.includes('/capture') && r.headers['PayPal-Request-Id'])).toBe(true);
  });

  it('returns pending for a capture in PENDING state', async () => {
    const orderPending = JSON.stringify({
      id: 'ORDER-1',
      status: 'COMPLETED',
      purchase_units: [{ custom_id: 'BJH202608160001', amount: { currency_code: 'USD', value: '19.99' }, payments: { captures: [{ id: 'CAPTURE-1', status: 'PENDING', amount: { currency_code: 'USD', value: '19.99' } }] } }],
    });
    const { transport } = fakeTransport([
      jsonRoute('/v1/oauth2/token', 200, JSON.parse(OAUTH_BODY)),
      jsonRoute('/v2/checkout/orders/ORDER-1', 200, JSON.parse(orderPending)),
    ]);
    const adapter = makeAdapter({ transport });
    const snapshot = await adapter.confirmPayment(VERIFIED_CAPTURE_EVENT);
    expect(snapshot.status).toBe('pending');
  });

  it('fails closed to unknown on a custom_id mismatch', async () => {
    const wrongCustomId = JSON.stringify({
      id: 'ORDER-1',
      status: 'COMPLETED',
      purchase_units: [{ custom_id: 'SOMEONE-ELSE', amount: { currency_code: 'USD', value: '19.99' }, payments: { captures: [{ id: 'CAPTURE-1', status: 'COMPLETED' }] } }],
    });
    const { transport } = fakeTransport([
      jsonRoute('/v1/oauth2/token', 200, JSON.parse(OAUTH_BODY)),
      jsonRoute('/v2/checkout/orders/ORDER-1', 200, JSON.parse(wrongCustomId)),
    ]);
    const adapter = makeAdapter({ transport });
    const snapshot = await adapter.confirmPayment(VERIFIED_CAPTURE_EVENT);
    expect(snapshot.status).toBe('unknown');
    expect(snapshot.rawStatusCode).toBe('CUSTOM_ID_MISMATCH');
  });

  it('fails closed to unknown on a network error', async () => {
    const { transport } = fakeTransport([]);
    const adapter = makeAdapter({ transport });
    const snapshot = await adapter.confirmPayment(VERIFIED_CAPTURE_EVENT);
    expect(snapshot.status).toBe('unknown');
    expect(snapshot.rawStatusCode).toBe('ORDER_UNAVAILABLE');
  });
});

describe('PaypalPaymentProviderAdapter.refund / reconcile', () => {
  it('issues a full refund and returns a succeeded provider result', async () => {
    const { transport, requests } = fakeTransport([
      jsonRoute('/v1/oauth2/token', 200, JSON.parse(OAUTH_BODY)),
      jsonRoute('/v2/payments/captures/CAPTURE-1/refund', 201, { id: 'REFUND-1', status: 'COMPLETED' }),
    ]);
    const adapter = makeAdapter({ transport });
    const result = await adapter.refund({
      paymentId: 'pay-1',
      providerPaymentRef: 'CAPTURE-1',
      amount: { amount: 1999, currency: 'USD' },
      merchantReference: 'BJH202608160001',
    });
    expect(result).toEqual({ ok: true, status: 'succeeded', providerRefundRef: 'REFUND-1', rawStatusCode: 'COMPLETED' });
    const refundRequest = requests.find((r) => r.url.includes('/refund'));
    expect(refundRequest?.headers['PayPal-Request-Id']).toBe('bjh-refund-pay-1');
    expect(refundRequest?.body).toBe('{}'); // full refund = empty body
  });

  it('returns pending for a pending refund', async () => {
    const { transport } = fakeTransport([
      jsonRoute('/v1/oauth2/token', 200, JSON.parse(OAUTH_BODY)),
      jsonRoute('/v2/payments/captures/CAPTURE-1/refund', 201, { id: 'REFUND-1', status: 'PENDING' }),
    ]);
    const adapter = makeAdapter({ transport });
    const result = await adapter.refund({
      paymentId: 'pay-1',
      providerPaymentRef: 'CAPTURE-1',
      amount: { amount: 1999, currency: 'USD' },
      merchantReference: 'BJH202608160001',
    });
    expect(result).toEqual({ ok: true, status: 'pending', providerRefundRef: 'REFUND-1', rawStatusCode: 'PENDING' });
  });

  it('throws UnsupportedCurrencyForProvider for a non-USD refund', async () => {
    const adapter = makeAdapter();
    await expect(
      adapter.refund({
        paymentId: 'pay-1',
        providerPaymentRef: 'CAPTURE-1',
        amount: { amount: 79000, currency: 'TWD' },
        merchantReference: 'BJH202608160001',
      }),
    ).rejects.toBeInstanceOf(UnsupportedCurrencyForProvider);
  });

  it('B3: a transport exception after refund dispatch is recoverable (pending, not failed)', async () => {
    const { transport } = fakeTransport([
      jsonRoute('/v1/oauth2/token', 200, JSON.parse(OAUTH_BODY)),
    ]); // no refund route → the request throws (network reset / timeout)
    const adapter = makeAdapter({ transport });
    const result = await adapter.refund({
      paymentId: 'pay-1',
      providerPaymentRef: 'CAPTURE-1',
      amount: { amount: 1999, currency: 'USD' },
      merchantReference: 'BJH202608160001',
    });
    expect(result).toEqual({ ok: true, status: 'pending', rawStatusCode: 'TRANSPORT_UNAVAILABLE' });
  });

  it('B3: an ambiguous HTTP 5xx refund response is recoverable (pending, not failed)', async () => {
    const { transport } = fakeTransport([
      jsonRoute('/v1/oauth2/token', 200, JSON.parse(OAUTH_BODY)),
      jsonRoute('/v2/payments/captures/CAPTURE-1/refund', 500, '{}'),
    ]);
    const adapter = makeAdapter({ transport });
    const result = await adapter.refund({
      paymentId: 'pay-1',
      providerPaymentRef: 'CAPTURE-1',
      amount: { amount: 1999, currency: 'USD' },
      merchantReference: 'BJH202608160001',
    });
    expect(result).toEqual({ ok: true, status: 'pending', rawStatusCode: 'HTTP_500' });
  });

  it('B3: a definitive 4xx refund response is terminal failed', async () => {
    const { transport } = fakeTransport([
      jsonRoute('/v1/oauth2/token', 200, JSON.parse(OAUTH_BODY)),
      jsonRoute('/v2/payments/captures/CAPTURE-1/refund', 422, JSON.stringify({ name: 'UNPROCESSABLE_ENTITY', details: [] })),
    ]);
    const adapter = makeAdapter({ transport });
    const result = await adapter.refund({
      paymentId: 'pay-1',
      providerPaymentRef: 'CAPTURE-1',
      amount: { amount: 1999, currency: 'USD' },
      merchantReference: 'BJH202608160001',
    });
    expect(result).toEqual({ ok: false, status: 'failed', rawStatusCode: 'HTTP_422' });
  });

  it('reconcile returns the reporting transaction entries', async () => {
    const { transport } = fakeTransport([
      jsonRoute('/v1/oauth2/token', 200, JSON.parse(OAUTH_BODY)),
      jsonRoute('/v1/reporting/transactions', 200, { transaction_details: [{ transaction_info: { transaction_id: 'TXN-1' } }] }),
    ]);
    const adapter = makeAdapter({ transport });
    const data = await adapter.reconcile({ from: '2026-08-15', to: '2026-08-16' });
    expect(data.provider).toBe('paypal');
    expect(data.entries).toHaveLength(1);
  });

  it('B4: reconciles ALL pages (page/page_size/total_pages), never truncating', async () => {
    const requests: RecordedRequest[] = [];
    const transport: PaypalTransport = {
      async request(method, url, init = {}) {
        requests.push({ method, url, body: init.body ?? '', headers: init.headers ?? {} });
        if (url.includes('/v1/oauth2/token')) return { status: 200, body: OAUTH_BODY };
        if (url.includes('/v1/reporting/transactions')) {
          const page = new URL(url).searchParams.get('page') ?? '1';
          return { status: 200, body: JSON.stringify({ transaction_details: [{ page }], total_pages: 3 }) };
        }
        throw new Error(`fake transport: no route for ${method} ${url}`);
      },
    };
    const adapter = makeAdapter({ transport });
    const data = await adapter.reconcile({ from: '2026-08-15', to: '2026-08-16' });

    expect(data.entries).toEqual([{ page: '1' }, { page: '2' }, { page: '3' }]);
    const pages = requests.filter((r) => r.url.includes('/v1/reporting/transactions'));
    expect(pages).toHaveLength(3);
    expect(pages[0].url).toContain('page_size=500');
    expect(pages[0].url).toContain('page=1');
    expect(pages[2].url).toContain('page=3');
  });

  it('B4: fails explicitly when the range exceeds the page cap (never silently truncates)', async () => {
    const transport: PaypalTransport = {
      async request(_method, url) {
        if (url.includes('/v1/oauth2/token')) return { status: 200, body: OAUTH_BODY };
        if (url.includes('/v1/reporting/transactions')) {
          return { status: 200, body: JSON.stringify({ transaction_details: [], total_pages: RECONCILE_MAX_PAGES + 1 }) };
        }
        throw new Error(`fake transport: no route for ${url}`);
      },
    };
    const adapter = makeAdapter({ transport });
    await expect(adapter.reconcile({ from: '2026-08-15', to: '2026-08-16' })).rejects.toBeInstanceOf(
      ReconciliationIncompleteError,
    );
  });
});

describe('pure helpers', () => {
  it('usdMajorFromCanonical converts minor units to a 2-decimal major string', () => {
    expect(usdMajorFromCanonical({ amount: 1999, currency: 'USD' })).toBe('19.99');
    expect(usdMajorFromCanonical({ amount: 79000, currency: 'USD' })).toBe('790.00');
  });

  it('paypalMoneyFromString converts a decimal major string to canonical minor units', () => {
    expect(paypalMoneyFromString('19.99', 'USD')).toEqual({ amount: 1999, currency: 'USD' });
    expect(paypalMoneyFromString('0.99', 'USD')).toEqual({ amount: 99, currency: 'USD' });
    expect(() => paypalMoneyFromString('19.99', 'TWD')).toThrow(/non-negative USD decimal/);
  });

  it('sanitizePaypalEvent allowlists financial/status fields only', () => {
    const event = JSON.parse(captureCompletedBody()) as ReturnType<typeof JSON.parse>;
    const sanitized = sanitizePaypalEvent(event);
    expect(sanitized).toMatchObject({
      id: 'WEBHOOK-1',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource_custom_id: 'BJH202608160001',
      order_id: 'ORDER-1',
      resource_amount: { currency_code: 'USD', value: '19.99' },
    });
    expect(sanitized.resource_status).toBe('COMPLETED');
  });
});
