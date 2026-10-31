import { describe, expect, it, vi } from 'vitest';
import type { EcpayTransport } from '../../../src/lib/payments/ecpay/adapter.ts';
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
    expect(mock.callsFor('plus_membership_ecpay_order')).toHaveLength(0);
  });

  it('ingests every successful authorization through the shared callback path', async () => {
    const { mock, post, handle } = setup();
    const result = await handle();
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ checked: 1, ingested: 1, failed: 0 });
    expect(post).toHaveBeenCalledWith(
      ECPAY_URLS.stage.queryCreditCardPeriodInfo,
      expect.objectContaining({ MerchantTradeNo: activeOrder.merchant_trade_no }),
      15_000,
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

  it('ends a stale pending order without querying ECPay', async () => {
    const staleOrder = {
      ...activeOrder,
      status: 'pending',
      created_at: '2026-10-30T23:00:00.000Z',
    };
    const { mock, post, handle } = setup({ orders: [staleOrder] });
    const result = await handle();
    expect(JSON.parse(result.body)).toEqual({ checked: 1, ingested: 0, failed: 0 });
    expect(post).not.toHaveBeenCalled();
    expect(mock.rpcCalls('set_plus_ecpay_order_status')[0].args[0]).toEqual({
      p_merchant_trade_no: activeOrder.merchant_trade_no,
      p_status: 'ended',
    });
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
