import { describe, expect, it, vi } from 'vitest';
import {
  PaypalPaymentProviderAdapter,
  type PaypalHttpRequest,
  type PaypalHttpResponse,
  type PaypalTransport,
} from './adapter';

function json(status: number, body: unknown): PaypalHttpResponse {
  return { status, body: JSON.stringify(body) };
}

function adapterWith(responses: PaypalHttpResponse[]) {
  const request = vi.fn(async (_url: string, _req: PaypalHttpRequest) => {
    const next = responses.shift();
    if (!next) throw new Error('unexpected PayPal request');
    return next;
  });
  const transport: PaypalTransport = { request };
  return {
    adapter: new PaypalPaymentProviderAdapter({
      clientId: 'client',
      clientSecret: 'secret',
      webhookId: 'WH-1',
      env: 'sandbox',
      transport,
      now: () => new Date('2026-08-17T00:00:00Z'),
    }),
    request,
  };
}

describe('PayPal authoritative confirmation retry semantics', () => {
  it('throws on an ambiguous capture HTTP failure so the webhook boundary can return 5xx/retry', async () => {
    const { adapter } = adapterWith([
      json(200, { access_token: 'ACCESS', expires_in: 3600 }),
      json(503, { name: 'INTERNAL_SERVER_ERROR' }),
    ]);

    await expect(
      adapter.confirmPayment({
        provider: 'paypal',
        providerMerchantRef: 'MERCHANT-REF-1',
        providerPaymentRef: 'PAYPAL-ORDER-1',
        eventFingerprint: 'WH-EVENT-1',
        status: 'unknown',
        amount: { amount: 1234, currency: 'USD' },
        rawStatusCode: 'CHECKOUT.ORDER.APPROVED',
      }),
    ).rejects.toThrow('capture order failed with HTTP 503');
  });

  it('throws on an ambiguous capture-query HTTP failure instead of ACKing an unknown result', async () => {
    const { adapter } = adapterWith([
      json(200, { access_token: 'ACCESS', expires_in: 3600 }),
      json(502, { name: 'BAD_GATEWAY' }),
    ]);

    await expect(
      adapter.confirmPayment({
        provider: 'paypal',
        providerMerchantRef: 'MERCHANT-REF-1',
        providerPaymentRef: 'CAPTURE-1',
        eventFingerprint: 'WH-EVENT-2',
        status: 'succeeded',
        amount: { amount: 1234, currency: 'USD' },
        rawStatusCode: 'PAYMENT.CAPTURE.COMPLETED',
      }),
    ).rejects.toThrow('capture query failed with HTTP 502');
  });
});
