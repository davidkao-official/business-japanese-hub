import { describe, expect, it } from 'vitest';
import {
  applyPaymentEvent,
  applyVerifiedSuccess,
  confirmRefund,
  paymentFromRow,
  type PaymentRow,
  type RefundRow,
} from './flow.ts';
import type { DbBuilder, DbClient } from './db.ts';
import { createMockDb, fakeLogger, ORDER_ROW, PAYMENT_ROW } from './testing.ts';

const SUCCESS_RESULT = {
  payment_status: 'succeeded',
  order_status: 'paid',
  granted: true,
};

const REFUND_RESULT = {
  refund_id: 'refund-1',
  refund_status: 'succeeded',
  payment_status: 'refunded',
  order_status: 'refunded',
  entitlement_revoked: true,
  already_confirmed: false,
};

const REFUND_ROW: RefundRow = {
  id: 'refund-1',
  payment_id: 'pay-1',
  provider: 'ecpay',
  provider_refund_ref: null,
  amount_minor: 79000,
  currency: 'TWD',
  status: 'requested',
  reason_code: 'customer_request',
  requested_by: 'admin-1',
  provider_status_code: null,
  requested_at: '2026-08-16T08:00:00Z',
  completed_at: null,
};

function createStatefulPaymentDb(initial: PaymentRow): {
  db: DbClient;
  current: () => PaymentRow;
} {
  let state = { ...initial };

  const db = {
    from(table: string) {
      if (table !== 'payments') throw new Error(`unexpected table ${table}`);
      let mode: 'select' | 'update' = 'select';
      let patch: Record<string, unknown> = {};
      const filters: Record<string, unknown> = {};

      const matches = () => Object.entries(filters).every(
        ([column, value]) => (state as unknown as Record<string, unknown>)[column] === value,
      );
      const executeSingle = () => {
        if (!matches()) return { data: null, error: null };
        if (mode === 'update') state = { ...state, ...patch } as PaymentRow;
        return { data: { ...state } as unknown as Record<string, unknown>, error: null };
      };

      const builder = {
        select: () => builder,
        eq: (column, value) => {
          filters[column] = value;
          return builder;
        },
        update: (partial) => {
          mode = 'update';
          patch = partial;
          return builder;
        },
        maybeSingle: async () => executeSingle(),
        then: (onfulfilled) => Promise.resolve({
          data: executeSingle().data ? [{ ...state } as unknown as Record<string, unknown>] : [],
          error: null,
        }).then(onfulfilled),
      } as unknown as DbBuilder;
      return builder;
    },
  } as unknown as DbClient;

  return { db, current: () => ({ ...state }) };
}

describe('payment flow atomic persistence', () => {
  it('maps PayPal as a provider payment method and rejects unknown persisted methods', () => {
    expect(paymentFromRow({ ...PAYMENT_ROW, provider: 'paypal', method: 'paypal' }).method).toBe(
      'paypal',
    );
    expect(() => paymentFromRow({ ...PAYMENT_ROW, method: 'wire-transfer' })).toThrow(
      'unsupported persisted payment method',
    );
  });

  it('finalizes verified success through one database transaction RPC', async () => {
    const mock = createMockDb({
      'rpc:finalize_payment_success': { data: SUCCESS_RESULT },
    });

    const result = await applyVerifiedSuccess({
      db: mock.db,
      log: fakeLogger(),
      now: () => new Date('2026-08-16T12:00:00Z'),
      paymentRow: PAYMENT_ROW,
      merchantReference: PAYMENT_ROW.provider_merchant_ref,
      providerPaymentReference: 'ECPAY-TRADE-1',
      paidAt: '2026-08-16T12:00:00Z',
      rawStatusCode: '1',
    });

    expect(result).toEqual({ paymentStatus: 'succeeded', orderStatus: 'paid', granted: true });
    expect(mock.rpcCalls('finalize_payment_success')).toHaveLength(1);
    expect(mock.rpcCalls('finalize_payment_success')[0].args[0]).toMatchObject({
      p_payment_id: 'pay-1',
      p_provider_payment_ref: 'ECPAY-TRADE-1',
      p_paid_at: '2026-08-16T12:00:00Z',
      p_provider_status_code: '1',
    });
    expect(mock.callsFor('payments', 'update')).toHaveLength(0);
    expect(mock.callsFor('orders', 'update')).toHaveLength(0);
    expect(mock.rpcCalls('grant_entitlement')).toHaveLength(0);
  });

  it('does not let a stale ambiguous callback overwrite a concurrently succeeded payment', async () => {
    const stalePayment = { ...PAYMENT_ROW, status: 'pending' } as PaymentRow;
    const stateful = createStatefulPaymentDb({
      ...stalePayment,
      status: 'succeeded',
      provider_payment_ref: 'CAPTURE-1',
      provider_status_code: 'COMPLETED',
      provider_status_message: 'payment confirmed',
      paid_at: '2026-08-16T12:00:00Z',
    });

    const result = await applyPaymentEvent(
      { db: stateful.db, log: fakeLogger(), now: () => new Date('2026-08-16T12:00:01Z') },
      stalePayment,
      { type: 'verification_pending', merchantReference: stalePayment.provider_merchant_ref },
    );

    expect(result).toBe('succeeded');
    expect(stateful.current()).toMatchObject({
      status: 'succeeded',
      provider_payment_ref: 'CAPTURE-1',
      provider_status_code: 'COMPLETED',
      provider_status_message: 'payment confirmed',
    });
  });

  it('preserves successful provider diagnostics when a late failure callback is a state no-op', async () => {
    const succeededPayment = {
      ...PAYMENT_ROW,
      status: 'succeeded',
      provider_payment_ref: 'CAPTURE-1',
      provider_status_code: 'COMPLETED',
      provider_status_message: 'payment confirmed',
      paid_at: '2026-08-16T12:00:00Z',
    } as PaymentRow;
    const stateful = createStatefulPaymentDb(succeededPayment);

    const result = await applyPaymentEvent(
      { db: stateful.db, log: fakeLogger(), now: () => new Date('2026-08-16T12:00:01Z') },
      succeededPayment,
      {
        type: 'payment_failed',
        merchantReference: succeededPayment.provider_merchant_ref,
        rawStatusCode: 'DENIED',
      },
    );

    expect(result).toBe('succeeded');
    expect(stateful.current()).toMatchObject({
      status: 'succeeded',
      provider_payment_ref: 'CAPTURE-1',
      provider_status_code: 'COMPLETED',
      provider_status_message: 'payment confirmed',
    });
  });

  it('finalizes a provider-confirmed refund through one database transaction RPC', async () => {
    const payment = { ...PAYMENT_ROW, status: 'succeeded' } as PaymentRow;
    const mock = createMockDb({
      refunds: { data: REFUND_ROW },
      payments: { data: payment },
      orders: { data: { ...ORDER_ROW, status: 'paid' } },
      'rpc:finalize_refund_success': { data: REFUND_RESULT },
    });

    const result = await confirmRefund(
      {
        db: mock.db,
        log: fakeLogger(),
        now: () => new Date('2026-08-16T12:00:00Z'),
      },
      'refund-1',
    );

    expect(result).toEqual({
      refundId: 'refund-1',
      refundStatus: 'succeeded',
      paymentStatus: 'refunded',
      orderStatus: 'refunded',
      entitlementRevoked: true,
      alreadyConfirmed: false,
    });
    expect(mock.rpcCalls('finalize_refund_success')).toHaveLength(1);
    expect(mock.callsFor('refunds', 'update')).toHaveLength(0);
    expect(mock.callsFor('payments', 'update')).toHaveLength(0);
    expect(mock.callsFor('orders', 'update')).toHaveLength(0);
    expect(mock.callsFor('book_entitlement', 'update')).toHaveLength(0);
  });
});
