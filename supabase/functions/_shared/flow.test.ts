import { describe, expect, it } from 'vitest';
import { applyVerifiedSuccess, confirmRefund, type PaymentRow, type RefundRow } from './flow.ts';
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

describe('payment flow atomic persistence', () => {
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
