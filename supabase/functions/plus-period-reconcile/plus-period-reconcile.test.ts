import { describe, expect, it, vi } from 'vitest';
import type { EcpayTransport } from '../../../src/lib/payments/ecpay/adapter.ts';
import { ecpayCheckMac } from '../../../src/lib/payments/ecpay/checkmac.ts';
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

async function cancelResponse(code = '1') {
  const fields = { MerchantID: env.ecpayMerchantId!, MerchantTradeNo: activeOrder.merchant_trade_no, RtnCode: code };
  const CheckMacValue = await ecpayCheckMac(fields, env.ecpayHashKey!, env.ecpayHashIV!);
  return { status: 200, body: new URLSearchParams({ ...fields, CheckMacValue }).toString() };
}

function setup(options: { orders?: unknown[]; post?: ReturnType<typeof vi.fn> } = {}) {
  const mock = createMockDb({
    plus_membership_ecpay_order: { data: options.orders ?? [activeOrder] },
    'rpc:claim_plus_ecpay_reconcile_order': { data: null, rpcResults: [
      ...(options.orders ?? [activeOrder]).map((data) => ({ data })), { data: null },
    ] },
    'rpc:record_plus_ecpay_authorization': { data: { status: 'new', source_event_id: `${activeOrder.merchant_trade_no}:auth:12345`, total_success_times: 1 } },
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
  it('stops claiming new work once its time budget is used', async () => {
    const mock = createMockDb();
    const clock = vi.fn().mockReturnValueOnce(NOW).mockReturnValue(new Date(NOW.getTime() + 60_000));
    const post = vi.fn();
    const result = await handlePlusPeriodReconcile(
      handlerRequest('POST', 'https://test.example/reconcile', '', { 'x-scheduled-job-secret': 'test-scheduled-secret' }),
      { env, db: mock.db, log: fakeLogger(), now: clock, transport: { post } },
    );
    expect(JSON.parse(result.body)).toEqual({ checked: 0, ingested: 0, failed: 0 });
    expect(mock.rpcCalls('claim_plus_ecpay_reconcile_order')).toHaveLength(0);
    expect(post).not.toHaveBeenCalled();
  });

  it('keeps failed final read-back queued even after billing is canceled', async () => {
    const { mock, handle } = setup({ orders: [{ ...activeOrder, status: 'canceled' }],
      post: vi.fn().mockRejectedValue(new Error('provider unavailable')) });
    expect(JSON.parse((await handle()).body)).toEqual({ checked: 1, ingested: 0, failed: 1 });
    expect(mock.rpcCalls('complete_plus_ecpay_cancel_readback')).toHaveLength(0);
    expect(mock.rpcCalls('set_plus_ecpay_order_status')).toHaveLength(0);
  });

  it('recovers an interrupted customer cancel with durable stop evidence', async () => {
    const post = vi.fn().mockResolvedValueOnce(await cancelResponse()).mockResolvedValueOnce({
      status: 200, body: JSON.stringify({ MerchantTradeNo: activeOrder.merchant_trade_no,
        RtnCode: 1, ExecStatus: '0', ExecLog: [] }),
    });
    const { mock, handle } = setup({ orders: [{ ...activeOrder, status: 'cancel_requested' }], post });
    mock.setRoute('rpc:confirm_plus_ecpay_customer_cancel', { data: { provider_canceled_at: NOW.toISOString() } });
    expect(JSON.parse((await handle()).body)).toEqual({ checked: 1, ingested: 0, failed: 0 });
    expect(mock.rpcCalls('confirm_plus_ecpay_customer_cancel')).toHaveLength(1);
    expect(mock.rpcCalls('complete_plus_ecpay_cancel_readback')).toHaveLength(1);
    expect(mock.rpcCalls('record_plus_membership_event')).toHaveLength(0);
  });

  it('uses the durable claim queue, including retries that remain open', async () => {
    const { mock, handle } = setup({ post: vi.fn().mockRejectedValue(new Error('timeout')) });
    await handle();
    expect(mock.rpcCalls('claim_plus_ecpay_reconcile_order')[0].args[0]).toEqual({ p_environment: 'stage' });
    expect(mock.callsFor('plus_membership_ecpay_order', 'order')).toHaveLength(0);
  });

  it('reaches a paying order beyond 1,000 retained failed checkouts on the next run', async () => {
    const abandoned = Array.from({ length: 1000 }, (_, i) => ({
      ...activeOrder, merchant_trade_no: `abandoned-${i}`, status: 'pending',
    }));
    const post = vi.fn(async (_url: string, fields: Record<string, string>) => {
      if (fields.MerchantTradeNo.startsWith('abandoned-')) throw new Error('provider unavailable');
      return { status: 200, body: oneCharge };
    });
    const { mock, handle } = setup({ orders: [...abandoned, activeOrder], post });
    expect(JSON.parse((await handle()).body)).toMatchObject({ checked: 1000, ingested: 0 });
    mock.setRoute('plus_membership_ecpay_order', { data: activeOrder });
    expect(JSON.parse((await handle()).body)).toEqual({ checked: 1, ingested: 1, failed: 0 });
    expect(mock.rpcCalls('record_plus_membership_event')).toHaveLength(1);
  });

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
    expect(mock.rpcCalls('record_plus_ecpay_authorization')[0].args[0]).toMatchObject({
      p_source_event_id: `${activeOrder.merchant_trade_no}:auth:12345`,
      p_amount_twd: 299,
    });
    expect(mock.rpcCalls('record_plus_membership_event')).toHaveLength(1);
  });

  it.each(['0', '2', '3'])('cancels before closing an active order with ExecStatus %s', async (execStatus) => {
    const body = JSON.stringify({
      MerchantTradeNo: activeOrder.merchant_trade_no,
      RtnCode: 1,
      ExecStatus: execStatus,
      TotalSuccessTimes: 1,
      ExecLog: [],
    });
    const { mock, post, handle } = setup({ post: vi.fn().mockResolvedValueOnce({ status: 200, body }).mockResolvedValueOnce(await cancelResponse()) });
    expect((await handle()).status).toBe(200);
    expect(post).toHaveBeenLastCalledWith(ECPAY_URLS.stage.creditCardPeriodAction, expect.objectContaining({ Action: 'Cancel' }), 15_000);
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
    mock.setRoute('rpc:record_plus_ecpay_authorization', { error: 'write failed' });
    const result = await handle();
    expect(JSON.parse(result.body)).toEqual({ checked: 1, ingested: 0, failed: 1 });
    expect(mock.rpcCalls('set_plus_ecpay_order_status')).toHaveLength(0);
  });

  it.each(['1', '90100149'])('ends a stale unqueryable pending order only after verified Cancel %s', async (code) => {
    const staleOrder = {
      ...activeOrder,
      status: 'pending',
      created_at: '2026-10-30T23:00:00.000Z',
    };
    const { mock, post, handle } = setup({
      orders: [staleOrder],
      post: vi.fn().mockRejectedValueOnce(new Error('not found')).mockResolvedValueOnce(await cancelResponse(code)),
    });
    const result = await handle();
    expect(JSON.parse(result.body)).toEqual({ checked: 1, ingested: 0, failed: 1 });
    expect(post).toHaveBeenCalledTimes(2);
    expect(mock.rpcCalls('set_plus_ecpay_order_status')[0].args[0]).toEqual({
      p_merchant_trade_no: activeOrder.merchant_trade_no,
      p_status: 'ended',
    });
  });

  it.each(['query failed', 'empty log', 'paused'])('keeps %s orders open when Cancel is not confirmed', async (scenario) => {
    const post = vi.fn();
    if (scenario === 'query failed') post.mockRejectedValueOnce(new Error('timeout'));
    else post.mockResolvedValueOnce({ status: 200, body: JSON.stringify({
      MerchantTradeNo: activeOrder.merchant_trade_no, RtnCode: 1,
      ExecStatus: scenario === 'paused' ? '3' : '1', ExecLog: [],
    }) });
    post.mockResolvedValueOnce({ status: 200, body: 'RtnCode=1' }); // unsigned success is insufficient
    const { mock, log, handle } = setup({ orders: [{ ...activeOrder, status: 'pending' }], post });
    await handle();
    expect(mock.rpcCalls('set_plus_ecpay_order_status')).toHaveLength(0);
    expect(log.error).toHaveBeenCalled();
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
