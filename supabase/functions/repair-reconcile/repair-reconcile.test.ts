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
import { handleRepairReconcile, REPAIR_SCAN_LIMIT } from './handler.ts';
import type { ProviderPaymentSnapshot } from '../../../src/lib/payments/contract.ts';

const SNAPSHOT_OK: ProviderPaymentSnapshot = {
  provider: 'ecpay',
  merchantReference: 'BJH123456789',
  providerPaymentReference: 'ECPAY-TRADE-1',
  status: 'succeeded',
  amount: { amount: 79000, currency: 'TWD' },
  paidAt: '2026-08-16T12:00:00Z',
  rawStatusCode: '1',
  queryResponse: {
    merchantTradeNo: 'BJH123456789',
    tradeNo: 'ECPAY-TRADE-1',
    tradeAmt: '790',
    tradeStatus: '1',
  },
};

const SUCCESS_TRANSACTION = {
  payment_status: 'succeeded',
  order_status: 'paid',
  granted: true,
};

const REFUND_TRANSACTION = {
  refund_id: 'ref-1',
  refund_status: 'succeeded',
  payment_status: 'refunded',
  order_status: 'refunded',
  entitlement_revoked: true,
  already_confirmed: false,
};

function setup(overrides: Record<string, unknown> = {}) {
  const mock = createMockDb({
    'rpc:record_scheduled_job_started': { data: '81000000-0000-0000-0000-000000000001' },
    'rpc:record_scheduled_job_result': { data: true },
    payments: { data: [] },
    orders: { data: ORDER_ROW },
    'rpc:finalize_payment_success': { data: SUCCESS_TRANSACTION },
    ...overrides,
  });
  const adapter = createFakeAdapter();
  adapter.confirmPayment.mockResolvedValue(SNAPSHOT_OK);
  return {
    mock,
    adapter,
    deps: {
      // Most handler tests exercise repair/refund seams with injected fakes;
      // leave PayPal reporting disabled unless a test explicitly enables it.
      env: testEnv({ paypalClientId: undefined, paypalClientSecret: undefined, paypalWebhookId: undefined }),
      db: mock.db,
      adapters: { ecpay: adapter, paypal: createFakeAdapter('paypal') },
      log: fakeLogger(),
      now: () => new Date('2026-08-16T12:00:00Z'),
    },
  };
}

function run(
  deps: ReturnType<typeof setup>['deps'],
  headers: Record<string, string> = {},
  body = JSON.stringify({ mode: 'repair' }),
) {
  return handleRepairReconcile(
    handlerRequest('POST', 'https://test.supabase.co/functions/v1/repair-reconcile', body, headers),
    deps,
  );
}

function runReconcile(
  deps: ReturnType<typeof setup>['deps'],
  headers: Record<string, string> = {},
) {
  return run(deps, headers, JSON.stringify({ mode: 'reconcile' }));
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

  it('repair schedule does not run provider reporting', async () => {
    const { mock, deps } = setup({ payments: { data: [] } });
    deps.env = testEnv();
    const result = await run(
      deps,
      { 'x-scheduled-job-secret': 'test-scheduled-secret' },
      JSON.stringify({ mode: 'repair' }),
    );
    expect(result.status).toBe(200);
    expect(deps.adapters.paypal.reconcile).not.toHaveBeenCalled();
    expect(mock.rpcCalls('record_scheduled_job_started')[0]?.args[0]).toEqual({
      p_job_name: 'repair',
    });
    expect(mock.rpcCalls('record_scheduled_job_result')[0]?.args[0]).toEqual({
      p_job_name: 'repair',
      p_run_id: '81000000-0000-0000-0000-000000000001',
      p_succeeded: true,
      p_error_code: null,
    });
  });

  it('fails closed before financial work when its start heartbeat cannot be stored', async () => {
    const { mock, deps } = setup({
      'rpc:record_scheduled_job_started': { error: 'database unavailable' },
    });
    const result = await run(deps, { 'x-scheduled-job-secret': 'test-scheduled-secret' });

    expect(result.status).toBe(500);
    expect(mock.callsFor('payments', 'select')).toHaveLength(0);
    expect(mock.rpcCalls('record_scheduled_job_result')).toHaveLength(0);
  });

  it('fails closed when the start-heartbeat transport rejects', async () => {
    const { mock, deps } = setup();
    const originalRpc = deps.db.rpc.bind(deps.db);
    deps.db = {
      ...deps.db,
      rpc: async (fn, args) => {
        if (fn === 'record_scheduled_job_started') {
          throw new Error('injected start transport failure');
        }
        return await originalRpc(fn, args);
      },
    };

    const result = await run(deps, { 'x-scheduled-job-secret': 'test-scheduled-secret' });

    expect(result.status).toBe(500);
    expect(mock.callsFor('payments', 'select')).toHaveLength(0);
  });

  it('releases every sibling heartbeat when an all-mode start partially fails', async () => {
    const { mock, deps } = setup({
      'rpc:record_scheduled_job_started': {
        rpcResults: [
          { data: '81000000-0000-0000-0000-000000000001' },
          { error: 'injected reconcile start failure' },
        ],
      },
    });

    const result = await run(
      deps,
      { 'x-scheduled-job-secret': 'test-scheduled-secret' },
      JSON.stringify({ mode: 'all' }),
    );

    expect(result.status).toBe(500);
    expect(mock.callsFor('payments', 'select')).toHaveLength(0);
    expect(mock.rpcCalls('record_scheduled_job_result')).toHaveLength(1);
    expect(mock.rpcCalls('record_scheduled_job_result')[0]?.args[0]).toEqual({
      p_job_name: 'repair',
      p_run_id: '81000000-0000-0000-0000-000000000001',
      p_succeeded: false,
      p_error_code: 'start_heartbeat_aborted',
    });
  });

  it('attempts every result heartbeat when one all-mode result write fails', async () => {
    const { mock, deps } = setup({
      'rpc:record_scheduled_job_result': {
        rpcResults: [
          { error: 'injected repair result failure' },
          { data: true },
        ],
      },
    });

    const result = await run(
      deps,
      { 'x-scheduled-job-secret': 'test-scheduled-secret' },
      JSON.stringify({ mode: 'all' }),
    );

    expect(result.status).toBe(500);
    expect(mock.rpcCalls('record_scheduled_job_result')).toHaveLength(2);
    expect(mock.rpcCalls('record_scheduled_job_result')[1]?.args[0]).toMatchObject({
      p_job_name: 'reconcile',
    });
  });

  it('attempts every result heartbeat when one all-mode transport rejects', async () => {
    const { deps } = setup();
    const originalRpc = deps.db.rpc.bind(deps.db);
    let resultAttempts = 0;
    deps.db = {
      ...deps.db,
      rpc: async (fn, args) => {
        if (fn === 'record_scheduled_job_result') {
          resultAttempts += 1;
          if (resultAttempts === 1) throw new Error('injected result transport failure');
        }
        return await originalRpc(fn, args);
      },
    };

    const result = await run(
      deps,
      { 'x-scheduled-job-secret': 'test-scheduled-secret' },
      JSON.stringify({ mode: 'all' }),
    );

    expect(result.status).toBe(500);
    expect(resultAttempts).toBe(2);
  });

  it('records an unsuccessful reconciliation heartbeat when no source is configured', async () => {
    const { mock, deps } = setup();
    const result = await runReconcile(deps, {
      'x-scheduled-job-secret': 'test-scheduled-secret',
    });

    expect(result.status).toBe(500);
    expect(mock.rpcCalls('record_scheduled_job_result')[0]?.args[0]).toEqual({
      p_job_name: 'reconcile',
      p_run_id: '81000000-0000-0000-0000-000000000001',
      p_succeeded: false,
      p_error_code: 'worker_http_500',
    });
  });

  it('reconcile schedule does not run Layer B provider confirmation', async () => {
    const { adapter, deps } = setup({
      payments: { data: [{ ...PAYMENT_ROW, status: 'verification_pending' }] },
    });
    deps.env = testEnv();
    await run(
      deps,
      { 'x-scheduled-job-secret': 'test-scheduled-secret' },
      JSON.stringify({ mode: 'reconcile' }),
    );
    expect(adapter.confirmPayment).not.toHaveBeenCalled();
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

    expect(mock.rpcCalls('finalize_payment_success')).toHaveLength(1);
    expect(mock.rpcCalls('finalize_payment_success')[0].args[0]).toMatchObject({
      p_payment_id: 'pay-1',
      p_provider_payment_ref: 'ECPAY-TRADE-1',
    });
    expect(mock.callsFor('payments', 'update')).toHaveLength(0);
    expect(mock.callsFor('orders', 'update')).toHaveLength(0);
    expect(mock.rpcCalls('grant_entitlement')).toHaveLength(0);
  });

  it('scans verification_pending after 10 minutes but leaves ordinary pending until 30 minutes', async () => {
    const { mock, deps } = setup({
      payments: {
        data: [
          { ...PAYMENT_ROW, status: 'verification_pending', created_at: '2026-08-16T11:45:00Z' },
          { ...PAYMENT_ROW, id: 'pay-young-pending', status: 'pending', created_at: '2026-08-16T11:45:00Z' },
        ],
      },
    });

    const result = await run(deps, { 'x-scheduled-job-secret': 'test-scheduled-secret' });

    expect(JSON.parse(result.body)).toMatchObject({ scanned: 1, repaired: 1 });
    const scanFilter = String(mock.callsFor('payments', 'or')[0].args[0]);
    expect(scanFilter).toContain('status.eq.verification_pending,created_at.lte.2026-08-16T11:50:00.000Z');
    expect(scanFilter).toContain('status.eq.pending,created_at.lte.2026-08-16T11:30:00.000Z');
  });

  it('repairs PayPal with its checkout Order id and verifies the immutable amount/currency', async () => {
    const paypalPayment = {
      ...PAYMENT_ROW,
      provider: 'paypal',
      status: 'verification_pending',
      provider_merchant_ref: 'BJH202608160001',
      provider_checkout_ref: 'ORDER-1',
      provider_payment_ref: null,
      amount_minor: 1999,
      currency: 'USD',
    };
    const { mock, deps } = setup({ payments: { data: [paypalPayment] } });
    const paypal = deps.adapters.paypal;
    paypal.confirmPayment.mockResolvedValue({
      provider: 'paypal',
      merchantReference: paypalPayment.provider_merchant_ref,
      providerPaymentReference: 'CAPTURE-1',
      status: 'succeeded',
      amount: { amount: 1999, currency: 'USD' },
      rawStatusCode: 'COMPLETED',
    });

    const result = await run(deps, { 'x-scheduled-job-secret': 'test-scheduled-secret' });

    expect(result.status).toBe(200);
    expect(paypal.confirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({ providerPaymentRef: 'ORDER-1' }),
    );
    expect(mock.rpcCalls('finalize_payment_success')).toHaveLength(1);
  });

  it('does not repair PayPal when the authoritative snapshot amount differs', async () => {
    const paypalPayment = {
      ...PAYMENT_ROW,
      provider: 'paypal',
      status: 'verification_pending',
      provider_merchant_ref: 'BJH202608160001',
      provider_checkout_ref: 'ORDER-1',
      provider_payment_ref: null,
      amount_minor: 1999,
      currency: 'USD',
    };
    const { mock, deps } = setup({ payments: { data: [paypalPayment] } });
    deps.adapters.paypal.confirmPayment.mockResolvedValue({
      provider: 'paypal',
      merchantReference: paypalPayment.provider_merchant_ref,
      providerPaymentReference: 'CAPTURE-1',
      status: 'succeeded',
      amount: { amount: 2000, currency: 'USD' },
      rawStatusCode: 'COMPLETED',
    });

    const result = await run(deps, { 'x-scheduled-job-secret': 'test-scheduled-secret' });

    expect(JSON.parse(result.body)).toMatchObject({ repaired: 0, stillUnknown: 1 });
    expect(mock.rpcCalls('finalize_payment_success')).toHaveLength(0);
  });

  it('does not repair ECPay unless the signed QueryTradeInfo fields match the local payment', async () => {
    const { mock, adapter, deps } = setup({
      payments: { data: [{ ...PAYMENT_ROW, status: 'verification_pending' }] },
    });
    adapter.confirmPayment.mockResolvedValue({
      ...SNAPSHOT_OK,
      queryResponse: { ...SNAPSHOT_OK.queryResponse, merchantTradeNo: 'WRONG-REF' },
    });

    const result = await run(deps, { 'x-scheduled-job-secret': 'test-scheduled-secret' });

    expect(JSON.parse(result.body)).toMatchObject({ repaired: 0, stillUnknown: 1 });
    expect(mock.rpcCalls('finalize_payment_success')).toHaveLength(0);
  });

  it('a re-run on an already-succeeded payment grants nothing (idempotent)', async () => {
    const { mock, deps } = setup({
      payments: { data: [{ ...PAYMENT_ROW, status: 'succeeded', paid_at: '2026-08-16T12:00:00Z' }] },
      orders: { data: { ...ORDER_ROW, status: 'paid', paid_at: '2026-08-16T12:00:00Z' } },
      'rpc:finalize_payment_success': {
        data: { payment_status: 'succeeded', order_status: 'paid', granted: false },
      },
    });
    const result = await run(deps, { 'x-scheduled-job-secret': 'test-scheduled-secret' });
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body);
    // Even if the scan surfaces the payment, the locked transaction recognizes
    // the fulfilled state and grants nothing.
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
    const result = await runReconcile(withCsv, { 'x-scheduled-job-secret': 'test-scheduled-secret' });
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.reconciliation).toMatchObject({ skipped: false, entries: 1 });
  });

  it('Layer C discovers a confirmed full refund from negative refundAmount and revokes entitlement', async () => {
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
      'rpc:finalize_refund_success': { data: REFUND_TRANSACTION },
    });
    const csv =
      '特店編號,撥款日期,撥款金額,特店訂單編號,交易序號,交易日期,交易時間,交易金額,手續費,交易狀態,退款金額,退款狀態,交易類別\n' +
      '2000132,20260815,0,BJH123456789,ECPAY-TRADE-1,20260815,120000,790,1,1,-790,1,1\n';
    const withCsv = { ...deps, env: testEnv({ fundingReconCsv: csv }) };
    const result = await runReconcile(withCsv, { 'x-scheduled-job-secret': 'test-scheduled-secret' });
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.reconciliation).toMatchObject({ skipped: false, entries: 1 });

    // Refund, payment, order, and entitlement transition in one locked DB
    // transaction; the worker only records reconciliation metadata directly.
    expect(mock.rpcCalls('finalize_refund_success')).toHaveLength(1);
    expect(mock.rpcCalls('finalize_refund_success')[0].args[0]).toMatchObject({
      p_refund_id: 'ref-1',
    });
    expect(mock.callsFor('refunds', 'update')).toHaveLength(0);
    expect(mock.callsFor('orders', 'update')).toHaveLength(0);
    expect(mock.callsFor('book_entitlement', 'update')).toHaveLength(0);
  });

  it('Layer C treats zero refundAmount as a normal matched settlement', async () => {
    const { mock, deps } = setup({
      payments: {
        data: [{
          ...PAYMENT_ROW,
          status: 'succeeded',
          provider_payment_ref: 'ECPAY-TRADE-1',
          created_at: '2026-08-16T11:55:00Z',
        }],
      },
    });
    const csv =
      '特店編號,撥款日期,撥款金額,特店訂單編號,交易序號,交易日期,交易時間,交易金額,手續費,交易狀態,退款金額,退款狀態,交易類別\n' +
      '2000132,20260815,790,BJH123456789,ECPAY-TRADE-1,20260815,120000,790,1,1,0,0,1\n';

    await runReconcile(
      { ...deps, env: testEnv({ fundingReconCsv: csv }) },
      { 'x-scheduled-job-secret': 'test-scheduled-secret' },
    );

    expect(mock.callsFor('payments', 'update')[0].args[0]).toMatchObject({
      reconciliation_status: 'matched',
    });
    expect(mock.rpcCalls('finalize_refund_success')).toHaveLength(0);
  });

  it.each([
    ['wrong merchant', 'WRONG', 'ECPAY-TRADE-1', '1'],
    ['wrong transaction reference', '2000132', 'OTHER-TRADE', '1'],
    ['nonterminal refund status', '2000132', 'ECPAY-TRADE-1', '0'],
  ])('Layer C refuses a full-refund row with %s', async (_label, merchantId, tradeNo, refundStatus) => {
    const { mock, deps } = setup({
      payments: {
        data: [{
          ...PAYMENT_ROW,
          status: 'succeeded',
          provider_payment_ref: 'ECPAY-TRADE-1',
          created_at: '2026-08-16T11:55:00Z',
        }],
      },
      'rpc:finalize_refund_success': { data: REFUND_TRANSACTION },
    });
    const csv =
      '特店編號,撥款日期,撥款金額,特店訂單編號,交易序號,交易日期,交易時間,交易金額,手續費,交易狀態,退款金額,退款狀態,交易類別\n' +
      `${merchantId},20260815,0,BJH123456789,${tradeNo},20260815,120000,790,1,1,-790,${refundStatus},1\n`;

    await runReconcile(
      { ...deps, env: testEnv({ fundingReconCsv: csv }) },
      { 'x-scheduled-job-secret': 'test-scheduled-secret' },
    );

    expect(mock.rpcCalls('finalize_refund_success')).toHaveLength(0);
    expect(mock.callsFor('payments', 'update')[0].args[0]).toMatchObject({
      reconciliation_status: 'mismatch',
    });
  });

  it('Layer C flags a partial ECPay refund mismatch without revoking entitlement', async () => {
    const { mock, deps } = setup({
      payments: {
        data: [{
          ...PAYMENT_ROW,
          status: 'succeeded',
          provider_payment_ref: 'ECPAY-TRADE-1',
          created_at: '2026-08-16T11:55:00Z',
        }],
      },
      refunds: {
        data: [{
          id: 'ref-1', payment_id: 'pay-1', provider: 'ecpay', provider_refund_ref: null,
          amount_minor: 79000, currency: 'TWD', status: 'requested', reason_code: null,
          requested_by: 'user-1', provider_status_code: null, requested_at: '2026-08-16T11:00:00Z', completed_at: null,
        }],
      },
      'rpc:finalize_refund_success': { data: REFUND_TRANSACTION },
    });
    const csv =
      '特店編號,撥款日期,撥款金額,特店訂單編號,交易序號,交易日期,交易時間,交易金額,手續費,交易狀態,退款金額,退款狀態,交易類別\n' +
      '2000132,20260815,690,BJH123456789,ECPAY-TRADE-1,20260815,120000,790,1,1,-100,1,1\n';

    const result = await runReconcile(
      { ...deps, env: testEnv({ fundingReconCsv: csv }) },
      { 'x-scheduled-job-secret': 'test-scheduled-secret' },
    );

    expect(result.status).toBe(200);
    expect(mock.rpcCalls('finalize_refund_success')).toHaveLength(0);
    expect(mock.callsFor('payments', 'update')[0].args[0]).toMatchObject({
      reconciliation_status: 'mismatch',
    });
  });

  it('Layer C records an out-of-band full ECPay refund even without a local request row', async () => {
    const { mock, deps } = setup({
      payments: {
        data: [{
          ...PAYMENT_ROW,
          status: 'succeeded',
          provider_payment_ref: 'ECPAY-TRADE-1',
          created_at: '2026-08-16T11:55:00Z',
        }],
      },
      refunds: { data: null },
      'rpc:finalize_refund_success': { data: REFUND_TRANSACTION },
    });
    const csv =
      '特店編號,撥款日期,撥款金額,特店訂單編號,交易序號,交易日期,交易時間,交易金額,手續費,交易狀態,退款金額,退款狀態,交易類別\n' +
      '2000132,20260815,0,BJH123456789,ECPAY-TRADE-1,20260815,120000,790,1,1,-790,1,1\n';

    await runReconcile(
      { ...deps, env: testEnv({ fundingReconCsv: csv }) },
      { 'x-scheduled-job-secret': 'test-scheduled-secret' },
    );

    expect(mock.rpcCalls('finalize_refund_success')).toHaveLength(1);
    expect(mock.rpcCalls('finalize_refund_success')[0].args[0]).toMatchObject({
      p_refund_id: null,
      p_payment_id: 'pay-1',
    });
  });

  it('PayPal Layer C is scheduled and marks a matching captured payment', async () => {
    const payment = {
      ...PAYMENT_ROW,
      provider: 'paypal',
      status: 'succeeded',
      provider_merchant_ref: 'BJH202608160001',
      provider_checkout_ref: 'ORDER-1',
      provider_payment_ref: 'CAPTURE-1',
      amount_minor: 1999,
      currency: 'USD',
      created_at: '2026-08-16T11:55:00Z',
    };
    const { mock, deps } = setup({ payments: { data: [payment] } });
    deps.env = testEnv();
    deps.adapters.paypal.reconcile.mockResolvedValue({
      provider: 'paypal',
      entries: [{
        kind: 'payment',
        transactionId: 'CAPTURE-1',
        eventCode: 'T0006',
        status: 'S',
        amount: { amount: 1999, currency: 'USD' },
      }],
    });

    const result = await runReconcile(deps, { 'x-scheduled-job-secret': 'test-scheduled-secret' });

    expect(result.status).toBe(200);
    expect(deps.adapters.paypal.reconcile).toHaveBeenCalledWith({ from: '2026-08-14', to: '2026-08-16' });
    expect(JSON.parse(result.body).reconciliation).toMatchObject({ skipped: false, entries: 1, matched: 1 });
    expect(mock.callsFor('payments', 'update')[0].args[0]).toMatchObject({ reconciliation_status: 'matched' });
  });

  it('PayPal Layer C confirms a full refund by its reference capture', async () => {
    const payment = {
      ...PAYMENT_ROW,
      provider: 'paypal',
      status: 'succeeded',
      provider_merchant_ref: 'BJH202608160001',
      provider_payment_ref: 'CAPTURE-1',
      amount_minor: 1999,
      currency: 'USD',
      created_at: '2026-08-16T11:55:00Z',
    };
    const { mock, deps } = setup({
      payments: { data: [payment] },
      'rpc:finalize_refund_success': { data: REFUND_TRANSACTION },
    });
    deps.env = testEnv();
    deps.adapters.paypal.reconcile.mockResolvedValue({
      provider: 'paypal',
      entries: [{
        kind: 'refund',
        transactionId: 'REFUND-1',
        referenceTransactionId: 'CAPTURE-1',
        eventCode: 'T1107',
        status: 'S',
        amount: { amount: 1999, currency: 'USD' },
      }],
    });

    const result = await runReconcile(deps, { 'x-scheduled-job-secret': 'test-scheduled-secret' });

    expect(result.status).toBe(200);
    expect(mock.rpcCalls('finalize_refund_success')).toHaveLength(1);
    expect(mock.rpcCalls('finalize_refund_success')[0].args[0]).toMatchObject({
      p_payment_id: 'pay-1',
      p_provider_refund_ref: 'REFUND-1',
      p_provider_status_code: 'T1107:S',
    });
  });

  it('PayPal Layer C refuses a partial refund and flags reconciliation mismatch', async () => {
    const payment = {
      ...PAYMENT_ROW,
      provider: 'paypal',
      status: 'succeeded',
      provider_payment_ref: 'CAPTURE-1',
      amount_minor: 1999,
      currency: 'USD',
      created_at: '2026-08-16T11:55:00Z',
    };
    const { mock, deps } = setup({ payments: { data: [payment] } });
    deps.env = testEnv();
    deps.adapters.paypal.reconcile.mockResolvedValue({
      provider: 'paypal',
      entries: [{
        kind: 'refund',
        transactionId: 'REFUND-PARTIAL',
        referenceTransactionId: 'CAPTURE-1',
        eventCode: 'T1107',
        status: 'S',
        amount: { amount: 500, currency: 'USD' },
      }],
    });

    await runReconcile(deps, { 'x-scheduled-job-secret': 'test-scheduled-secret' });

    expect(mock.rpcCalls('finalize_refund_success')).toHaveLength(0);
    expect(mock.callsFor('payments', 'update')[0].args[0]).toMatchObject({ reconciliation_status: 'mismatch' });
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
      'rpc:finalize_refund_success': { data: REFUND_TRANSACTION },
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
    // Provider-confirmed refund is finalized with entitlement revocation inside
    // one locked transaction (no direct table writes in the worker).
    expect(mock.rpcCalls('finalize_refund_success')).toHaveLength(1);
    expect(mock.rpcCalls('finalize_refund_success')[0].args[0]).toMatchObject({
      p_refund_id: 'ref-1',
    });
    expect(mock.callsFor('book_entitlement', 'update')).toHaveLength(0);
  });

  it('persists a still-pending refund result and processing state in one write', async () => {
    const paypalPayment = {
      ...PAYMENT_ROW,
      provider: 'paypal',
      provider_merchant_ref: 'PAYPAL-ORDER-1',
      provider_checkout_ref: 'PAYPAL-ORDER-1',
      provider_payment_ref: 'CAPTURE-1',
      amount_minor: 1999,
      currency: 'USD',
      method: 'paypal',
      status: 'succeeded',
      created_at: '2026-08-16T11:55:00Z',
    };
    const refund = {
      id: 'ref-pending',
      payment_id: 'pay-1',
      provider: 'paypal',
      provider_refund_ref: null,
      amount_minor: 1999,
      currency: 'USD',
      status: 'requested',
      reason_code: null,
      requested_by: 'user-1',
      provider_status_code: null,
      requested_at: '2026-08-16T11:50:00Z',
      completed_at: null,
    };
    const mock = createMockDb({ payments: { data: [paypalPayment] }, refunds: { data: [refund] } });
    const paypalAdapter = createFakeAdapter('paypal');
    paypalAdapter.refund.mockResolvedValue({
      ok: true,
      status: 'pending',
      providerRefundRef: 'REFUND-PENDING-1',
      rawStatusCode: 'PENDING',
    });
    const deps = {
      env: testEnv(),
      db: mock.db,
      adapters: { ecpay: createFakeAdapter(), paypal: paypalAdapter },
      log: fakeLogger(),
      now: () => new Date('2026-08-16T12:00:00Z'),
    };

    const result = await run(deps, { 'x-scheduled-job-secret': 'test-scheduled-secret' }, '{"mode":"repair"}');
    expect(result.status).toBe(200);
    expect(mock.callsFor('refunds', 'update')).toHaveLength(1);
    expect(mock.callsFor('refunds', 'update')[0].args[0]).toMatchObject({
      provider_refund_ref: 'REFUND-PENDING-1',
      provider_status_code: 'PENDING',
      status: 'processing',
    });
  });

  it('marks a definitive refund rejection failed so later repair scans cannot re-dispatch it', async () => {
    const paypalPayment = {
      ...PAYMENT_ROW,
      provider: 'paypal',
      provider_merchant_ref: 'PAYPAL-ORDER-1',
      provider_checkout_ref: 'PAYPAL-ORDER-1',
      provider_payment_ref: 'CAPTURE-1',
      amount_minor: 1999,
      currency: 'USD',
      method: 'paypal',
      status: 'succeeded',
      created_at: '2026-08-16T11:55:00Z',
    };
    const mock = createMockDb({
      payments: { data: [paypalPayment] },
      refunds: { data: [{
        id: 'ref-rejected', payment_id: 'pay-1', provider: 'paypal', provider_refund_ref: null,
        amount_minor: 1999, currency: 'USD', status: 'processing', reason_code: null,
        requested_by: 'user-1', provider_status_code: 'PENDING',
        requested_at: '2026-08-16T11:50:00Z', completed_at: null,
      }] },
    });
    const paypalAdapter = createFakeAdapter('paypal');
    paypalAdapter.refund.mockResolvedValue({
      ok: false,
      status: 'failed',
      rawStatusCode: 'UNPROCESSABLE_ENTITY',
    });
    const deps = {
      env: testEnv(), db: mock.db,
      adapters: { ecpay: createFakeAdapter(), paypal: paypalAdapter },
      log: fakeLogger(), now: () => new Date('2026-08-16T12:00:00Z'),
    };

    const result = await run(deps, { 'x-scheduled-job-secret': 'test-scheduled-secret' }, '{"mode":"repair"}');
    expect(result.status).toBe(200);
    expect(mock.callsFor('refunds', 'update')).toHaveLength(1);
    expect(mock.callsFor('refunds', 'update')[0].args[0]).toMatchObject({
      status: 'failed',
      provider_status_code: 'UNPROCESSABLE_ENTITY',
    });
  });

  it.each([
    { providerResult: { ok: true, status: 'pending', rawStatusCode: 'PENDING' } },
    { providerResult: { ok: false, status: 'failed', rawStatusCode: 'UNPROCESSABLE_ENTITY' } },
  ] as const)(
    'does not let repair persist a stale $providerResult.status result over concurrent refund success',
    async ({ providerResult }) => {
      const paypalPayment = {
        ...PAYMENT_ROW,
        provider: 'paypal',
        provider_merchant_ref: 'PAYPAL-ORDER-1',
        provider_checkout_ref: 'PAYPAL-ORDER-1',
        provider_payment_ref: 'CAPTURE-1',
        amount_minor: 1999,
        currency: 'USD',
        method: 'paypal',
        status: 'succeeded',
        created_at: '2026-08-16T11:55:00Z',
      };
      const scannedRefund = {
        id: 'ref-race',
        payment_id: 'pay-1',
        provider: 'paypal',
        provider_refund_ref: null,
        amount_minor: 1999,
        currency: 'USD',
        status: 'processing',
        reason_code: null,
        requested_by: 'user-1',
        provider_status_code: 'PENDING',
        requested_at: '2026-08-16T11:50:00Z',
        completed_at: null,
      };
      const finalRefund = {
        ...scannedRefund,
        status: 'succeeded',
        provider_refund_ref: 'REFUND-FINAL',
        provider_status_code: 'COMPLETED',
        completed_at: '2026-08-16T12:00:00Z',
      };
      const mock = createMockDb({
        payments: { data: [paypalPayment] },
        refunds: { data: [scannedRefund], singleData: [null, finalRefund] },
      });
      const paypalAdapter = createFakeAdapter('paypal');
      paypalAdapter.refund.mockResolvedValue(providerResult);

      const result = await run(
        {
          env: testEnv(),
          db: mock.db,
          adapters: { ecpay: createFakeAdapter(), paypal: paypalAdapter },
          log: fakeLogger(),
          now: () => new Date('2026-08-16T12:00:00Z'),
        },
        { 'x-scheduled-job-secret': 'test-scheduled-secret' },
        '{"mode":"repair"}',
      );

      expect(result.status).toBe(200);
      expect(JSON.parse(result.body)).toMatchObject({ refunds_resumed: 1, refunds_confirmed: 1 });
      expect(mock.rpcCalls('finalize_refund_success')).toHaveLength(0);
      expect(mock.callsFor('refunds', 'in')).toContainEqual({
        table: 'refunds',
        method: 'in',
        args: ['status', ['requested', 'processing']],
      });
    },
  );

  it('B7: does NOT auto-resume an aged PayPal refund outside the Request-Id retention window (no refund POST)', async () => {
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
      created_at: '2026-08-16T11:55:00Z',
      paid_at: '2026-06-01T11:00:00Z',
      last_verified_at: null,
      provider_fee_amount_minor: null,
      reconciliation_status: null,
    };
    const mock = createMockDb({
      payments: { data: [paypalPayment] },
      orders: { data: { ...ORDER_ROW, status: 'paid', currency: 'USD', amount_minor: 1999 } },
      refunds: {
        data: [{
          id: 'ref-aged',
          payment_id: 'pay-1',
          provider: 'paypal',
          provider_refund_ref: null,
          amount_minor: 1999,
          currency: 'USD',
          status: 'processing',
          reason_code: null,
          requested_by: 'user-1',
          provider_status_code: 'TRANSPORT_UNAVAILABLE',
          // 46 days before the injected now (2026-08-16T12:00:00Z).
          requested_at: '2026-07-01T12:00:00Z',
          completed_at: null,
        }],
      },
      book_entitlement: { data: null },
      admin_audit_log: { data: null },
    });
    const paypalAdapter = createFakeAdapter('paypal');
    const deps = {
      env: testEnv(),
      db: mock.db,
      adapters: { ecpay: createFakeAdapter(), paypal: paypalAdapter },
      log: fakeLogger(),
      now: () => new Date('2026-08-16T12:00:00Z'),
    };

    const result = await run(deps, { 'x-scheduled-job-secret': 'test-scheduled-secret' });
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({ refunds_resumed: 0 });

    // Automatic repair MUST NOT issue another monetary refund POST.
    expect(paypalAdapter.refund).not.toHaveBeenCalled();
    // The aged refund is routed to operator/reconciliation review.
    const markerUpdate = mock.callsFor('refunds', 'update')[0];
    expect(markerUpdate.args[0]).toMatchObject({ provider_status_code: 'REVIEW_REQUIRED' });
    // Entitlement is never revoked without provider-confirmed refund success.
    expect(mock.callsFor('book_entitlement', 'update').length).toBe(0);
  });

  it('B7-fix: REVIEW_REQUIRED refunds are excluded NULL-safe in the scan, so recent refunds are not starved and never re-POSTed', async () => {
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
      created_at: '2026-08-16T11:55:00Z',
      paid_at: '2026-08-16T11:00:00Z',
      last_verified_at: null,
      provider_fee_amount_minor: null,
      reconciliation_status: null,
    };
    // At least REPAIR_SCAN_LIMIT aged rows already marked REVIEW_REQUIRED would
    // starve the scan if not excluded at the QUERY level (§21/B7).
    const agedReviewRequired = Array.from({ length: REPAIR_SCAN_LIMIT }, (_, i) => ({
      id: `ref-aged-${i}`,
      payment_id: `pay-aged-${i}`,
      provider: 'paypal',
      provider_refund_ref: null,
      amount_minor: 1999,
      currency: 'USD',
      status: 'processing',
      reason_code: null,
      requested_by: 'user-1',
      provider_status_code: 'REVIEW_REQUIRED',
      requested_at: '2026-07-01T12:00:00Z',
      completed_at: null,
    }));
    const recentRefund = {
      id: 'ref-recent',
      payment_id: 'pay-1',
      provider: 'paypal',
      provider_refund_ref: null,
      amount_minor: 1999,
      currency: 'USD',
      status: 'processing',
      reason_code: null,
      requested_by: 'user-1',
      provider_status_code: null, // NULL — normal recent refund, must stay eligible
      requested_at: '2026-08-16T11:50:00Z',
      completed_at: null,
    };
    const mock = createMockDb({
      payments: { data: [paypalPayment] },
      orders: { data: { ...ORDER_ROW, status: 'paid', currency: 'USD', amount_minor: 1999 } },
      'rpc:finalize_refund_success': { data: { ...REFUND_TRANSACTION, refund_id: 'ref-recent' } },
      refunds: { data: [...agedReviewRequired, recentRefund] },
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
    // Only the recent recoverable refund is resumed/confirmed.
    expect(JSON.parse(result.body)).toMatchObject({ refunds_resumed: 1, refunds_confirmed: 1 });

    // REVIEW_REQUIRED rows never call adapter.refund() — exactly one POST total.
    expect(paypalAdapter.refund).toHaveBeenCalledTimes(1);
    expect(paypalAdapter.refund).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 'pay-1', providerPaymentRef: 'CAPTURE-1' }),
    );

    // The scan query issues the NULL-safe REVIEW_REQUIRED exclusion (before the limit).
    const orCalls = mock.callsFor('refunds', 'or');
    expect(orCalls.length).toBe(1);
    expect(String(orCalls[0].args[0])).toContain('provider_status_code.is.null');
    expect(String(orCalls[0].args[0])).toContain('provider_status_code.neq.REVIEW_REQUIRED');
  });
});
