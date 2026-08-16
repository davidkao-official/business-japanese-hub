import { describe, expect, it, vi } from 'vitest';
import { UnsupportedCurrencyForProvider, type ProviderCallbackRequest } from '../contract';
import {
  PaypalPaymentProviderAdapter,
  paypalUsdMinor,
  paypalUsdValue,
  type PaypalHttpRequest,
  type PaypalHttpResponse,
  type PaypalTransport,
} from './adapter';

interface RecordedRequest {
  url: string;
  request: PaypalHttpRequest;
}

function json(status: number, body: unknown): PaypalHttpResponse {
  return { status, body: JSON.stringify(body) };
}

function queuedTransport(responses: PaypalHttpResponse[]) {
  const requests: RecordedRequest[] = [];
  const transport: PaypalTransport = {
    request: vi.fn(async (url: string, request: PaypalHttpRequest) => {
      requests.push({ url, request });
      const response = responses.shift();
      if (!response) throw new Error(`unexpected PayPal request: ${request.method} ${url}`);
      return response;
    }),
  };
  return { transport, requests };
}

function adapterWith(transport: PaypalTransport) {
  return new PaypalPaymentProviderAdapter({
    clientId: 'sandbox-client',
    clientSecret: 'sandbox-secret',
    webhookId: 'WH-123',
    env: 'sandbox',
    transport,
    now: () => new Date('2026-08-17T00:00:00.000Z'),
  });
}

const signatureHeaders = {
  'paypal-transmission-id': 'TX-1',
  'paypal-transmission-time': '2026-08-17T00:00:00Z',
  'paypal-transmission-sig': 'sig',
  'paypal-cert-url': 'https://api-m.sandbox.paypal.com/cert.pem',
  'paypal-auth-algo': 'SHA256withRSA',
};

function approvedWebhook() {
  return {
    id: 'WH-EVENT-APPROVED-1',
    event_type: 'CHECKOUT.ORDER.APPROVED',
    resource: {
      id: 'PAYPAL-ORDER-1',
      purchase_units: [
        {
          reference_id: 'MERCHANT-REF-1',
          custom_id: 'MERCHANT-REF-1',
          amount: { currency_code: 'USD', value: '12.34' },
        },
      ],
    },
  };
}

function completedWebhook() {
  return {
    id: 'WH-EVENT-CAPTURE-1',
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: {
      id: 'CAPTURE-1',
      custom_id: 'MERCHANT-REF-1',
      status: 'COMPLETED',
      amount: { currency_code: 'USD', value: '12.34' },
      create_time: '2026-08-17T00:01:00Z',
    },
  };
}

describe('PayPal USD canonical money conversion', () => {
  it('converts canonical cents to decimal strings without floating arithmetic', () => {
    expect(paypalUsdValue({ amount: 1, currency: 'USD' })).toBe('0.01');
    expect(paypalUsdValue({ amount: 1234, currency: 'USD' })).toBe('12.34');
    expect(paypalUsdValue({ amount: 1200, currency: 'USD' })).toBe('12.00');
  });

  it('parses PayPal USD values to canonical cents', () => {
    expect(paypalUsdMinor('0.01')).toBe(1);
    expect(paypalUsdMinor('12.3')).toBe(1230);
    expect(paypalUsdMinor('12.34')).toBe(1234);
    expect(() => paypalUsdMinor('12.345')).toThrow('Invalid PayPal USD value');
  });

  it('refuses non-USD checkout money', () => {
    expect(() => paypalUsdValue({ amount: 1234, currency: 'TWD' })).toThrow(
      UnsupportedCurrencyForProvider,
    );
  });
});

describe('PaypalPaymentProviderAdapter.createCheckout', () => {
  it('creates a CAPTURE order and returns the provider approve URL as a GET instruction', async () => {
    const { transport, requests } = queuedTransport([
      json(200, { access_token: 'ACCESS', expires_in: 3600 }),
      json(201, {
        id: 'PAYPAL-ORDER-1',
        links: [
          { rel: 'self', href: 'https://api-m.sandbox.paypal.com/v2/checkout/orders/PAYPAL-ORDER-1' },
          { rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORDER-1' },
        ],
      }),
    ]);
    const adapter = adapterWith(transport);

    const instruction = await adapter.createCheckout({
      orderId: 'ORDER-LOCAL-1',
      paymentId: 'PAYMENT-LOCAL-1',
      merchantReference: 'MERCHANT-REF-1',
      amount: { amount: 1234, currency: 'USD' },
      itemNameSnapshot: 'Business Japanese Book',
      locale: 'en',
      returnUrl: 'https://example.test/paypal-browser-return?order=ORDER-LOCAL-1',
      orderResultUrl: 'https://example.test/paypal-browser-return?order=ORDER-LOCAL-1&cancel=1',
    });

    expect(instruction).toEqual({
      action: 'https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORDER-1',
      fields: {},
      method: 'GET',
      provider: 'paypal',
      merchantReference: 'MERCHANT-REF-1',
    });
    expect(requests).toHaveLength(2);
    const create = requests[1];
    expect(create.url).toBe('https://api-m.sandbox.paypal.com/v2/checkout/orders');
    expect(create.request.headers?.['PayPal-Request-Id']).toBe('create-PAYMENT-LOCAL-1');
    const body = JSON.parse(create.request.body ?? '{}');
    expect(body.intent).toBe('CAPTURE');
    expect(body.purchase_units[0]).toMatchObject({
      reference_id: 'MERCHANT-REF-1',
      custom_id: 'MERCHANT-REF-1',
      invoice_id: 'ORDER-LOCAL-1',
      amount: { currency_code: 'USD', value: '12.34' },
    });
    expect(body.application_context.shipping_preference).toBe('NO_SHIPPING');
  });

  it('uses a cached OAuth token for subsequent calls within its lifetime', async () => {
    const { transport, requests } = queuedTransport([
      json(200, { access_token: 'ACCESS', expires_in: 3600 }),
      json(201, {
        id: 'P1',
        links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=P1' }],
      }),
      json(201, {
        id: 'P2',
        links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=P2' }],
      }),
    ]);
    const adapter = adapterWith(transport);
    const base = {
      orderId: 'O1',
      merchantReference: 'M1',
      amount: { amount: 100, currency: 'USD' } as const,
      itemNameSnapshot: 'Book',
      locale: 'en',
      returnUrl: 'https://example.test/return',
      orderResultUrl: 'https://example.test/cancel',
    };
    await adapter.createCheckout({ ...base, paymentId: 'PLOCAL1' });
    await adapter.createCheckout({ ...base, paymentId: 'PLOCAL2', merchantReference: 'M2' });
    expect(requests.filter((request) => request.url.endsWith('/v1/oauth2/token'))).toHaveLength(1);
  });
});

describe('PaypalPaymentProviderAdapter.verifyCallback', () => {
  it('fails closed when signature transport headers are missing', async () => {
    const { transport } = queuedTransport([]);
    const adapter = adapterWith(transport);
    await expect(
      adapter.verifyCallback({
        provider: 'paypal',
        form: {},
        bodyText: JSON.stringify(approvedWebhook()),
        headers: {},
      } satisfies ProviderCallbackRequest),
    ).rejects.toThrow('missing signature headers');
  });

  it('fails closed when PayPal does not return verification_status SUCCESS', async () => {
    const { transport } = queuedTransport([
      json(200, { access_token: 'ACCESS', expires_in: 3600 }),
      json(200, { verification_status: 'FAILURE' }),
    ]);
    const adapter = adapterWith(transport);
    await expect(
      adapter.verifyCallback({
        provider: 'paypal',
        form: {},
        bodyText: JSON.stringify(approvedWebhook()),
        headers: signatureHeaders,
      } satisfies ProviderCallbackRequest),
    ).rejects.toThrow('signature verification failed');
  });

  it('normalizes an authenticated approved-order webhook without marking it paid', async () => {
    const { transport, requests } = queuedTransport([
      json(200, { access_token: 'ACCESS', expires_in: 3600 }),
      json(200, { verification_status: 'SUCCESS' }),
    ]);
    const adapter = adapterWith(transport);
    const event = await adapter.verifyCallback({
      provider: 'paypal',
      form: {},
      bodyText: JSON.stringify(approvedWebhook()),
      headers: signatureHeaders,
    } satisfies ProviderCallbackRequest);

    expect(event).toEqual({
      provider: 'paypal',
      providerMerchantRef: 'MERCHANT-REF-1',
      providerPaymentRef: 'PAYPAL-ORDER-1',
      eventFingerprint: 'WH-EVENT-APPROVED-1',
      status: 'unknown',
      amount: { amount: 1234, currency: 'USD' },
      paidAt: undefined,
      rawStatusCode: 'CHECKOUT.ORDER.APPROVED',
    });
    const verifyBody = JSON.parse(requests[1].request.body ?? '{}');
    expect(verifyBody.webhook_id).toBe('WH-123');
    expect(verifyBody.webhook_event.id).toBe('WH-EVENT-APPROVED-1');
  });

  it('normalizes an authenticated completed-capture webhook as succeeded', async () => {
    const { transport } = queuedTransport([
      json(200, { access_token: 'ACCESS', expires_in: 3600 }),
      json(200, { verification_status: 'SUCCESS' }),
    ]);
    const adapter = adapterWith(transport);
    const event = await adapter.verifyCallback({
      provider: 'paypal',
      form: {},
      bodyText: JSON.stringify(completedWebhook()),
      headers: signatureHeaders,
    } satisfies ProviderCallbackRequest);

    expect(event).toMatchObject({
      providerMerchantRef: 'MERCHANT-REF-1',
      providerPaymentRef: 'CAPTURE-1',
      eventFingerprint: 'WH-EVENT-CAPTURE-1',
      status: 'succeeded',
      amount: { amount: 1234, currency: 'USD' },
      rawStatusCode: 'PAYMENT.CAPTURE.COMPLETED',
    });
  });
});

describe('PaypalPaymentProviderAdapter.confirmPayment', () => {
  it('captures an approved order with a stable provider idempotency key', async () => {
    const { transport, requests } = queuedTransport([
      json(200, { access_token: 'ACCESS', expires_in: 3600 }),
      json(201, {
        id: 'PAYPAL-ORDER-1',
        status: 'COMPLETED',
        purchase_units: [
          {
            payments: {
              captures: [
                {
                  id: 'CAPTURE-1',
                  status: 'COMPLETED',
                  custom_id: 'MERCHANT-REF-1',
                  amount: { currency_code: 'USD', value: '12.34' },
                  update_time: '2026-08-17T00:02:00Z',
                },
              ],
            },
          },
        ],
      }),
    ]);
    const adapter = adapterWith(transport);
    const snapshot = await adapter.confirmPayment({
      provider: 'paypal',
      providerMerchantRef: 'MERCHANT-REF-1',
      providerPaymentRef: 'PAYPAL-ORDER-1',
      eventFingerprint: 'WH-EVENT-APPROVED-1',
      status: 'unknown',
      amount: { amount: 1234, currency: 'USD' },
      rawStatusCode: 'CHECKOUT.ORDER.APPROVED',
    });

    expect(snapshot).toMatchObject({
      provider: 'paypal',
      merchantReference: 'MERCHANT-REF-1',
      providerPaymentReference: 'CAPTURE-1',
      status: 'succeeded',
      amount: { amount: 1234, currency: 'USD' },
    });
    expect(requests[1].url).toContain('/v2/checkout/orders/PAYPAL-ORDER-1/capture');
    expect(requests[1].request.headers?.['PayPal-Request-Id']).toBe('capture-PAYPAL-ORDER-1');
  });

  it('queries a completed capture webhook before returning authoritative success', async () => {
    const { transport, requests } = queuedTransport([
      json(200, { access_token: 'ACCESS', expires_in: 3600 }),
      json(200, {
        id: 'CAPTURE-1',
        status: 'COMPLETED',
        custom_id: 'MERCHANT-REF-1',
        amount: { currency_code: 'USD', value: '12.34' },
        update_time: '2026-08-17T00:02:00Z',
      }),
    ]);
    const adapter = adapterWith(transport);
    const snapshot = await adapter.confirmPayment({
      provider: 'paypal',
      providerMerchantRef: 'MERCHANT-REF-1',
      providerPaymentRef: 'CAPTURE-1',
      eventFingerprint: 'WH-EVENT-CAPTURE-1',
      status: 'succeeded',
      amount: { amount: 1234, currency: 'USD' },
      rawStatusCode: 'PAYMENT.CAPTURE.COMPLETED',
    });
    expect(snapshot.status).toBe('succeeded');
    expect(requests[1].request.method).toBe('GET');
  });

  it('rejects a provider capture whose custom_id does not match the local merchant reference', async () => {
    const { transport } = queuedTransport([
      json(200, { access_token: 'ACCESS', expires_in: 3600 }),
      json(200, {
        id: 'CAPTURE-1',
        status: 'COMPLETED',
        custom_id: 'OTHER-REF',
        amount: { currency_code: 'USD', value: '12.34' },
      }),
    ]);
    const adapter = adapterWith(transport);
    await expect(
      adapter.confirmPayment({
        provider: 'paypal',
        providerMerchantRef: 'MERCHANT-REF-1',
        providerPaymentRef: 'CAPTURE-1',
        eventFingerprint: 'WH-EVENT-CAPTURE-1',
        status: 'succeeded',
        amount: { amount: 1234, currency: 'USD' },
        rawStatusCode: 'PAYMENT.CAPTURE.COMPLETED',
      }),
    ).rejects.toThrow('custom_id does not match');
  });
});

describe('PaypalPaymentProviderAdapter.refund / reconcile', () => {
  it('issues a full refund with a stable PayPal-Request-Id and verifies returned amount', async () => {
    const { transport, requests } = queuedTransport([
      json(200, { access_token: 'ACCESS', expires_in: 3600 }),
      json(201, {
        id: 'REFUND-1',
        status: 'COMPLETED',
        amount: { currency_code: 'USD', value: '12.34' },
      }),
    ]);
    const adapter = adapterWith(transport);
    const result = await adapter.refund({
      paymentId: 'PAYMENT-LOCAL-1',
      providerPaymentRef: 'CAPTURE-1',
      amount: { amount: 1234, currency: 'USD' },
      merchantReference: 'MERCHANT-REF-1',
    });
    expect(result).toEqual({
      ok: true,
      providerRefundRef: 'REFUND-1',
      status: 'succeeded',
      rawStatusCode: 'COMPLETED',
    });
    expect(requests[1].request.body).toBe('{}');
    expect(requests[1].request.headers?.['PayPal-Request-Id']).toBe('refund-PAYMENT-LOCAL-1');
  });

  it('refuses a non-USD refund', async () => {
    const { transport } = queuedTransport([]);
    const adapter = adapterWith(transport);
    await expect(
      adapter.refund({
        paymentId: 'P1',
        providerPaymentRef: 'C1',
        amount: { amount: 100, currency: 'TWD' },
        merchantReference: 'M1',
      }),
    ).rejects.toThrow(UnsupportedCurrencyForProvider);
  });

  it('returns sanitized transaction-search entries for reconciliation', async () => {
    const { transport, requests } = queuedTransport([
      json(200, { access_token: 'ACCESS', expires_in: 3600 }),
      json(200, {
        transaction_details: [
          {
            transaction_info: {
              transaction_id: 'CAPTURE-1',
              transaction_event_code: 'T0006',
              transaction_status: 'S',
              transaction_updated_date: '2026-08-17T00:02:00Z',
              invoice_id: 'ORDER-LOCAL-1',
              custom_field: 'MERCHANT-REF-1',
              transaction_amount: { currency_code: 'USD', value: '12.34' },
              payer_email: 'must-not-leak@example.com',
            },
          },
        ],
      }),
    ]);
    const adapter = adapterWith(transport);
    const result = await adapter.reconcile!({ from: '2026-08-16', to: '2026-08-17' });
    expect(result).toEqual({
      provider: 'paypal',
      entries: [
        {
          transactionId: 'CAPTURE-1',
          eventCode: 'T0006',
          status: 'S',
          updatedAt: '2026-08-17T00:02:00Z',
          invoiceId: 'ORDER-LOCAL-1',
          customField: 'MERCHANT-REF-1',
          amount: { currency: 'USD', value: '12.34' },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('must-not-leak@example.com');
    expect(requests[1].url).toContain('/v1/reporting/transactions?');
  });
});
