/**
 * PayPal browser-return handler tests (§3.2 analog / §21 — NEVER grants).
 *
 * The browser is redirected back by PayPal after approval (query params `token`
 * = order id / `PayerID`). The handler only maps the order id → local order and
 * 303-redirects to the result page; it NEVER mutates Order / Payment /
 * Entitlement.
 */
import { describe, expect, it } from 'vitest';
import { createMockDb, testEnv, fakeLogger, handlerRequest } from '../_shared/testing.ts';
import { handlePaypalBrowserReturn } from './handler.ts';

const PAYMENT_ROW_PAYPAL = {
  id: 'pay-1',
  order_id: 'ord-1',
  provider: 'paypal',
  provider_merchant_ref: 'BJH202608160001',
  provider_checkout_ref: 'ORDER-1',
  provider_payment_ref: 'CAPTURE-1',
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

function setup(paymentsData: unknown = PAYMENT_ROW_PAYPAL) {
  const mock = createMockDb({ payments: { data: paymentsData } });
  return {
    mock,
    deps: {
      env: testEnv(),
      db: mock.db,
      log: fakeLogger(),
    },
  };
}

describe('paypal-browser-return handler', () => {
  it('maps the PayPal order token to the local order and 303s to the result page', async () => {
    const { mock, deps } = setup();
    const result = await handlePaypalBrowserReturn(
      handlerRequest(
        'GET',
        'https://test.supabase.co/functions/v1/paypal-browser-return?token=ORDER-1&PayerID=P1',
      ),
      deps,
    );
    expect(result.status).toBe(303);
    expect(result.headers?.Location).toBe('/purchase/result?order=ord-1');
    expect(mock.callsFor('payments', 'eq')).toContainEqual({
      table: 'payments',
      method: 'eq',
      args: ['provider_checkout_ref', 'ORDER-1'],
    });
    // Browser return must NEVER mutate payment/order/entitlement state.
    expect(mock.callsFor('payments', 'update').length).toBe(0);
    expect(mock.callsFor('orders', 'update').length).toBe(0);
    expect(mock.rpcCalls('grant_entitlement').length).toBe(0);
  });

  it('unknown token → still redirects to the result page without an order param', async () => {
    const { mock, deps } = setup(null);
    const result = await handlePaypalBrowserReturn(
      handlerRequest('GET', 'https://test.supabase.co/functions/v1/paypal-browser-return?token=UNKNOWN'),
      deps,
    );
    expect(result.status).toBe(303);
    expect(result.headers?.Location).toBe('/purchase/result');
    expect(mock.rpcCalls('grant_entitlement').length).toBe(0);
  });

  it('no token → redirects to the result page without an order param', async () => {
    const { deps } = setup();
    const result = await handlePaypalBrowserReturn(
      handlerRequest('GET', 'https://test.supabase.co/functions/v1/paypal-browser-return'),
      deps,
    );
    expect(result.status).toBe(303);
    expect(result.headers?.Location).toBe('/purchase/result');
  });

  it('method not GET/POST → 405', async () => {
    const { deps } = setup();
    const result = await handlePaypalBrowserReturn(
      handlerRequest('DELETE', 'https://test.supabase.co/functions/v1/paypal-browser-return'),
      deps,
    );
    expect(result.status).toBe(405);
  });
});
