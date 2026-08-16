import { describe, expect, it, vi } from 'vitest';
import type {
  PaymentProviderAdapter,
  ProviderPaymentSnapshot,
  VerifiedProviderEvent,
} from '../../../src/lib/payments/contract.ts';
import {
  createMockDb,
  fakeLogger,
  handlerRequest,
  ORDER_ROW,
  PAYMENT_ROW,
} from '../_shared/testing.ts';
import { handlePaypalWebhook } from './handler.ts';

const EVENT: VerifiedProviderEvent = {
  provider: 'paypal',
  providerMerchantRef: 'PP-REF-1',
  providerPaymentRef: 'PAYPAL-ORDER-1',
  eventFingerprint: 'WH-EVENT-1',
  status: 'unknown',
  amount: { amount: 1234, currency: 'USD' },
  rawStatusCode: 'CHECKOUT.ORDER.APPROVED',
};

const SNAPSHOT: ProviderPaymentSnapshot = {
  provider: 'paypal',
  merchantReference: 'PP-REF-1',
  providerPaymentReference: 'CAPTURE-1',
  status: 'succeeded',
  amount: { amount: 1234, currency: 'USD' },
  paidAt: '2026-08-17T00:02:00Z',
  rawStatusCode: 'COMPLETED',
};

const PAYPAL_PAYMENT = {
  ...PAYMENT_ROW,
  provider: 'paypal',
  provider_merchant_ref: 'PP-REF-1',
  provider_payment_ref: null,
  amount_minor: 1234,
  currency: 'USD',
  status: 'pending' as const,
};

const USD_ORDER = {
  ...ORDER_ROW,
  amount_minor: 1234,
  currency: 'USD',
  status: 'pending' as const,
};

function adapter(options: {
  event?: VerifiedProviderEvent;
  snapshot?: ProviderPaymentSnapshot;
  confirmError?: Error;
} = {}): PaymentProviderAdapter & {
  verifyCallback: ReturnType<typeof vi.fn>;
  confirmPayment: ReturnType<typeof vi.fn>;
} {
  const verifyCallback = vi.fn().mockResolvedValue(options.event ?? EVENT);
  const confirmPayment = options.confirmError
    ? vi.fn().mockRejectedValue(options.confirmError)
    : vi.fn().mockResolvedValue(options.snapshot ?? SNAPSHOT);
  return {
    createCheckout: vi.fn(),
    verifyCallback,
    confirmPayment,
    refund: vi.fn(),
  } as unknown as PaymentProviderAdapter & {
    verifyCallback: ReturnType<typeof vi.fn>;
    confirmPayment: ReturnType<typeof vi.fn>;
  };
}

function setup(providerAdapter = adapter()) {
  const mock = createMockDb({
    payment_events: { data: { id: 'evt-row-1' } },
    payments: { data: PAYPAL_PAYMENT },
    orders: { data: USD_ORDER },
    'rpc:grant_entitlement': { data: null },
  });
  return {
    mock,
    providerAdapter,
    deps: {
      db: mock.db,
      adapter: providerAdapter,
      log: fakeLogger(),
      now: () => new Date('2026-08-17T00:03:00Z'),
    },
  };
}

function webhookRequest() {
  return handlerRequest(
    'POST',
    'https://test.supabase.co/functions/v1/paypal-webhook',
    JSON.stringify({ id: 'raw-provider-event-with-pii-not-persisted' }),
    {
      'paypal-transmission-id': 'TX-1',
      'paypal-transmission-time': '2026-08-17T00:00:00Z',
      'paypal-transmission-sig': 'sig',
      'paypal-cert-url': 'https://api-m.sandbox.paypal.com/cert.pem',
      'paypal-auth-algo': 'SHA256withRSA',
    },
  );
}

describe('PayPal webhook orchestration (#21)', () => {
  it('verifies, authoritatively captures/queries, and grants exactly one PayPal entitlement', async () => {
    const { mock, providerAdapter, deps } = setup();

    const result = await handlePaypalWebhook(webhookRequest(), deps);

    expect(result.status).toBe(200);
    expect(providerAdapter.verifyCallback).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'paypal', form: {}, bodyText: expect.any(String) }),
    );
    expect(providerAdapter.confirmPayment).toHaveBeenCalledWith(EVENT);

    const eventInsert = mock.callsFor('payment_events', 'insert')[0].args[0];
    expect(eventInsert).toMatchObject({
      provider: 'paypal',
      provider_merchant_ref: 'PP-REF-1',
      event_fingerprint: 'WH-EVENT-1',
      signature_valid: true,
    });
    expect(JSON.stringify(eventInsert)).not.toContain('raw-provider-event-with-pii-not-persisted');

    expect(mock.callsFor('rpc:grant_entitlement', 'rpc')).toHaveLength(1);
    expect(mock.callsFor('rpc:grant_entitlement', 'rpc')[0].args[1]).toMatchObject({
      p_provider: 'paypal',
      p_provider_ref: 'CAPTURE-1',
      p_source_order_id: USD_ORDER.id,
      p_book_id: USD_ORDER.book_id,
    });

    const eventUpdates = mock.callsFor('payment_events', 'update');
    expect(eventUpdates.some((call) => call.args[0]?.processing_result === 'success_granted')).toBe(true);
  });

  it('replayed success is idempotent when local payment/order already reflect the first success', async () => {
    const { mock, deps } = setup();
    const first = await handlePaypalWebhook(webhookRequest(), deps);
    expect(first.status).toBe(200);
    expect(mock.callsFor('rpc:grant_entitlement', 'rpc')).toHaveLength(1);

    mock.setRoute('payments', {
      data: { ...PAYPAL_PAYMENT, provider_payment_ref: 'CAPTURE-1', status: 'succeeded' },
    });
    mock.setRoute('orders', { data: { ...USD_ORDER, status: 'paid' } });

    const replay = await handlePaypalWebhook(webhookRequest(), deps);
    expect(replay.status).toBe(200);
    expect(mock.callsFor('rpc:grant_entitlement', 'rpc')).toHaveLength(1);
  });

  it('never grants when authoritative PayPal amount differs from the immutable local USD amount', async () => {
    const mismatch = adapter({
      snapshot: { ...SNAPSHOT, amount: { amount: 1235, currency: 'USD' } },
    });
    const { mock, deps } = setup(mismatch);

    const result = await handlePaypalWebhook(webhookRequest(), deps);

    expect(result.status).toBe(200);
    expect(mock.callsFor('rpc:grant_entitlement', 'rpc')).toHaveLength(0);
    const updates = mock.callsFor('payments', 'update');
    expect(updates.some((call) => call.args[0]?.status === 'verification_pending')).toBe(true);
    const eventUpdates = mock.callsFor('payment_events', 'update');
    expect(
      eventUpdates.some(
        (call) => call.args[0]?.processing_result === 'paypal_success_invariant_mismatch',
      ),
    ).toBe(true);
  });

  it('maps an authoritative failed capture/query to payment_failed and completes the receipt', async () => {
    const failed = adapter({
      snapshot: {
        ...SNAPSHOT,
        status: 'failed',
        paidAt: undefined,
        rawStatusCode: 'DECLINED',
      },
    });
    const { mock, deps } = setup(failed);

    const result = await handlePaypalWebhook(webhookRequest(), deps);

    expect(result.status).toBe(200);
    expect(mock.callsFor('rpc:grant_entitlement', 'rpc')).toHaveLength(0);
    const paymentUpdates = mock.callsFor('payments', 'update');
    expect(paymentUpdates.some((call) => call.args[0]?.status === 'failed')).toBe(true);
    const eventUpdates = mock.callsFor('payment_events', 'update');
    expect(eventUpdates.some((call) => call.args[0]?.processing_result === 'paypal_failed')).toBe(true);
  });

  it('persists verification_pending and returns 5xx on transient capture/query failure so PayPal can retry', async () => {
    const failing = adapter({ confirmError: new Error('provider timeout') });
    const { mock, deps } = setup(failing);

    const result = await handlePaypalWebhook(webhookRequest(), deps);

    expect(result.status).toBe(500);
    expect(mock.callsFor('rpc:grant_entitlement', 'rpc')).toHaveLength(0);
    const updates = mock.callsFor('payments', 'update');
    expect(updates.some((call) => call.args[0]?.status === 'verification_pending')).toBe(true);
  });

  it('rejects unverifiable webhooks before durable event/state mutation', async () => {
    const bad = adapter();
    bad.verifyCallback.mockRejectedValue(new Error('bad signature'));
    const { mock, deps } = setup(bad);

    const result = await handlePaypalWebhook(webhookRequest(), deps);

    expect(result.status).toBe(400);
    expect(mock.callsFor('payment_events', 'insert')).toHaveLength(0);
    expect(mock.callsFor('payments', 'update')).toHaveLength(0);
    expect(mock.callsFor('rpc:grant_entitlement', 'rpc')).toHaveLength(0);
  });
});
