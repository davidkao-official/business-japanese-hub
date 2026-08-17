/**
 * Repair / reconcile handler tests (decision-record §6 — secret-authenticated
 * Layer B repair + Layer C reconciliation).
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
import { handleRepairReconcile } from './handler.ts';
import type { ProviderPaymentSnapshot } from '../../../src/lib/payments/contract.ts';

const SNAPSHOT_OK: ProviderPaymentSnapshot = {
  provider: 'ecpay',
  merchantReference: 'BJH123456789',
  providerPaymentReference: 'ECPAY-TRADE-1',
  status: 'succeeded',
  amount: { amount: 79000, currency: 'TWD' },
  paidAt: '2026-08-16T12:00:00Z',
  rawStatusCode: '1',
};

function setup(overrides: Record<string, unknown> = {}) {
  const mock = createMockDb({
    payments: { data: [] },
    orders: { data: ORDER_ROW },
    'rpc:grant_entitlement': { data: null },
    ...overrides,
  });
  const adapter = createFakeAdapter();
  adapter.confirmPayment.mockResolvedValue(SNAPSHOT_OK);
  return {
    mock,
    adapter,
    deps: {
      env: testEnv(),
      db: mock.db,
      adapters: { ecpay: adapter, paypal: createFakeAdapter('paypal') },
      log: fakeLogger(),
      now: () => new Date('2026-08-16T12:00:00Z'),
    },
  };
}

function run(deps: ReturnType<typeof setup>['deps'], headers: Record<string, string> = {}) {
  return handleRepairReconcile(
    handlerRequest('POST', 'https://test.supabase.co/functions/v1/repair-reconcile', '{}', headers),
    deps,
  );
}

describe('repair-reconcile handler', () => {
  it('missing scheduled-job secret → 401', async () => {
    const { deps } = setup();
    const result = await run(deps, {});
    expect(result.status).toBe(401);
  });

  it('incorrect scheduled-job secret → 401', async () => {
    const { deps } = setup();
    const result = await run(deps, { 'x-scheduled-job-secret': 'wrong-secret' });
    expect(result.status).toBe(401);
  });

  it('verification_pending → confirmed paid → entitlement granted exactly once', async () => {
    const { mock, deps } = setup({
      payments: { data: [{ ...PAYMENT_ROW, status: 'verification_pending' }] },
    });
    const result = await run(deps, { 'x-scheduled-job-secret': 'test-scheduled-secret' });
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.repaired).toBe(1);
    expect(body.granted).toBe(1);
    expect(body.scanned).toBe(1);
    expect(body.reconciliation).toMatchObject({ skipped: true }); // no CSV source configured

    const paymentUpdate = mock.callsFor('payments', 'update')[0];
    expect(paymentUpdate.args[0]).toMatchObject({ status: 'succeeded' });
    const orderUpdate = mock.callsFor('orders', 'update')[0];
    expect(orderUpdate.args[0]).toMatchObject({ status: 'paid' });
    expect(mock.rpcCalls('grant_entitlement').length).toBe(1);
  });

  it('a re-run on an already-succeeded payment grants nothing (idempotent)', async () => {
    const { mock, deps } = setup({
      payments: { data: [{ ...PAYMENT_ROW, status: 'succeeded', paid_at: '2026-08-16T12:00:00Z' }] },
      orders: { data: { ...ORDER_ROW, status: 'paid', paid_at: '2026-08-16T12:00:00Z' } },
    });
    const result = await run(deps, { 'x-scheduled-job-secret': 'test-scheduled-secret' });
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body);
    // Even if the scan surfaces the payment, the success path is a no-change and
    // grants nothing (shouldGrantEntitlement requires a still-pending order).
    expect(body.granted).toBe(0);
    expect(mock.rpcCalls('grant_entitlement').length).toBe(0);
  });

  it('Layer C parses a FundingReconDetail CSV and marks matched status', async () => {
    const { deps } = setup({
      payments: { data: null }, // no Layer B candidates; Layer C merchant-ref lookups miss
    });
    const csv =
      '特店編號,撥款日期,撥款金額,特店訂單編號,交易序號,交易日期,交易時間,交易金額,手續費,交易狀態,退款金額,退款狀態,交易類別\n' +
      '2000132,20260815,790,20260815,BJH123456789,ECPAY-TRADE-1,20260815,120000,790,1,,,1\n';
    const withCsv = { ...deps, env: testEnv({ fundingReconCsv: csv }) };
    const result = await run(withCsv, { 'x-scheduled-job-secret': 'test-scheduled-secret' });
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.reconciliation).toMatchObject({ skipped: false, entries: 1 });
  });

  it('Layer C discovers a confirmed refund (negative amount) → refund succeeded + payment/order refunded + entitlement revoked', async () => {
    const { mock, deps } = setup({
      // A recent created_at keeps this payment OUT of the Layer B stale scan so
      // only Layer C's refund discovery acts on it. Array-shaped routes so both
      // the list scan and the maybeSingle lookups resolve.
      payments: {
        data: [{ ...PAYMENT_ROW, status: 'succeeded', provider_payment_ref: 'ECPAY-TRADE-1', created_at: '2026-08-16T11:55:00Z' }],
      },
      orders: { data: [{ ...ORDER_ROW, status: 'paid' }] },
      refunds: {
        data: [{
          id: 'ref-1', payment_id: 'pay-1', provider: 'ecpay', provider_refund_ref: null,
          amount_minor: 79000, currency: 'TWD', status: 'requested', reason_code: null,
          requested_by: 'user-1', provider_status_code: null, requested_at: '2026-08-16T11:00:00Z', completed_at: null,
        }],
      },
      book_entitlement: { data: null },
      admin_audit_log: { data: null },
    });
    const csv =
      '特店編號,撥款日期,撥款金額,特店訂單編號,交易序號,交易日期,交易時間,交易金額,手續費,交易狀態,退款金額,退款狀態,交易類別\n' +
      '2000132,20260815,790,BJH123456789,ECPAY-TRADE-1,20260815,120000,-790,1,1,790,1,1\n';
    const withCsv = { ...deps, env: testEnv({ fundingReconCsv: csv }) };
    const result = await run(withCsv, { 'x-scheduled-job-secret': 'test-scheduled-secret' });
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.reconciliation).toMatchObject({ skipped: false, entries: 1 });

    // refunds → succeeded (fact source); payment → refunded; order → refunded.
    expect(mock.callsFor('refunds', 'update')[0].args[0]).toMatchObject({ status: 'succeeded' });
    const paymentUpdates = mock.callsFor('payments', 'update');
    expect(paymentUpdates[paymentUpdates.length - 1].args[0]).toMatchObject({ status: 'refunded' });
    const orderUpdates = mock.callsFor('orders', 'update');
    expect(orderUpdates[orderUpdates.length - 1].args[0]).toMatchObject({ status: 'refunded' });

    // Primary-payment refund → entitlement revoked with reason 'refund'.
    const revokeUpdate = mock.callsFor('book_entitlement', 'update')[0];
    expect(revokeUpdate.args[0]).toMatchObject({ status: 'revoked', revocation_reason: 'refund' });
  });

  it('method not POST → 405', async () => {
    const { deps } = setup();
    const result = await handleRepairReconcile(
      handlerRequest('GET', 'https://test.supabase.co/functions/v1/repair-reconcile', '{}'),
      deps,
    );
    expect(result.status).toBe(405);
  });

  it('B3: resumes a PayPal processing refund → provider confirms → refund succeeded + entitlement revoked exactly once', async () => {
    const paypalPayment = {
      id: 'pay-1',
      order_id: 'ord-1',
      provider: 'paypal',
      provider_merchant_ref: 'BJH202608160001',
      provider_payment_ref: 'CAPTURE-1',
      amount_minor: 1999,
      currency: 'USD',
      method: 'credit',
      status: 'succeeded',
      provider_status_code: null,
      provider_status_message: null,
      created_at: '2026-08-16T11:55:00Z', // recent — not a Layer B stale candidate
      paid_at: '2026-08-16T11:00:00Z',
      last_verified_at: null,
      provider_fee_amount_minor: null,
      reconciliation_status: null,
    };
    const paypalOrder = { ...ORDER_ROW, status: 'paid', currency: 'USD', amount_minor: 1999 };
    const mock = createMockDb({
      payments: { data: [paypalPayment] },
      orders: { data: paypalOrder },
      'rpc:grant_entitlement': { data: null },
      refunds: {
        data: [{
          id: 'ref-1',
          payment_id: 'pay-1',
          provider: 'paypal',
          provider_refund_ref: null,
          amount_minor: 1999,
          currency: 'USD',
          status: 'processing',
          reason_code: null,
          requested_by: 'user-1',
          provider_status_code: 'TRANSPORT_UNAVAILABLE',
          requested_at: '2026-08-16T11:00:00Z',
          completed_at: null,
        }],
      },
      book_entitlement: { data: null },
      admin_audit_log: { data: null },
    });
    const paypalAdapter = createFakeAdapter('paypal');
    paypalAdapter.refund.mockResolvedValue({
      ok: true,
      status: 'succeeded',
      providerRefundRef: 'REFUND-1',
      rawStatusCode: 'COMPLETED',
    });
    const deps = {
      env: testEnv(),
      db: mock.db,
      adapters: { ecpay: createFakeAdapter(), paypal: paypalAdapter },
      log: fakeLogger(),
      now: () => new Date('2026-08-16T12:00:00Z'),
    };

    const result = await run(deps, { 'x-scheduled-job-secret': 'test-scheduled-secret' });
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({ refunds_confirmed: 1 });

    // The resume re-used the SAME stable PayPal-Request-Id (keyed on payment id).
    expect(paypalAdapter.refund).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 'pay-1', providerPaymentRef: 'CAPTURE-1', amount: { amount: 1999, currency: 'USD' } }),
    );
    // Provider-confirmed refund → refunds succeeded (fact source) + entitlement
    // revoked exactly once (no second monetary refund, no double revoke).
    const succeededUpdate = mock.callsFor('refunds', 'update').find((c) => c.args[0]?.status === 'succeeded');
    expect(succeededUpdate).toBeDefined();
    expect(mock.callsFor('book_entitlement', 'update').length).toBe(1);
    expect(mock.callsFor('book_entitlement', 'update')[0].args[0]).toMatchObject({
      status: 'revoked',
      revocation_reason: 'refund',
    });
  });
});
