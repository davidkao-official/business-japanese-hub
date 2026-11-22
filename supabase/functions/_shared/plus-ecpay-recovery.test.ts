import { describe, expect, it, vi } from 'vitest';
import { ecpayCheckMac } from '../../../src/lib/payments/ecpay/checkmac.ts';
import { ECPAY_URLS } from '../../../src/lib/payments/ecpay/urls.ts';
import { handlePlusCancel } from '../plus-cancel/handler.ts';
import { handleEcpayPlusCallback } from '../ecpay-plus-callback/handler.ts';
import { createMockDb, fakeLogger, handlerRequest, testEnv } from './testing.ts';

const env = testEnv();
const stoppedAt = '2027-03-01T00:00:00.000Z';
const order = {
  merchant_trade_no: 'BJHP0123456789ABCDEF', user_id: 'reader',
  plan_code: 'plus_early_access_monthly', environment: 'stage', period_amount_twd: 299,
  status: 'active', updated_at: '2027-01-30T16:30:00.000Z',
  provider_canceled_at: null as string | null,
};

async function signed(fields: Record<string, string>) {
  return new URLSearchParams({ ...fields,
    CheckMacValue: await ecpayCheckMac(fields, env.ecpayHashKey!, env.ecpayHashIV!),
  }).toString();
}

async function setup() {
  let currentOrder = { ...order };
  const mock = createMockDb({
    'auth:getUser': { data: { id: order.user_id } },
    plus_membership_ecpay_order: { data: currentOrder },
    plus_membership_ecpay_receipt: { data: { process_at: order.updated_at } },
    plus_membership_stream_summary: { data: {
      period_start: order.updated_at, period_end: '2027-03-01T16:00:00.000Z', access_period_end: '2027-03-01T16:00:00.000Z',
    } },
    'rpc:record_plus_membership_event': { data: 'applied' },
    'rpc:resolve_plus_membership_access': { data: { access_status: 'active' } },
  });
  const originalRpc = mock.db.rpc;
  mock.db.rpc = vi.fn(async (fn, args) => {
    const result = await originalRpc(fn, args);
    if (result.error) return result;
    if (fn === 'confirm_plus_ecpay_customer_cancel') {
      currentOrder = { ...currentOrder, status: 'canceled', provider_canceled_at: stoppedAt };
      mock.setRoute('plus_membership_ecpay_order', { data: currentOrder });
      return { data: { provider_canceled_at: stoppedAt }, error: null };
    }
    if (fn === 'record_plus_ecpay_authorization') return {
      data: { status: 'new', source_event_id: args.p_source_event_id, total_success_times: 2 }, error: null,
    };
    if (fn === 'record_plus_membership_event') mock.setRoute('plus_membership_stream_summary', {
      data: { period_start: args.p_period_start, period_end: args.p_period_end, access_period_end: args.p_period_end },
    });
    return result;
  });
  const cancelBody = await signed({
    MerchantID: env.ecpayMerchantId!, MerchantTradeNo: order.merchant_trade_no, RtnCode: '1',
  });
  const post = vi.fn(async (url: string) => url === ECPAY_URLS.stage.creditCardPeriodAction
    ? { status: 200, body: cancelBody }
    : { status: 200, body: JSON.stringify({
      MerchantTradeNo: order.merchant_trade_no, RtnCode: 1, ExecStatus: '0', ExecLog: [],
    }) });
  const deps = { env, db: mock.db, log: fakeLogger(), now: () => new Date(stoppedAt), transport: { post } };
  const cancel = () => handlePlusCancel(handlerRequest('POST', 'https://edge.test/plus-cancel', '', {
    authorization: 'Bearer verified',
  }), deps);
  const callback = async (processDate: string) => handleEcpayPlusCallback(handlerRequest(
    'POST', 'https://edge.test/ecpay-plus-callback', await signed({
      MerchantID: env.ecpayMerchantId!, MerchantTradeNo: order.merchant_trade_no,
      PeriodType: 'M', RtnCode: '1', Amount: '299', gwsr: 'second', TradeNo: 'renewal',
      ProcessDate: processDate, TotalSuccessTimes: '2', SimulatePaid: '0',
    }),
  ), deps);
  return { mock, deps, post, cancel, callback };
}

describe('Plus stop evidence and delayed charges with #281', () => {
  it('preserves the paid month of a pre-stop renewal delivered after cancellation', async () => {
    const { mock, cancel, callback } = await setup();
    expect((await cancel()).status).toBe(200);
    expect(mock.rpcCalls('confirm_plus_ecpay_customer_cancel')).toHaveLength(1);
    // Provider stopping is not an early, irreversible membership access cutoff.
    expect(mock.rpcCalls('record_plus_membership_event')).toHaveLength(0);
    expect((await callback('2027/02/28 23:59:59')).status).toBe(200);
    expect(mock.rpcCalls('record_plus_membership_event')[0].args[0]).toMatchObject({
      p_event_type: 'membership_renewed', p_period_start: '2027-02-28T15:59:59.000Z',
      p_period_end: '2027-04-01T16:00:00.000Z',
    });
    expect(mock.rpcCalls('set_plus_ecpay_receipt_result')[0].args[0]).toMatchObject({ p_result: 'applied' });
  });

  it('does not grant a charge made after the confirmed stop', async () => {
    const { mock, deps, cancel, callback } = await setup();
    await cancel();
    expect((await callback('2027/03/01 08:00:01')).status).toBe(200);
    expect(mock.rpcCalls('record_plus_membership_event')).toHaveLength(0);
    expect(mock.rpcCalls('set_plus_ecpay_receipt_result')[0].args[0]).toMatchObject({ p_result: 'not_mapped' });
    expect(deps.log.error).toHaveBeenCalled();
  });

  it('never reports success or queries charges when the stop receipt cannot be persisted', async () => {
    const { mock, post, cancel } = await setup();
    mock.setRoute('rpc:confirm_plus_ecpay_customer_cancel', { error: 'database unavailable' });
    expect((await cancel()).status).toBe(503);
    expect(post).toHaveBeenCalledTimes(1);
    expect(mock.rpcCalls('record_plus_membership_event')).toHaveLength(0);
  });

  it('reports a financial cutoff rather than promising the untrimmed paid period', async () => {
    const { mock, cancel } = await setup();
    mock.setRoute('plus_membership_stream_summary', { data: {
      period_end: '2027-04-01T16:00:00.000Z', access_period_end: '2027-02-28T00:00:00.000Z',
    } });
    expect(JSON.parse((await cancel()).body).accessUntil).toBe('2027-02-28T00:00:00.000Z');
  });
});
