/**
 * Order-status handler tests (decision-record §3.4 — opaque id is NOT
 * authorization; ownership is `order.user_id === auth.uid()`).
 */
import { describe, expect, it } from 'vitest';
import {
  createMockDb,
  fakeLogger,
  handlerRequest,
  bearerHeaders,
  ORDER_ROW,
  PAYMENT_ROW,
} from '../_shared/testing.ts';
import { handleOrderStatus } from './handler.ts';

function setup(overrides: Record<string, unknown> = {}) {
  const mock = createMockDb({
    'auth:getUser': { data: { id: 'user-1' } },
    orders: { data: ORDER_ROW },
    payments: { data: { ...PAYMENT_ROW, status: 'pending' } },
    ...overrides,
  });
  return { mock, deps: { db: mock.db, log: fakeLogger() } };
}

describe('orders-status handler', () => {
  it('owner sees the order status (opaque id is not enough on its own)', async () => {
    const { deps } = setup();
    const result = await handleOrderStatus(
      handlerRequest('GET', 'https://test.supabase.co/functions/v1/orders-status/ord-1/status', '', bearerHeaders('jwt-1')),
      deps,
    );
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      orderId: 'ord-1',
      status: 'pending',
      paymentStatus: 'pending',
      bookId: 'book-a',
      amount: { amount: 79000, currency: 'TWD' },
      compliance: { jurisdiction: 'TW', japanConsumptionTaxStatus: 'unresolved' },
    });
  });

  it('exposes the immutable compliance snapshot a JP order needs for the receipt', async () => {
    const { deps } = setup({
      orders: {
        data: {
          ...ORDER_ROW,
          jurisdiction: 'JP',
          japan_tax_status_snapshot: 'taxable',
        },
      },
    });
    const result = await handleOrderStatus(
      handlerRequest('GET', 'https://test.supabase.co/functions/v1/orders-status/ord-1/status', '', bearerHeaders('jwt-1')),
      deps,
    );
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({
      compliance: { jurisdiction: 'JP', japanConsumptionTaxStatus: 'taxable' },
    });
  });

  it('fails closed when the order snapshot columns are missing (unresolved)', async () => {
    const { deps } = setup({
      orders: {
        data: {
          ...ORDER_ROW,
          jurisdiction: null,
          japan_tax_status_snapshot: null,
        },
      },
    });
    const result = await handleOrderStatus(
      handlerRequest('GET', 'https://test.supabase.co/functions/v1/orders-status/ord-1/status', '', bearerHeaders('jwt-1')),
      deps,
    );
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({
      compliance: { jurisdiction: 'unresolved', japanConsumptionTaxStatus: 'unresolved' },
    });
  });

  it("another user's order → 403 (ownership check, not the id)", async () => {
    const { deps } = setup({ orders: { data: { ...ORDER_ROW, user_id: 'someone-else' } } });
    const result = await handleOrderStatus(
      handlerRequest('GET', 'https://test.supabase.co/functions/v1/orders-status/ord-1/status', '', bearerHeaders('jwt-1')),
      deps,
    );
    expect(result.status).toBe(403);
  });

  it('unauthenticated → 401', async () => {
    const { deps } = setup();
    const result = await handleOrderStatus(
      handlerRequest('GET', 'https://test.supabase.co/functions/v1/orders-status/ord-1/status'),
      deps,
    );
    expect(result.status).toBe(401);
  });

  it('method not GET → 405', async () => {
    const { deps } = setup();
    const result = await handleOrderStatus(
      handlerRequest('POST', 'https://test.supabase.co/functions/v1/orders-status/ord-1/status'),
      deps,
    );
    expect(result.status).toBe(405);
  });

  it('no payment yet → paymentStatus null', async () => {
    const { deps } = setup({ payments: { data: null } });
    const result = await handleOrderStatus(
      handlerRequest('GET', 'https://test.supabase.co/functions/v1/orders-status/ord-1/status', '', bearerHeaders('jwt-1')),
      deps,
    );
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({ paymentStatus: null });
  });
});
