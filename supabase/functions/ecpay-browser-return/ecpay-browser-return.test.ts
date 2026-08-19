/**
 * ECPay browser-return handler tests (decision-record §3.2 — navigation only,
 * NEVER mutates Order/Payment/Entitlement).
 */
import { describe, expect, it } from 'vitest';
import {
  createMockDb,
  testEnv,
  fakeLogger,
  handlerRequest,
  PAYMENT_ROW,
} from '../_shared/testing.ts';
import { handleBrowserReturn } from './handler.ts';

function setup(overrides: Record<string, unknown> = {}) {
  const mock = createMockDb({
    payments: { data: { ...PAYMENT_ROW, order_id: 'ord-1' } },
    ...overrides,
  });
  return { mock, deps: { env: testEnv(), db: mock.db, log: fakeLogger() } };
}

function browserForm(overrides: Record<string, string> = {}) {
  return new URLSearchParams({
    MerchantID: '2000132',
    MerchantTradeNo: 'BJH123456789',
    RtnCode: '1',
    CheckMacValue: 'MOCK-MAC',
    ...overrides,
  }).toString();
}

describe('ecpay-browser-return handler', () => {
  it('fails closed when ECPay is not configured', async () => {
    const { mock, deps } = setup();
    const result = await handleBrowserReturn(
      handlerRequest('POST', 'https://test.supabase.co/functions/v1/ecpay-browser-return', browserForm()),
      { ...deps, env: testEnv({ ecpayMerchantId: undefined, ecpayHashKey: undefined, ecpayHashIV: undefined }) },
    );
    expect(result.status).toBe(503);
    expect(JSON.parse(result.body)).toMatchObject({ reason: 'provider_configuration_unavailable' });
    expect(mock.callsFor('payments', 'select')).toHaveLength(0);
  });

  it('maps MerchantTradeNo → local order and 303-redirects to the result page', async () => {
    const { deps } = setup();
    const result = await handleBrowserReturn(
      handlerRequest('POST', 'https://test.supabase.co/functions/v1/ecpay-browser-return', browserForm()),
      deps,
    );
    expect(result.status).toBe(303);
    expect(result.headers?.Location).toBe('/purchase/result?order=ord-1');
  });

  it('never mutates Order / Payment / Entitlement', async () => {
    const { mock, deps } = setup();
    await handleBrowserReturn(
      handlerRequest('POST', 'https://test.supabase.co/functions/v1/ecpay-browser-return', browserForm()),
      deps,
    );
    expect(mock.callsFor('payments', 'insert').length).toBe(0);
    expect(mock.callsFor('payments', 'update').length).toBe(0);
    expect(mock.callsFor('orders', 'insert').length).toBe(0);
    expect(mock.callsFor('orders', 'update').length).toBe(0);
    expect(mock.rpcCalls('grant_entitlement').length).toBe(0);
  });

  it('unknown MerchantTradeNo → still redirects (no order param, no failure)', async () => {
    const { deps } = setup({ payments: { data: null } });
    const result = await handleBrowserReturn(
      handlerRequest('POST', 'https://test.supabase.co/functions/v1/ecpay-browser-return', browserForm()),
      deps,
    );
    expect(result.status).toBe(303);
    expect(result.headers?.Location).toBe('/purchase/result');
  });

  it('a forged CheckMac does not fail the redirect (diagnostics only)', async () => {
    const { deps } = setup();
    const result = await handleBrowserReturn(
      handlerRequest('POST', 'https://test.supabase.co/functions/v1/ecpay-browser-return', browserForm({ CheckMacValue: 'FORGED' })),
      deps,
    );
    expect(result.status).toBe(303);
    expect(result.headers?.Location).toBe('/purchase/result?order=ord-1');
  });

  it('method not POST → 405', async () => {
    const { deps } = setup();
    const result = await handleBrowserReturn(
      handlerRequest('GET', 'https://test.supabase.co/functions/v1/ecpay-browser-return', browserForm()),
      deps,
    );
    expect(result.status).toBe(405);
  });
});
