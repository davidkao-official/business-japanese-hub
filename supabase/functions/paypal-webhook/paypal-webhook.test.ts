/**
 * PayPal webhook handler tests (§21 — mirrors §4.4/§4.5/§13).
 *
 * Injected fake Env / DbClient / PayPal adapter. Covers: forged / unverified
 * webhook rejection, unknown custom_id, amount/currency mismatch, verified
 * success (+ exactly one entitlement), replay idempotency, failed event, and
 * APPROVED → capture flow. The adapter's signature verification is faked — these
 * tests exercise the handler's durable-receipt + dispatch + grant paths.
 */
import { describe, expect, it } from 'vitest';
import {
  createMockDb,
  createFakeAdapter,
  testEnv,
  fakeLogger,
  handlerRequest,
} from '../_shared/testing.ts';
import { handlePaypalWebhook } from './handler.ts';
import type { VerifiedProviderEvent, ProviderPaymentSnapshot } from '../../../src/lib/payments/contract.ts';

const PAYMENT_ROW_USD = {
  id: 'pay-1',
  order_id: 'ord-1',
  provider: 'paypal',
  provider_merchant_ref: 'BJH202608160001',
  provider_payment_ref: null,
  amount_minor: 1999,
  currency: 'USD',
  method: 'credit',
  status: 'pending',
  provider_status_code: null,
  provider_status_message: null,
  created_at: '2026-08-16T08:00:00Z',
  paid_at: null,
  last_verified_at: null,
  provider_fee_amount_minor: null,
  reconciliation_status: null,
};

const ORDER_ROW_USD = {
  id: 'ord-1',
  user_id: 'user-1',
  book_id: 'book-a',
  item_name_snapshot: 'keigo-essentials',
  published_revision: 'keigo-essentials@e1-r1',
  amount_minor: 1999,
  currency: 'USD',
  status: 'pending',
  jurisdiction: 'TW',
  japan_tax_status_snapshot: 'unresolved',
  created_at: '2026-08-16T08:00:00Z',
  paid_at: null,
  refunded_at: null,
};

const EVENT_OK: VerifiedProviderEvent = {
  provider: 'paypal',
  providerMerchantRef: 'BJH202608160001',
  providerPaymentRef: 'ORDER-1',
  eventFingerprint: 'fp-ok-1',
  status: 'succeeded',
  amount: { amount: 1999, currency: 'USD' },
  paidAt: '2026-08-16T12:00:00Z',
  rawStatusCode: 'COMPLETED',
};

const SNAPSHOT_OK: ProviderPaymentSnapshot = {
  provider: 'paypal',
  merchantReference: 'BJH202608160001',
  providerPaymentReference: 'CAPTURE-1',
  status: 'succeeded',
  amount: { amount: 1999, currency: 'USD' },
  paidAt: '2026-08-16T12:00:00Z',
  rawStatusCode: 'COMPLETED',
};

const WEBHOOK_BODY = JSON.stringify({
  id: 'WEBHOOK-1',
  event_type: 'PAYMENT.CAPTURE.COMPLETED',
  resource: { id: 'CAPTURE-1', status: 'COMPLETED', custom_id: 'BJH202608160001', amount: { currency_code: 'USD', value: '19.99' }, supplementary_data: { related_ids: { order_id: 'ORDER-1' } } },
});

const WEBHOOK_HEADERS = {
  'paypal-transmission-id': 'TX-1',
  'paypal-transmission-time': '2026-08-16T12:00:00Z',
  'paypal-transmission-sig': 'SIG-1',
  'paypal-cert-url': 'https://api-m.sandbox.paypal.com/cert',
  'paypal-auth-algo': 'SHA256withRSA',
};

function baseMock(overrides: Record<string, unknown> = {}) {
  const mock = createMockDb({
    payment_events: { data: { id: 'evt-1' } },
    payments: { data: PAYMENT_ROW_USD },
    orders: { data: ORDER_ROW_USD },
    'rpc:grant_entitlement': { data: null },
    ...overrides,
  });
  const adapter = createFakeAdapter('paypal');
  adapter.verifyCallback.mockResolvedValue(EVENT_OK);
  adapter.confirmPayment.mockResolvedValue(SNAPSHOT_OK);
  return { mock, adapter };
}

function run(
  adapter: ReturnType<typeof createFakeAdapter>,
  db: ReturnType<typeof createMockDb>['db'],
  body = WEBHOOK_BODY,
  headers = WEBHOOK_HEADERS,
) {
  return handlePaypalWebhook(handlerRequest('POST', 'https://test.supabase.co/functions/v1/paypal-webhook', body, headers), {
    env: testEnv(),
    db,
    adapter,
    log: fakeLogger(),
    now: () => new Date('2026-08-16T12:00:00Z'),
  });
}

describe('paypal-webhook handler', () => {
  it('fails closed (503) when PayPal is NOT configured — no processing, no grant', async () => {
    const { mock, adapter } = baseMock();
    const result = await handlePaypalWebhook(
      handlerRequest('POST', 'https://test.supabase.co/functions/v1/paypal-webhook', WEBHOOK_BODY, WEBHOOK_HEADERS),
      {
        env: testEnv({ paypalClientId: undefined, paypalClientSecret: undefined, paypalWebhookId: undefined }),
        db: mock.db,
        adapter,
        log: fakeLogger(),
      },
    );
    expect(result.status).toBe(503);
    expect(JSON.parse(result.body)).toMatchObject({ reason: 'provider_configuration_unavailable' });
    // Never acks, never persists an event, never grants.
    expect(mock.callsFor('payment_events', 'insert').length).toBe(0);
    expect(mock.rpcCalls('grant_entitlement').length).toBe(0);
  });

  it('forged / unverified webhook → rejected (no ack, no processing)', async () => {
    const { mock, adapter } = baseMock();
    adapter.verifyCallback.mockRejectedValue(new Error('invalid webhook signature or payload'));
    const result = await run(adapter, mock.db);
    expect(result.status).toBe(400);
    expect(mock.callsFor('payment_events', 'insert').length).toBe(0);
    expect(mock.rpcCalls('grant_entitlement').length).toBe(0);
  });

  it('verified CAPTURE.COMPLETED success → payment succeeded + order paid + exactly one entitlement', async () => {
    const { mock, adapter } = baseMock();
    const result = await run(adapter, mock.db);
    expect(result.status).toBe(200);

    const paymentUpdate = mock.callsFor('payments', 'update')[0];
    expect(paymentUpdate.args[0]).toMatchObject({ status: 'succeeded', provider_payment_ref: 'CAPTURE-1' });
    const orderUpdate = mock.callsFor('orders', 'update')[0];
    expect(orderUpdate.args[0]).toMatchObject({ status: 'paid' });
    expect(mock.rpcCalls('grant_entitlement').length).toBe(1);
    const grant = mock.rpcCalls('grant_entitlement')[0];
    expect(grant.args[0]).toMatchObject({ p_provider: 'paypal', p_source_order_id: 'ord-1' });
  });

  it('duplicate / replayed webhook → re-processed idempotently against persisted state (no second grant)', async () => {
    const { mock, adapter } = baseMock();
    // First delivery is processed (durable receipt inserted → grant).
    const first = await run(adapter, mock.db);
    expect(first.status).toBe(200);
    expect(mock.rpcCalls('grant_entitlement').length).toBe(1);
    // A replayed delivery hits the UNIQUE(provider, event_fingerprint) no-op
    // (insert returns no row) → the handler re-runs the idempotent path against
    // the PERSISTED state (order now paid), so it acks and grants nothing more.
    mock.setRoute('payment_events', { data: null });
    mock.setRoute('orders', { data: { ...ORDER_ROW_USD, status: 'paid', paid_at: '2026-08-16T12:00:00Z' } });
    mock.setRoute('payments', { data: { ...PAYMENT_ROW_USD, status: 'succeeded', paid_at: '2026-08-16T12:00:00Z' } });
    const second = await run(adapter, mock.db);
    expect(second.status).toBe(200);
    expect(mock.rpcCalls('grant_entitlement').length).toBe(1);
  });

  it('replay after a partial first-delivery failure self-heals: grant re-applied, order paid', async () => {
    const { mock, adapter } = baseMock();
    // First delivery: durable receipt lands, then the grant RPC fails → the
    // handler returns 500 (no ack). Grant-first ordering in applyVerifiedSuccess
    // leaves the order PENDING (payment was updated to succeeded).
    mock.setRoute('rpc:grant_entitlement', { error: 'grant_entitlement: internal error' });
    const first = await run(adapter, mock.db);
    expect(first.status).toBe(500);
    expect(mock.rpcCalls('grant_entitlement').length).toBe(1); // attempted once
    mock.setRoute('payments', { data: { ...PAYMENT_ROW_USD, status: 'succeeded', paid_at: '2026-08-16T12:00:00Z' } });

    // PayPal re-delivers the SAME event; the durable receipt dedups, but the
    // handler re-processes idempotently and the grant now lands → order paid.
    mock.setRoute('payment_events', { data: null });
    mock.setRoute('rpc:grant_entitlement', { data: null });
    const retry = await run(adapter, mock.db);
    expect(retry.status).toBe(200);
    expect(mock.rpcCalls('grant_entitlement').length).toBe(2); // re-applied
    const orderUpdate = mock.callsFor('orders', 'update')[0];
    expect(orderUpdate.args[0]).toMatchObject({ status: 'paid' });
  });

  it('unknown custom_id → no entitlement, not acknowledged as processed', async () => {
    const { mock, adapter } = baseMock({ payments: { data: null } });
    const result = await run(adapter, mock.db);
    expect(result.status).toBe(404);
    expect(mock.rpcCalls('grant_entitlement').length).toBe(0);
  });

  it('amount / currency mismatch → no entitlement (verification_pending)', async () => {
    const { mock, adapter } = baseMock();
    adapter.confirmPayment.mockResolvedValue({
      ...SNAPSHOT_OK,
      amount: { amount: 2999, currency: 'USD' }, // provider captured a different amount
    });
    const result = await run(adapter, mock.db);
    expect(result.status).toBe(200);
    expect(mock.rpcCalls('grant_entitlement').length).toBe(0);
    const paymentUpdate = mock.callsFor('payments', 'update')[0];
    expect(paymentUpdate.args[0]).toMatchObject({ status: 'verification_pending' });
  });

  it('non-USD provider amount → no entitlement (currency mismatch)', async () => {
    const { mock, adapter } = baseMock();
    adapter.confirmPayment.mockResolvedValue({
      ...SNAPSHOT_OK,
      amount: { amount: 1999, currency: 'JPY' },
    });
    const result = await run(adapter, mock.db);
    expect(result.status).toBe(200);
    expect(mock.rpcCalls('grant_entitlement').length).toBe(0);
  });

  it('DENIED event → payment failed (terminal)', async () => {
    const { mock, adapter } = baseMock();
    adapter.verifyCallback.mockResolvedValue({ ...EVENT_OK, status: 'failed', rawStatusCode: 'DECLINED' });
    const result = await run(adapter, mock.db);
    expect(result.status).toBe(200);
    const paymentUpdate = mock.callsFor('payments', 'update')[0];
    expect(paymentUpdate.args[0]).toMatchObject({ status: 'failed' });
    expect(mock.rpcCalls('grant_entitlement').length).toBe(0);
  });

  it('APPROVED event → confirmPayment captures → verified success grants exactly once', async () => {
    const { mock, adapter } = baseMock();
    adapter.verifyCallback.mockResolvedValue({ ...EVENT_OK, status: 'unknown', rawStatusCode: 'APPROVED' });
    adapter.confirmPayment.mockResolvedValue(SNAPSHOT_OK);
    const result = await run(adapter, mock.db);
    expect(result.status).toBe(200);
    expect(adapter.confirmPayment).toHaveBeenCalledTimes(1);
    expect(mock.rpcCalls('grant_entitlement').length).toBe(1);
  });

  it('B5: a CAPTURE.COMPLETED without resource.custom_id correlates via the related order and grants exactly once', async () => {
    // The adapter resolves the merchant ref from the authoritative PayPal Order
    // (payload has capture id / amount / status / related order id, NO custom_id).
    // Here verifyCallback is faked to the resolved event; the handler must still
    // correlate by provider_merchant_ref and grant exactly once (§21/B5).
    const { mock, adapter } = baseMock();
    adapter.verifyCallback.mockResolvedValue({
      ...EVENT_OK,
      providerMerchantRef: 'BJH202608160001',
      providerPaymentRef: 'ORDER-1',
    });
    adapter.confirmPayment.mockResolvedValue(SNAPSHOT_OK);
    const result = await run(adapter, mock.db);
    expect(result.status).toBe(200);
    expect(mock.rpcCalls('grant_entitlement').length).toBe(1);
  });

  it('B5: never grants when the correlated custom_id matches no local payment', async () => {
    const { mock, adapter } = baseMock({ payments: { data: null } });
    // The resolved order custom_id is not this payment's merchant ref.
    adapter.verifyCallback.mockResolvedValue({ ...EVENT_OK, providerMerchantRef: 'SOMEONE-ELSE' });
    const result = await run(adapter, mock.db);
    expect(result.status).toBe(404);
    expect(mock.rpcCalls('grant_entitlement').length).toBe(0);
  });

  it('second real success on an already-paid order → duplicate_success, never a second entitlement', async () => {
    const { mock, adapter } = baseMock({
      // The order was already paid by an EARLIER payment; this is a genuine
      // second charge (double charge), not a replay of this payment's success.
      orders: { data: { ...ORDER_ROW_USD, status: 'paid', paid_at: '2026-08-16T11:00:00Z' } },
      book_entitlement: { data: [{ user_id: 'user-1', book_id: 'book-a', provider: 'paypal' }] },
    });
    const result = await run(adapter, mock.db);
    expect(result.status).toBe(200);
    // Exactly one grant — and it came from the FIRST payment, never this one.
    expect(mock.rpcCalls('grant_entitlement').length).toBe(0);
    const paymentUpdates = mock.callsFor('payments', 'update');
    // The second genuine charge is marked duplicate_success for finance review
    // (first update is its own pending → succeeded; second is succeeded →
    // duplicate_success), and NEVER grants a second entitlement.
    expect(paymentUpdates[paymentUpdates.length - 1].args[0]).toMatchObject({ status: 'duplicate_success' });
    // The order stays paid — a paid order never downgrades.
    expect(mock.callsFor('orders', 'update').length).toBe(0);
  });

  it('confirmPayment ambiguous (pending) → durable verification_pending, no grant', async () => {
    const { mock, adapter } = baseMock();
    adapter.confirmPayment.mockResolvedValue({ ...SNAPSHOT_OK, status: 'pending', rawStatusCode: 'PENDING' });
    const result = await run(adapter, mock.db);
    expect(result.status).toBe(200);
    const paymentUpdate = mock.callsFor('payments', 'update')[0];
    expect(paymentUpdate.args[0]).toMatchObject({ status: 'verification_pending' });
    expect(mock.rpcCalls('grant_entitlement').length).toBe(0);
  });

  it('method not POST → 405', async () => {
    const { mock, adapter } = baseMock();
    const result = await handlePaypalWebhook(
      handlerRequest('GET', 'https://test.supabase.co/functions/v1/paypal-webhook'),
      { env: testEnv(), db: mock.db, adapter, log: fakeLogger() },
    );
    expect(result.status).toBe(405);
  });
});
