/**
 * ECPay ReturnURL callback handler tests (decision-record §4.4/§4.5/§6/§13).
 *
 * Injected fake Env / DbClient / ECPay adapter. Covers: forged/invalid CheckMac
 * rejection, unknown MerchantTradeNo, wrong amount, SimulatePaid, verified
 * success (+ exactly one entitlement), replay idempotency, late failed callback
 * (succeeded never downgraded), QueryTradeInfo-unavailable → verification_pending,
 * and DB-failure → no `1|OK`.
 */
import { describe, expect, it } from 'vitest';
import {
  createMockDb,
  createFakeAdapter,
  testEnv,
  fakeLogger,
  handlerRequest,
  PAYMENT_ROW,
  ORDER_ROW,
} from '../_shared/testing.ts';
import { handleEcpayCallback } from './handler.ts';
import type { VerifiedProviderEvent, ProviderPaymentSnapshot } from '../../../src/lib/payments/contract.ts';

const FORM_OK = {
  MerchantID: '2000132',
  MerchantTradeNo: 'BJH123456789',
  TradeNo: 'ECPAY-TRADE-1',
  TradeAmt: '790',
  PaymentDate: '2026/08/16 12:00:00',
  PaymentType: 'Credit',
  RtnCode: '1',
  RtnMsg: 'Succeeded',
  SimulatePaid: '0',
  CheckMacValue: 'MOCK-MAC',
};

const EVENT_OK: VerifiedProviderEvent = {
  provider: 'ecpay',
  providerMerchantRef: 'BJH123456789',
  providerPaymentRef: 'ECPAY-TRADE-1',
  eventFingerprint: 'fp-ok-1',
  status: 'succeeded',
  amount: { amount: 79000, currency: 'TWD' },
  paidAt: '2026/08/16 12:00:00',
  rawStatusCode: '1',
};

const SNAPSHOT_OK: ProviderPaymentSnapshot = {
  provider: 'ecpay',
  merchantReference: 'BJH123456789',
  providerPaymentReference: 'ECPAY-TRADE-1',
  status: 'succeeded',
  amount: { amount: 79000, currency: 'TWD' },
  paidAt: '2026/08/16 12:00:00',
  rawStatusCode: '1',
  queryResponse: {
    merchantTradeNo: 'BJH123456789',
    tradeNo: 'ECPAY-TRADE-1',
    tradeAmt: '790',
    tradeStatus: '1',
  },
};

function formBody(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

function baseMock(overrides: Record<string, unknown> = {}) {
  const mock = createMockDb({
    payment_events: { data: { id: 'evt-1' } },
    payments: { data: PAYMENT_ROW },
    orders: { data: ORDER_ROW },
    'rpc:grant_entitlement': { data: null },
    ...overrides,
  });
  const adapter = createFakeAdapter();
  adapter.verifyCallback.mockResolvedValue(EVENT_OK);
  adapter.confirmPayment.mockResolvedValue(SNAPSHOT_OK);
  return { mock, adapter };
}

function run(form: Record<string, string>, adapter: ReturnType<typeof createFakeAdapter>, db: ReturnType<typeof createMockDb>['db']) {
  return handleEcpayCallback(
    handlerRequest('POST', 'https://test.supabase.co/functions/v1/ecpay-callback', formBody(form)),
    {
      env: testEnv(),
      db,
      adapter,
      log: fakeLogger(),
      now: () => new Date('2026-08-16T12:00:00Z'),
    },
  );
}

describe('ecpay-callback handler', () => {
  it('forged CheckMac → rejected (no ack, no processing)', async () => {
    const { mock, adapter } = baseMock();
    adapter.verifyCallback.mockRejectedValue(new Error('Invalid ECPay CheckMacValue for callback'));
    const result = await run(FORM_OK, adapter, mock.db);
    expect(result.status).toBe(400);
    expect(result.body).not.toBe('1|OK');
    expect(mock.callsFor('payment_events', 'insert').length).toBe(0);
    expect(mock.rpcCalls('grant_entitlement').length).toBe(0);
  });

  it('invalid CheckMacValue (missing MAC) → rejected', async () => {
    const { mock, adapter } = baseMock();
    adapter.verifyCallback.mockRejectedValue(new Error('ecpay callback missing CheckMacValue'));
    const result = await run({ ...FORM_OK, CheckMacValue: '' }, adapter, mock.db);
    expect(result.status).toBe(400);
    expect(result.body).not.toBe('1|OK');
    expect(mock.rpcCalls('grant_entitlement').length).toBe(0);
  });

  it('unknown MerchantTradeNo → no entitlement, not acknowledged as processed', async () => {
    const { mock, adapter } = baseMock({ payments: { data: null } });
    const result = await run(FORM_OK, adapter, mock.db);
    expect(result.status).toBe(404);
    expect(result.body).not.toBe('1|OK');
    expect(mock.rpcCalls('grant_entitlement').length).toBe(0);
  });

  it('wrong amount → no entitlement; durable verification_pending; 1|OK', async () => {
    const { mock, adapter } = baseMock();
    // The QUERY response itself reports a mismatched amount — the §4.4 predicate
    // must catch it (query.tradeAmt !== local amount), never grant.
    adapter.confirmPayment.mockResolvedValue({
      ...SNAPSHOT_OK,
      queryResponse: { ...SNAPSHOT_OK.queryResponse, tradeAmt: '800' },
    });
    const result = await run(FORM_OK, adapter, mock.db);
    expect(result.status).toBe(200);
    expect(result.body).toBe('1|OK');
    expect(mock.rpcCalls('grant_entitlement').length).toBe(0);
    const paymentUpdate = mock.callsFor('payments', 'update')[0];
    expect(paymentUpdate.args[0]).toMatchObject({ status: 'verification_pending' });
  });

  it('SimulatePaid=1 with RtnCode=1 → no entitlement (not a real charge)', async () => {
    const { mock, adapter } = baseMock();
    adapter.verifyCallback.mockResolvedValue({
      ...EVENT_OK,
      status: 'unknown',
      eventFingerprint: 'fp-simulated',
      rawStatusCode: '1',
    });
    const result = await run({ ...FORM_OK, SimulatePaid: '1' }, adapter, mock.db);
    expect(result.status).toBe(200);
    expect(result.body).toBe('1|OK');
    expect(adapter.confirmPayment).not.toHaveBeenCalled();
    expect(mock.rpcCalls('grant_entitlement').length).toBe(0);
    const paymentUpdate = mock.callsFor('payments', 'update')[0];
    expect(paymentUpdate.args[0]).toMatchObject({ status: 'verification_pending' });
  });

  it('verified → payment succeeded + order paid + exactly one entitlement; 1|OK', async () => {
    const { mock, adapter } = baseMock();
    const result = await run(FORM_OK, adapter, mock.db);
    expect(result.status).toBe(200);
    expect(result.body).toBe('1|OK');
    expect(adapter.confirmPayment).toHaveBeenCalledTimes(1);

    const paymentUpdate = mock.callsFor('payments', 'update')[0];
    expect(paymentUpdate.args[0]).toMatchObject({ status: 'succeeded' });
    const orderUpdate = mock.callsFor('orders', 'update')[0];
    expect(orderUpdate.args[0]).toMatchObject({ status: 'paid' });
    expect(mock.rpcCalls('grant_entitlement').length).toBe(1);
    const grantArgs = mock.rpcCalls('grant_entitlement')[0].args[0] as Record<string, unknown>;
    expect(grantArgs).toMatchObject({
      p_user_id: 'user-1',
      p_book_id: 'book-a',
      p_provider: 'ecpay',
      p_source_order_id: 'ord-1',
    });
  });

  it('double charge: second genuine success on an already-paid order → duplicate_success, no second grant', async () => {
    const secondRef = 'BJH987654321';
    const { mock, adapter } = baseMock({
      orders: { data: { ...ORDER_ROW, status: 'paid' } },
      payments: { data: { ...PAYMENT_ROW, provider_merchant_ref: secondRef, status: 'pending' } },
    });
    const secondEvent: VerifiedProviderEvent = {
      provider: 'ecpay',
      providerMerchantRef: secondRef,
      providerPaymentRef: 'ECPAY-TRADE-2',
      eventFingerprint: 'fp-double-1',
      status: 'succeeded',
      amount: { amount: 79000, currency: 'TWD' },
      paidAt: '2026/08/16 13:00:00',
      rawStatusCode: '1',
    };
    const secondSnapshot: ProviderPaymentSnapshot = {
      provider: 'ecpay',
      merchantReference: secondRef,
      providerPaymentReference: 'ECPAY-TRADE-2',
      status: 'succeeded',
      amount: { amount: 79000, currency: 'TWD' },
      paidAt: '2026/08/16 13:00:00',
      rawStatusCode: '1',
      queryResponse: {
        merchantTradeNo: secondRef,
        tradeNo: 'ECPAY-TRADE-2',
        tradeAmt: '790',
        tradeStatus: '1',
      },
    };
    adapter.verifyCallback.mockResolvedValue(secondEvent);
    adapter.confirmPayment.mockResolvedValue(secondSnapshot);

    const result = await run(
      { ...FORM_OK, MerchantTradeNo: secondRef, TradeNo: 'ECPAY-TRADE-2' },
      adapter,
      mock.db,
    );
    expect(result.status).toBe(200);
    expect(result.body).toBe('1|OK');

    // The second payment is marked duplicate_success (the finance review signal)…
    const paymentUpdates = mock.callsFor('payments', 'update');
    const lastPaymentUpdate = paymentUpdates[paymentUpdates.length - 1];
    expect(lastPaymentUpdate.args[0]).toMatchObject({ status: 'duplicate_success' });
    // …and NO second entitlement is granted (order was already paid).
    expect(mock.rpcCalls('grant_entitlement').length).toBe(0);
  });

  it('same callback twice (replay) → one transition, one entitlement, idempotent 1|OK', async () => {
    const { mock, adapter } = baseMock();
    const first = await run(FORM_OK, adapter, mock.db);
    expect(first.status).toBe(200);
    expect(first.body).toBe('1|OK');

    // Replay: the UNIQUE(provider, event_fingerprint) insert is ignored (null row).
    mock.setRoute('payment_events', { data: null });
    const second = await run(FORM_OK, adapter, mock.db);
    expect(second.status).toBe(200);
    expect(second.body).toBe('1|OK');

    expect(mock.callsFor('payments', 'update').length).toBe(1);
    expect(mock.callsFor('orders', 'update').length).toBe(1);
    expect(mock.rpcCalls('grant_entitlement').length).toBe(1);
  });

  it('late failed callback after succeeded → succeeded unchanged; 1|OK', async () => {
    const { mock, adapter } = baseMock({
      payments: { data: { ...PAYMENT_ROW, status: 'succeeded', paid_at: '2026-08-16T12:00:00Z' } },
    });
    adapter.verifyCallback.mockResolvedValue({
      provider: 'ecpay',
      providerMerchantRef: 'BJH123456789',
      providerPaymentRef: 'ECPAY-TRADE-1',
      eventFingerprint: 'fp-late-failed',
      status: 'failed',
      amount: { amount: 79000, currency: 'TWD' },
      rawStatusCode: '10100094',
    });
    const result = await run({ ...FORM_OK, RtnCode: '10100094' }, adapter, mock.db);
    expect(result.status).toBe(200);
    expect(result.body).toBe('1|OK');
    const paymentUpdate = mock.callsFor('payments', 'update')[0];
    expect(paymentUpdate.args[0]).toMatchObject({ status: 'succeeded' }); // never downgraded
    expect(mock.rpcCalls('grant_entitlement').length).toBe(0);
  });

  it('QueryTradeInfo unavailable → durable verification_pending; 1|OK', async () => {
    const { mock, adapter } = baseMock();
    adapter.confirmPayment.mockResolvedValue({
      provider: 'ecpay',
      merchantReference: 'BJH123456789',
      providerPaymentReference: 'ECPAY-TRADE-1',
      status: 'unknown',
      amount: { amount: 79000, currency: 'TWD' },
      rawStatusCode: 'QUERY_UNAVAILABLE',
    });
    const result = await run(FORM_OK, adapter, mock.db);
    expect(result.status).toBe(200);
    expect(result.body).toBe('1|OK');
    const paymentUpdate = mock.callsFor('payments', 'update')[0];
    expect(paymentUpdate.args[0]).toMatchObject({ status: 'verification_pending' });
    expect(mock.rpcCalls('grant_entitlement').length).toBe(0);
  });

  it('DB failure on the durable event insert → NO 1|OK (ECPay retries)', async () => {
    const { mock, adapter } = baseMock({ payment_events: { error: 'row-level security violation' } });
    const result = await run(FORM_OK, adapter, mock.db);
    expect(result.status).toBe(500);
    expect(result.body).not.toBe('1|OK');
    expect(mock.rpcCalls('grant_entitlement').length).toBe(0);
  });

  it('method not POST → 405', async () => {
    const { mock, adapter } = baseMock();
    const result = await handleEcpayCallback(
      handlerRequest('GET', 'https://test.supabase.co/functions/v1/ecpay-callback', formBody(FORM_OK)),
      { env: testEnv(), db: mock.db, adapter, log: fakeLogger(), now: () => new Date() },
    );
    expect(result.status).toBe(405);
  });
});
