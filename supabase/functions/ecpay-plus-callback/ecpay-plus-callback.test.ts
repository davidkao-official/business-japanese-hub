import { describe, expect, it, vi } from 'vitest';
import type { EcpayTransport } from '../../../src/lib/payments/ecpay/adapter.ts';
import { ecpayCheckMac } from '../../../src/lib/payments/ecpay/checkmac.ts';
import { ECPAY_URLS } from '../../../src/lib/payments/ecpay/urls.ts';
import { createMockDb, fakeLogger, handlerRequest, testEnv } from '../_shared/testing.ts';
import { handleEcpayPlusCallback } from './handler.ts';

const env = testEnv();
const order = {
  merchant_trade_no: 'BJHPLUS001',
  user_id: 'user-1',
  plan_code: 'plus_early_access_monthly',
  environment: 'stage',
  period_amount_twd: 299,
  status: 'active',
};
const sourceEventId = `${order.merchant_trade_no}:auth:12345`;

async function signedForm(overrides: Record<string, string> = {}): Promise<string> {
  const fields = {
    MerchantID: env.ecpayMerchantId!,
    MerchantTradeNo: order.merchant_trade_no,
    PeriodType: 'M',
    RtnCode: '1',
    Amount: '299',
    gwsr: '12345',
    TradeNo: 'EC12345',
    ProcessDate: '2026/10/27 03:45:00', // ECPay format: Asia/Taipei (UTC+08:00).
    TotalSuccessTimes: '1',
    SimulatePaid: '0',
    ...overrides,
  };
  const CheckMacValue = await ecpayCheckMac(fields, env.ecpayHashKey!, env.ecpayHashIV!);
  return new URLSearchParams({ ...fields, CheckMacValue }).toString();
}

/** Signed generic AIO payment-result form (the FIRST authorization, no PeriodType). */
async function signedAioForm(overrides: Record<string, string> = {}): Promise<string> {
  const fields = {
    MerchantID: env.ecpayMerchantId!,
    MerchantTradeNo: order.merchant_trade_no,
    StoreID: '',
    RtnCode: '1',
    RtnMsg: '交易成功',
    TradeNo: 'EC12345',
    TradeAmt: '299',
    PaymentDate: '2026/10/27 03:45:00',
    PaymentType: 'Credit_CreditCard',
    PaymentTypeChargeFee: '8',
    TradeDate: '2026/10/27 03:45:00',
    SimulatePaid: '0',
    CustomField1: '',
    CustomField2: '',
    CustomField3: '',
    CustomField4: '',
    ...overrides,
  };
  const CheckMacValue = await ecpayCheckMac(fields, env.ecpayHashKey!, env.ecpayHashIV!);
  return new URLSearchParams({ ...fields, CheckMacValue }).toString();
}

async function cancelResponse(code = '1') {
  const fields = { MerchantID: env.ecpayMerchantId!, MerchantTradeNo: order.merchant_trade_no, RtnCode: code };
  const CheckMacValue = await ecpayCheckMac(fields, env.ecpayHashKey!, env.ecpayHashIV!);
  return { status: 200, body: new URLSearchParams({ ...fields, CheckMacValue }).toString() };
}

function setup() {
  const mock = createMockDb({
    plus_membership_ecpay_order: { data: order },
    'rpc:record_plus_ecpay_authorization': { data: { status: 'new', source_event_id: sourceEventId, total_success_times: 1 } },
    'rpc:record_plus_membership_event': { data: 'applied' },
    'rpc:set_plus_ecpay_receipt_result': { data: null },
    'rpc:resolve_plus_membership_access': { data: { access_status: 'active' } },
  });
  const log = fakeLogger();
  const post = vi.fn();
  const transport = { post } as unknown as EcpayTransport;
  const handle = (body: string, method = 'POST') => handleEcpayPlusCallback(
    handlerRequest(method, 'https://test.example/ecpay-plus-callback', body),
    { env, db: mock.db, log, transport, now: () => new Date('2026-10-27T00:00:00.000Z') },
  );
  return { mock, log, post, handle };
}

describe('ecpay-plus-callback', () => {
  it('rejects GET with 405', async () => {
    const { handle } = setup();
    expect((await handle('', 'GET')).status).toBe(405);
  });

  it('rejects a bad CheckMac without an RPC', async () => {
    const { mock, handle } = setup();
    const form = new URLSearchParams(await signedForm());
    form.set('CheckMacValue', 'invalid');
    expect(await handle(form.toString())).toMatchObject({ status: 400, body: '0|invalid' });
    expect(mock.calls.filter((call) => call.table === 'rpc')).toHaveLength(0);
  });

  it('rejects an unknown order', async () => {
    const { mock, handle } = setup();
    mock.setRoute('plus_membership_ecpay_order', { data: null });
    expect(await handle(await signedForm())).toMatchObject({ status: 400, body: '0|unknown order' });
  });

  it('persists the receipt, starts membership through the settlement buffer, then saves the result', async () => {
    const { mock, handle } = setup();
    expect(await handle(await signedForm())).toMatchObject({ status: 200, body: '1|OK' });
    expect(mock.rpcCalls('record_plus_ecpay_authorization')[0].args[0]).toMatchObject({
      p_source_event_id: sourceEventId,
      p_merchant_trade_no: order.merchant_trade_no,
      p_kind: 'authorization',
      p_rtn_code: '1',
      p_amount_twd: 299,
      p_simulate_paid: false,
    });
    expect(mock.rpcCalls('record_plus_membership_event')[0].args[0]).toEqual({
      p_source_system: 'ecpay_aio_period:stage',
      p_source_customer_id: order.merchant_trade_no,
      p_source_subscription_id: order.merchant_trade_no,
      p_source_event_id: sourceEventId,
      p_user_id: order.user_id,
      p_plan_code: order.plan_code,
      p_event_type: 'membership_started',
      p_occurred_at: '2026-10-26T19:45:00.000Z',
      p_period_start: '2026-10-26T19:45:00.000Z',
      p_period_end: '2026-11-28T16:00:00.000Z',
      p_cancel_at_period_end: false,
      p_metadata: { gwsr: '12345', total_success_times: 1 },
    });
    expect(mock.rpcCalls('set_plus_ecpay_receipt_result')[0].args[0]).toEqual({
      p_source_event_id: sourceEventId,
      p_result: 'applied',
    });
    expect(mock.calls.filter((call) => call.table === 'rpc').map((call) => call.method)).toEqual([
      'record_plus_ecpay_authorization',
      'record_plus_membership_event',
      'set_plus_ecpay_receipt_result',
      'resolve_plus_membership_access',
    ]);
  });

  it('maps subsequent successful charges to membership_renewed', async () => {
    const { mock, handle } = setup();
    mock.setRoute('rpc:record_plus_ecpay_authorization', { data: { status: 'new', source_event_id: sourceEventId, total_success_times: 2 } });
    mock.setRoute('plus_membership_ecpay_receipt', { data: { process_at: '2027-01-30T16:30:00.000Z' } });
    expect(await handle(await signedForm({
      TotalSuccessTimes: '2', ProcessDate: '2027/02/28 23:59:59',
    }))).toMatchObject({ status: 200, body: '1|OK' });
    expect(mock.rpcCalls('record_plus_membership_event')[0].args[0]).toMatchObject({
      p_event_type: 'membership_renewed',
      p_period_start: '2027-02-28T15:59:59.000Z',
      p_period_end: '2027-04-01T16:00:00.000Z',
    });
    expect(mock.callsFor('plus_membership_ecpay_receipt', 'eq').map((call) => call.args))
      .toContainEqual(['merchant_trade_no', order.merchant_trade_no]);
    expect(mock.callsFor('plus_membership_ecpay_receipt', 'eq').map((call) => call.args))
      .toContainEqual(['total_success_times', 1]);
  });

  it('retries a renewal without its first authorization until read-back recovers the anchor', async () => {
    const { mock, log, handle } = setup();
    mock.setRoute('rpc:record_plus_ecpay_authorization', { data: { status: 'new', source_event_id: sourceEventId, total_success_times: 2 } });
    expect(await handle(await signedForm({ TotalSuccessTimes: '2' }))).toMatchObject({ status: 500, body: '0|retry' });
    expect(mock.rpcCalls('record_plus_membership_event')).toHaveLength(0);
    expect(mock.rpcCalls('set_plus_ecpay_receipt_result')).toHaveLength(0);
    expect(log.error).toHaveBeenCalledWith({ sourceEventId }, 'ecpay plus first authorization unavailable');
  });

  it.each([
    ['failed charge', { RtnCode: '0' }],
    ['SimulatePaid', { SimulatePaid: '1' }],
    ['amount mismatch', { Amount: '300' }],
  ] as const)('stores %s as not_mapped without a lifecycle event', async (_, overrides) => {
    const { mock, log, handle } = setup();
    expect(await handle(await signedForm(overrides))).toMatchObject({ status: 200, body: '1|OK' });
    expect(mock.rpcCalls('record_plus_membership_event')).toHaveLength(0);
    expect(mock.rpcCalls('set_plus_ecpay_receipt_result')[0].args[0]).toEqual({
      p_source_event_id: sourceEventId,
      p_result: 'not_mapped',
    });
    if ('Amount' in overrides) expect(log.error).toHaveBeenCalled();
  });

  it('acknowledges a quarantined receipt conflict without a lifecycle event', async () => {
    const { mock, log, handle } = setup();
    mock.setRoute('rpc:record_plus_ecpay_authorization', { data: { status: 'conflict', source_event_id: sourceEventId, total_success_times: 1 } });
    expect(await handle(await signedForm())).toMatchObject({ status: 200, body: '1|OK' });
    expect(mock.rpcCalls('record_plus_membership_event')).toHaveLength(0);
    expect(log.error).toHaveBeenCalledWith({ sourceEventId }, 'ecpay plus receipt conflict');
  });

  it('acknowledges a replay with an existing lifecycle result without reapplying', async () => {
    const { mock, handle } = setup();
    mock.setRoute('rpc:record_plus_ecpay_authorization', { data: { status: 'replayed', source_event_id: sourceEventId, total_success_times: 1 } });
    mock.setRoute('plus_membership_ecpay_receipt', { data: { lifecycle_result: 'applied' } });
    expect(await handle(await signedForm())).toMatchObject({ status: 200, body: '1|OK' });
    expect(mock.rpcCalls('record_plus_membership_event')).toHaveLength(0);
  });

  it('recovers a replay whose lifecycle result is still null', async () => {
    const { mock, handle } = setup();
    mock.setRoute('rpc:record_plus_ecpay_authorization', { data: { status: 'replayed', source_event_id: sourceEventId, total_success_times: 1 } });
    mock.setRoute('plus_membership_ecpay_receipt', { data: { lifecycle_result: null } });
    expect(await handle(await signedForm())).toMatchObject({ status: 200, body: '1|OK' });
    expect(mock.rpcCalls('record_plus_membership_event')).toHaveLength(1);
    expect(mock.rpcCalls('set_plus_ecpay_receipt_result')[0].args[0]).toMatchObject({ p_result: 'applied' });
  });

  it.each(['pending', 'canceled', 'ended'])('cancels a new charge on a %s order without a lifecycle event', async (status) => {
    const { mock, log, post, handle } = setup();
    mock.setRoute('plus_membership_ecpay_order', { data: { ...order, status } });
    post.mockResolvedValue(await cancelResponse());
    expect(await handle(await signedForm())).toMatchObject({ status: 200, body: '1|OK' });
    expect(post).toHaveBeenCalledWith(
      ECPAY_URLS.stage.creditCardPeriodAction,
      expect.objectContaining({
        Action: 'Cancel',
        MerchantTradeNo: order.merchant_trade_no,
      }),
      15_000,
    );
    expect(log.error).toHaveBeenCalled();
    if (status === 'pending') {
      expect(mock.rpcCalls('set_plus_ecpay_order_status')[0].args[0]).toMatchObject({ p_status: 'ended' });
    } else expect(mock.rpcCalls('set_plus_ecpay_order_status')).toHaveLength(0);
    expect(mock.rpcCalls('set_plus_ecpay_receipt_result')[0].args[0]).toEqual({
      p_source_event_id: sourceEventId,
      p_result: 'not_mapped',
    });
    expect(mock.rpcCalls('record_plus_membership_event')).toHaveLength(0);
    expect(mock.calls.filter((call) => call.table === 'rpc').map((call) => call.method)).toEqual([
      'record_plus_ecpay_authorization',
      'set_plus_ecpay_receipt_result',
      ...(status === 'pending' ? ['set_plus_ecpay_order_status'] : []),
    ]);
  });

  it('retries when ECPay does not acknowledge the duplicate cancellation', async () => {
    const { mock, post, handle } = setup();
    mock.setRoute('plus_membership_ecpay_order', { data: { ...order, status: 'pending' } });
    post.mockResolvedValue({ status: 200, body: 'RtnCode=0&RtnMsg=Failed' });
    expect(await handle(await signedForm())).toMatchObject({ status: 500, body: '0|retry' });
    expect(mock.rpcCalls('set_plus_ecpay_order_status')).toHaveLength(0);
  });

  it('requests a retry on writer error and leaves the receipt result unset', async () => {
    const { mock, handle } = setup();
    mock.setRoute('rpc:record_plus_membership_event', { error: 'write failed' });
    expect(await handle(await signedForm())).toMatchObject({ status: 500, body: '0|retry' });
    expect(mock.rpcCalls('set_plus_ecpay_receipt_result')).toHaveLength(0);
  });
});

describe('ecpay-plus-callback — first-authorization (AIO) format', () => {
  it('grants the signed first charge without waiting for ExecLog', async () => {
    const { mock, post, handle } = setup();
    expect(await handle(await signedAioForm())).toMatchObject({ status: 200, body: '1|OK' });
    expect(post).not.toHaveBeenCalled();
    expect(mock.rpcCalls('record_plus_ecpay_authorization')[0].args[0]).toMatchObject({
      p_source_event_id: `${order.merchant_trade_no}:first:EC12345`,
      p_trade_no: 'EC12345', p_gwsr: '', p_amount_twd: 299,
      p_process_at: '2026-10-26T19:45:00.000Z',
    });
    expect(mock.rpcCalls('record_plus_membership_event')[0].args[0]).toMatchObject({
      p_event_type: 'membership_started',
    });
  });

  it('uses the canonical first receipt when a later authorization aliases it', async () => {
    const { mock, handle } = setup();
    mock.setRoute('rpc:record_plus_ecpay_authorization', { data: {
      status: 'replayed', source_event_id: `${order.merchant_trade_no}:first:EC12345`, total_success_times: 1,
    } });
    mock.setRoute('plus_membership_ecpay_receipt', { data: { lifecycle_result: 'applied' } });
    expect(await handle(await signedForm())).toMatchObject({ status: 200 });
    expect(mock.rpcCalls('record_plus_membership_event')).toHaveLength(0);
    expect(mock.callsFor('plus_membership_ecpay_receipt', 'eq')[0].args).toEqual([
      'source_event_id', `${order.merchant_trade_no}:first:EC12345`,
    ]);
  });

  it.each([{ TradeAmt: 'oops' }, { PaymentDate: '' }, { TradeNo: '' }])(
    'rejects malformed signed first-charge fields %o', async (fields) => {
      const { mock, handle } = setup();
      expect(await handle(await signedAioForm(fields))).toMatchObject({ status: 400 });
      expect(mock.rpcCalls('record_plus_ecpay_authorization')).toHaveLength(0);
    },
  );

  it('rejects a generic notification with a bad CheckMac', async () => {
    const { mock, handle } = setup();
    const form = new URLSearchParams(await signedAioForm());
    form.set('CheckMacValue', 'invalid');
    expect(await handle(form.toString())).toMatchObject({ status: 400, body: '0|invalid' });
    expect(mock.calls.filter((call) => call.table === 'rpc')).toHaveLength(0);
  });

  it('acknowledges a failed first authorization without querying ECPay', async () => {
    const { post, handle } = setup();
    expect(await handle(await signedAioForm({ RtnCode: '10100058' }))).toMatchObject({
      status: 200,
      body: '1|OK',
    });
    expect(post).not.toHaveBeenCalled();
  });
});
