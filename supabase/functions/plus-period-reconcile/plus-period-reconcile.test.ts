import { describe, expect, it, vi } from 'vitest';
import type { EcpayTransport } from '../../../src/lib/payments/ecpay/adapter.ts';
import { parsePeriodQueryResponse } from '../../../src/lib/payments/ecpay/period.ts';
import { ECPAY_URLS } from '../../../src/lib/payments/ecpay/urls.ts';
import { createMockDb, fakeLogger, handlerRequest, testEnv } from '../_shared/testing.ts';
import { handlePlusPeriodReconcile } from './handler.ts';

const env = testEnv();
const NOW = new Date('2026-11-01T00:00:00.000Z');

const activeOrder = {
  merchant_trade_no: 'BJHPLUS001',
  user_id: 'user-1',
  plan_code: 'plus_early_access_monthly',
  environment: 'stage',
  period_amount_twd: 299,
  status: 'active',
  reconcile_lease_token: 'lease-1',
  created_at: '2026-10-01T00:00:00.000Z',
};

const oneCharge = JSON.stringify({
  MerchantTradeNo: activeOrder.merchant_trade_no,
  RtnCode: 1,
  ExecStatus: '1',
  TotalSuccessTimes: 1,
  ExecLog: [
    {
      RtnCode: 1,
      amount: 299,
      gwsr: 12345,
      process_date: '2026/10/27 03:45:00',
      auth_code: 'ABC123',
      TradeNo: 'EC12345',
    },
  ],
});

function setup(options: { orders?: unknown[]; post?: ReturnType<typeof vi.fn> } = {}) {
  const mock = createMockDb({
    plus_membership_ecpay_order: { data: options.orders ?? [activeOrder] },
    'rpc:claim_plus_ecpay_reconcile_order': { rpcResults: [
      { data: options.orders ?? [activeOrder] }, { data: [] },
    ] },
    'rpc:release_plus_ecpay_reconcile_order': { data: true },
    'rpc:request_plus_ecpay_finance_case': { data: 'case-1' },
    'rpc:record_plus_ecpay_receipt': { data: 'new' },
    'rpc:record_plus_membership_event': { data: 'applied' },
    'rpc:set_plus_ecpay_receipt_result': { data: null },
    'rpc:resolve_plus_membership_access': { data: { access_status: 'active' } },
    'rpc:set_plus_ecpay_order_status': { data: null },
  });
  const post = options.post ?? vi.fn().mockResolvedValue({ status: 200, body: oneCharge });
  const transport = { post } as unknown as EcpayTransport;
  const log = fakeLogger();
  const handle = (headers: Record<string, string> = { 'x-scheduled-job-secret': 'test-scheduled-secret' }) =>
    handlePlusPeriodReconcile(
      handlerRequest('POST', 'https://test.example/plus-period-reconcile', '', headers),
      { env, db: mock.db, log, now: () => NOW, transport },
    );
  return { mock, log, post, handle };
}

describe('plus-period-reconcile', () => {
  it('rejects a missing or wrong scheduled-job secret', async () => {
    const { mock, handle } = setup();
    expect((await handle({ 'x-scheduled-job-secret': 'wrong' })).status).toBe(401);
    expect(mock.rpcCalls('claim_plus_ecpay_reconcile_order')).toHaveLength(0);
  });

  it('ingests every successful authorization through the shared callback path', async () => {
    const { mock, post, handle } = setup();
    const result = await handle();
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ checked: 1, ingested: 1, failed: 0 });
    expect(post).toHaveBeenCalledWith(
      ECPAY_URLS.stage.queryCreditCardPeriodInfo,
      expect.objectContaining({ MerchantTradeNo: activeOrder.merchant_trade_no }),
      5_000,
    );
    expect(mock.rpcCalls('record_plus_ecpay_receipt')[0].args[0]).toMatchObject({
      p_source_event_id: `${activeOrder.merchant_trade_no}:auth:12345`,
      p_amount_twd: 299,
    });
    expect(mock.rpcCalls('record_plus_membership_event')).toHaveLength(1);
  });

  it('closes an active order when the provider terminates the period program', async () => {
    const body = JSON.stringify({
      MerchantTradeNo: activeOrder.merchant_trade_no,
      RtnCode: 1,
      ExecStatus: '0',
      TotalSuccessTimes: 1,
      ExecLog: [],
    });
    const { mock, handle } = setup({ post: vi.fn().mockResolvedValue({ status: 200, body }) });
    expect((await handle()).status).toBe(200);
    expect(mock.rpcCalls('set_plus_ecpay_order_status')[0].args[0]).toEqual({
      p_merchant_trade_no: activeOrder.merchant_trade_no,
      p_status: 'ended',
    });
  });

  it('keeps the order open when a charge could not be ingested', async () => {
    const body = JSON.stringify({
      MerchantTradeNo: activeOrder.merchant_trade_no,
      RtnCode: 1,
      ExecStatus: '0',
      TotalSuccessTimes: 1,
      ExecLog: [
        {
          RtnCode: 1,
          amount: 299,
          gwsr: 12345,
          process_date: '2026/10/27 03:45:00',
          auth_code: 'ABC123',
          TradeNo: 'EC12345',
        },
      ],
    });
    const { mock, handle } = setup({ post: vi.fn().mockResolvedValue({ status: 200, body }) });
    mock.setRoute('rpc:record_plus_ecpay_receipt', { error: 'write failed' });
    const result = await handle();
    expect(JSON.parse(result.body)).toEqual({ checked: 1, ingested: 0, failed: 1 });
    expect(mock.rpcCalls('set_plus_ecpay_order_status')).toHaveLength(0);
  });

  it('ends a stale pending order ECPay cannot query', async () => {
    const staleOrder = {
      ...activeOrder,
      status: 'pending',
      created_at: '2026-10-30T23:00:00.000Z',
    };
    const { mock, post, handle } = setup({
      orders: [staleOrder],
      post: vi.fn().mockRejectedValue(new Error('not found')),
    });
    const result = await handle();
    expect(JSON.parse(result.body)).toEqual({ checked: 1, ingested: 0, failed: 1 });
    expect(post).toHaveBeenCalledTimes(1);
    expect(mock.rpcCalls('set_plus_ecpay_order_status')[0].args[0]).toEqual({
      p_merchant_trade_no: activeOrder.merchant_trade_no,
      p_status: 'ended',
    });
  });

  it('ingests a stale pending order ECPay has a charge for and leaves it open', async () => {
    const staleOrder = {
      ...activeOrder,
      status: 'pending',
      created_at: '2026-10-30T23:00:00.000Z',
    };
    const { mock, handle } = setup({ orders: [staleOrder] });
    // The receipt RPC activates the first order; the mock returns the status
    // the ingest reads after that write.
    mock.setRoute('plus_membership_ecpay_order', {
      data: [staleOrder],
      singleData: [{ ...staleOrder, status: 'active' }],
    });
    const result = await handle();
    expect(JSON.parse(result.body)).toEqual({ checked: 1, ingested: 1, failed: 0 });
    expect(mock.rpcCalls('set_plus_ecpay_order_status')).toHaveLength(0);
  });

  it('queries a pending order that is only an hour old', async () => {
    const freshOrder = {
      ...activeOrder,
      status: 'pending',
      created_at: '2026-10-31T23:00:00.000Z',
    };
    const { mock, post, handle } = setup({
      orders: [freshOrder],
      post: vi.fn().mockRejectedValue(new Error('not found')),
    });
    const result = await handle();
    expect(JSON.parse(result.body)).toEqual({ checked: 1, ingested: 0, failed: 1 });
    expect(post).toHaveBeenCalledTimes(1);
    expect(mock.rpcCalls('set_plus_ecpay_order_status')).toHaveLength(0);
  });

  it('counts a failed provider query without aborting the run', async () => {
    const { handle } = setup({ post: vi.fn().mockRejectedValue(new Error('timeout')) });
    const result = await handle();
    expect(JSON.parse(result.body)).toEqual({ checked: 1, ingested: 0, failed: 1 });
  });
});

describe('bounded durable reconciliation', () => {
  it('claims environment-bound work and releases the exact lease even after an unexpected failure', async () => {
    const { mock, handle } = setup();
    const rpc = mock.db.rpc.bind(mock.db);
    mock.db.rpc = vi.fn(async (name, args) => {
      if (name === 'record_plus_ecpay_receipt') throw new Error('connection lost');
      return rpc(name, args);
    });
    const result = await handle();
    expect(JSON.parse(result.body)).toEqual({ checked: 1, ingested: 0, failed: 1 });
    expect(mock.rpcCalls('claim_plus_ecpay_reconcile_order')[0].args[0])
      .toEqual({ p_environment: 'stage' });
    expect(mock.rpcCalls('release_plus_ecpay_reconcile_order')[0].args[0])
      .toEqual({ p_merchant_trade_no: activeOrder.merchant_trade_no, p_lease_token: 'lease-1' });
  });

  it('caps each invocation instead of draining a growing queue', async () => {
    const { mock, handle, post } = setup();
    mock.setRoute('rpc:claim_plus_ecpay_reconcile_order', { data: [activeOrder] });
    await handle();
    expect(mock.rpcCalls('claim_plus_ecpay_reconcile_order')).toHaveLength(12);
    expect(mock.rpcCalls('release_plus_ecpay_reconcile_order')).toHaveLength(12);
    expect(post).toHaveBeenCalledTimes(12);
  });

  it('stops claiming new work at the run deadline and clamps the provider timeout', async () => {
    const { mock, log } = setup();
    let elapsed = 0;
    const post = vi.fn(async () => {
      elapsed = 40_001;
      return { status: 200, body: oneCharge };
    });
    const result = await handlePlusPeriodReconcile(
      handlerRequest('POST', 'https://test.example/plus-period-reconcile', '', {
        'x-scheduled-job-secret': 'test-scheduled-secret',
      }),
      { env, db: mock.db, log, now: () => NOW, transport: { post }, monotonicNow: () => elapsed },
    );
    expect(post.mock.calls[0]).toBeDefined();
    expect(mock.rpcCalls('claim_plus_ecpay_reconcile_order')).toHaveLength(1);
    expect(mock.rpcCalls('release_plus_ecpay_reconcile_order')).toHaveLength(1);
    // No charge is ACKed as ingested after the budget; next invocation retries it.
    expect(mock.rpcCalls('record_plus_ecpay_receipt')).toHaveLength(0);
    expect(JSON.parse(result.body)).toMatchObject({ checked: 1, failed: 1 });
  });

  it('resumes past equivalent completed receipts while still checking changed facts', async () => {
    const parsed = await parsePeriodQueryResponse(oneCharge, activeOrder.merchant_trade_no);
    const auth = parsed.authorizations[0];
    const { mock, handle } = setup();
    mock.setRoute('plus_membership_ecpay_receipt', { data: [{
      source_event_id: auth.sourceEventId, facts_sha256: auth.factsSha256, lifecycle_result: 'applied',
    }] });
    await handle();
    expect(mock.rpcCalls('record_plus_ecpay_receipt')).toHaveLength(0);
    mock.setRoute('rpc:claim_plus_ecpay_reconcile_order', { rpcResults: [{ data: [activeOrder] }, { data: [] }] });
    mock.setRoute('plus_membership_ecpay_receipt', { data: [{
      source_event_id: auth.sourceEventId, facts_sha256: 'changed', lifecycle_result: 'applied',
    }] });
    await handle();
    expect(mock.rpcCalls('record_plus_ecpay_receipt')).toHaveLength(1);
  });

  it('keeps a stale pending order recoverable if the receipt-resume lookup fails', async () => {
    const { mock, handle } = setup({ orders: [{ ...activeOrder, status: 'pending' }] });
    mock.setRoute('plus_membership_ecpay_receipt', { error: 'receipt lookup unavailable' });
    expect(JSON.parse((await handle()).body)).toEqual({ checked: 1, ingested: 0, failed: 1 });
    expect(mock.rpcCalls('set_plus_ecpay_order_status')).toHaveLength(0);
    expect(mock.rpcCalls('release_plus_ecpay_reconcile_order')).toHaveLength(1);
  });

  it('fails closed if the durable claim is unavailable', async () => {
    const { mock, post, handle } = setup();
    mock.setRoute('rpc:claim_plus_ecpay_reconcile_order', { error: 'database offline' });
    expect((await handle()).status).toBe(500);
    expect(post).not.toHaveBeenCalled();
  });

  it('reports release failure while leaving expiry-based recovery to the database', async () => {
    const { mock, handle } = setup();
    mock.setRoute('rpc:release_plus_ecpay_reconcile_order', { data: false });
    expect(JSON.parse((await handle()).body)).toMatchObject({ failed: 1 });
  });
});
