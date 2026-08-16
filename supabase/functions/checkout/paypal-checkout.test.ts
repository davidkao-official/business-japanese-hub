import { describe, expect, it, vi } from 'vitest';
import type { ConsentSubmission, PaymentProviderAdapter } from '../../../src/lib/payments/contract.ts';
import {
  bearerHeaders,
  createFakeAdapter,
  createMockDb,
  fakeLogger,
  handlerRequest,
  PAYMENT_ROW,
  testEnv,
} from '../_shared/testing.ts';
import { checkoutProviderForCurrency, handleCheckout } from './handler.ts';

const JP_CONSENT: ConsentSubmission = {
  jurisdiction: 'JP',
  locale: 'en',
  noticeVersion: 'jp-tokushoho-disclosure-v1',
  consentVersion: 'jp-refunds-consent-v1',
  consentGranted: true,
  noticeTextSnapshot: 'seller disclosure',
  consentTextSnapshot: 'refund disclosure',
};

const CATALOG_USD = {
  book_id: 'book-usd',
  slug: 'business-email-usd',
  currency: 'USD',
  amount_minor: 1234,
  published_revision: 'business-email-usd@e1-r1',
  released_at: '2026-01-01T00:00:00Z',
};

function paypalFake(): PaymentProviderAdapter & {
  createCheckout: ReturnType<typeof vi.fn>;
} {
  return {
    createCheckout: vi.fn().mockResolvedValue({
      action: 'https://www.sandbox.paypal.com/checkoutnow?token=P1',
      fields: {},
      method: 'GET',
      provider: 'paypal',
      merchantReference: 'BJH123456789',
    }),
    verifyCallback: vi.fn(),
    confirmPayment: vi.fn(),
    refund: vi.fn(),
  } as unknown as PaymentProviderAdapter & { createCheckout: ReturnType<typeof vi.fn> };
}

function setupUsd(withPaypal = true) {
  const payment = {
    ...PAYMENT_ROW,
    provider: 'paypal',
    amount_minor: 1234,
    currency: 'USD',
  };
  const mock = createMockDb({
    'auth:getUser': { data: { id: 'user-1' } },
    catalog: { data: CATALOG_USD },
    platform_tax_config: {
      data: { id: 1, key: 'japan_consumption_tax_status', value: 'taxable' },
    },
    orders: { data: { id: 'ord-1' } },
    order_compliance: { data: null },
    payments: { data: payment },
  });
  const ecpay = createFakeAdapter();
  const paypal = paypalFake();
  return {
    mock,
    ecpay,
    paypal,
    deps: {
      env: testEnv(),
      db: mock.db,
      adapter: ecpay,
      adapters: withPaypal ? { ecpay, paypal } : { ecpay },
      log: fakeLogger(),
      now: () => new Date('2026-08-17T00:00:00Z'),
      random: () => 0.5,
    },
  };
}

describe('checkout second-provider seam (#21)', () => {
  it('maps only server catalog currencies to their providers', () => {
    expect(checkoutProviderForCurrency('TWD')).toBe('ecpay');
    expect(checkoutProviderForCurrency('USD')).toBe('paypal');
    expect(checkoutProviderForCurrency('JPY')).toBeNull();
    expect(checkoutProviderForCurrency('usd')).toBeNull();
  });

  it('selects PayPal from authoritative USD catalog price, persists paypal/USD, and returns GET approval', async () => {
    const { mock, ecpay, paypal, deps } = setupUsd();
    const result = await handleCheckout(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/checkout/books/book-usd',
        JSON.stringify({
          bookId: 'book-usd',
          consent: JP_CONSENT,
          // Adversarial client fields: all must be ignored.
          currency: 'TWD',
          provider: 'ecpay',
          amount: 1,
        }),
        bearerHeaders('jwt-1'),
      ),
      deps,
    );

    expect(result.status).toBe(200);
    const response = JSON.parse(result.body);
    expect(response.instruction).toMatchObject({
      provider: 'paypal',
      method: 'GET',
      action: 'https://www.sandbox.paypal.com/checkoutnow?token=P1',
    });

    expect(ecpay.createCheckout).not.toHaveBeenCalled();
    expect(paypal.createCheckout).toHaveBeenCalledTimes(1);
    expect(paypal.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ord-1',
        paymentId: 'pay-1',
        amount: { amount: 1234, currency: 'USD' },
        locale: 'en',
        returnUrl: 'https://test.supabase.co/functions/v1/paypal-browser-return?order=ord-1',
        orderResultUrl:
          'https://test.supabase.co/functions/v1/paypal-browser-return?order=ord-1&cancel=1',
      }),
    );

    expect(mock.callsFor('payments', 'insert')[0].args[0]).toMatchObject({
      order_id: 'ord-1',
      provider: 'paypal',
      amount_minor: 1234,
      currency: 'USD',
      status: 'created',
    });
    expect(mock.callsFor('orders', 'insert')[0].args[0]).toMatchObject({
      amount_minor: 1234,
      currency: 'USD',
      jurisdiction: 'JP',
      japan_tax_status_snapshot: 'taxable',
    });
  });

  it('fails closed before provider handoff when USD catalog exists but PayPal is not configured', async () => {
    const { mock, ecpay, paypal, deps } = setupUsd(false);
    const result = await handleCheckout(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/checkout/books/book-usd',
        JSON.stringify({ bookId: 'book-usd', consent: JP_CONSENT }),
        bearerHeaders('jwt-1'),
      ),
      deps,
    );

    expect(result.status).toBe(503);
    expect(JSON.parse(result.body)).toMatchObject({ reason: 'provider_unavailable' });
    expect(ecpay.createCheckout).not.toHaveBeenCalled();
    expect(paypal.createCheckout).not.toHaveBeenCalled();
    expect(mock.callsFor('orders', 'insert')).toHaveLength(0);
    expect(mock.callsFor('payments', 'insert')).toHaveLength(0);
  });

  it('fails closed on a catalog currency that has no configured launch provider', async () => {
    const { mock, deps } = setupUsd();
    mock.setRoute('catalog', { data: { ...CATALOG_USD, currency: 'JPY' } });

    const result = await handleCheckout(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/checkout/books/book-usd',
        JSON.stringify({ bookId: 'book-usd', consent: JP_CONSENT }),
        bearerHeaders('jwt-1'),
      ),
      deps,
    );

    expect(result.status).toBe(422);
    expect(JSON.parse(result.body)).toMatchObject({ reason: 'unsupported_currency' });
    expect(mock.callsFor('orders', 'insert')).toHaveLength(0);
    expect(mock.callsFor('payments', 'insert')).toHaveLength(0);
  });
});
