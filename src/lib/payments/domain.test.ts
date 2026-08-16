import { describe, expect, it } from 'vitest';
import { applyConfirmedRefund, isVerifiedSuccessSnapshot, shouldGrantEntitlement } from './domain';
import type { Order, PaymentAttempt, ProviderPaymentSnapshot, Refund } from './contract';

function order(status: Order['status']): Order {
  return {
    id: 'o-1',
    userId: 'u-1',
    bookId: 'book-abc',
    itemNameSnapshot: 'Book',
    publishedRevision: 'book-abc@r1',
    amount: { amount: 79000, currency: 'TWD' },
    status,
    createdAt: '2026-01-01T00:00:00.000Z',
    paidAt: status === 'paid' || status === 'refunded' ? '2026-01-01T00:01:00.000Z' : null,
    refundedAt: status === 'refunded' ? '2026-01-02T00:00:00.000Z' : null,
  };
}

function payment(status: PaymentAttempt['status']): PaymentAttempt {
  return {
    id: 'p-1',
    orderId: 'o-1',
    provider: 'ecpay',
    providerMerchantRef: 'BJH001',
    providerPaymentRef: null,
    amount: { amount: 79000, currency: 'TWD' },
    method: 'credit',
    status,
    providerStatusCode: null,
    providerStatusMessage: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    paidAt: status === 'succeeded' || status === 'duplicate_success' || status === 'refunded' ? '2026-01-01T00:01:00.000Z' : null,
    lastVerifiedAt: null,
    providerFeeAmount: null,
    reconciliationStatus: null,
  };
}

function refund(status: Refund['status']): Refund {
  return {
    id: 'r-1',
    paymentId: 'p-1',
    provider: 'ecpay',
    providerRefundRef: 'REFUND-1',
    amount: { amount: 79000, currency: 'TWD' },
    status,
    reasonCode: 'refund',
    requestedBy: 'operator-1',
    providerStatusCode: null,
    requestedAt: '2026-01-02T00:00:00.000Z',
    completedAt: status === 'succeeded' ? '2026-01-02T01:00:00.000Z' : null,
  };
}

describe('shouldGrantEntitlement — §13', () => {
  it('grants only the first qualifying successful payment of a pending order', () => {
    expect(shouldGrantEntitlement(order('pending'), payment('succeeded'))).toBe(true);
  });

  it('never grants a second entitlement when the order is already paid', () => {
    expect(shouldGrantEntitlement(order('paid'), payment('succeeded'))).toBe(false);
  });

  it('a duplicate_success payment never grants', () => {
    expect(shouldGrantEntitlement(order('pending'), payment('duplicate_success'))).toBe(false);
    expect(shouldGrantEntitlement(order('paid'), payment('duplicate_success'))).toBe(false);
  });

  it('a failed / pending / refunded payment never grants', () => {
    expect(shouldGrantEntitlement(order('pending'), payment('failed'))).toBe(false);
    expect(shouldGrantEntitlement(order('pending'), payment('pending'))).toBe(false);
    expect(shouldGrantEntitlement(order('pending'), payment('refunded'))).toBe(false);
  });

  it('a refunded or cancelled order never grants (re-purchase is a new order)', () => {
    expect(shouldGrantEntitlement(order('refunded'), payment('succeeded'))).toBe(false);
    expect(shouldGrantEntitlement(order('cancelled'), payment('succeeded'))).toBe(false);
  });
});

describe('applyConfirmedRefund — §7 primary vs duplicate', () => {
  it('primary payment refund → revoke entitlement and refund the order', () => {
    expect(applyConfirmedRefund(refund('succeeded'), true)).toEqual({
      kind: 'revoke_entitlement',
      orderStatus: 'refunded',
      entitlementRevocationReason: 'refund',
    });
  });

  it('duplicate_success payment refund → keep order paid and entitlement active', () => {
    expect(applyConfirmedRefund(refund('succeeded'), false)).toEqual({
      kind: 'keep_entitlement',
      orderStatus: 'paid',
    });
  });

  it('a not-yet-confirmed refund never revokes entitlement', () => {
    expect(applyConfirmedRefund(refund('requested'), true)).toEqual({ kind: 'noop', reason: 'refund_not_confirmed' });
    expect(applyConfirmedRefund(refund('processing'), true)).toEqual({ kind: 'noop', reason: 'refund_not_confirmed' });
    expect(applyConfirmedRefund(refund('failed'), true)).toEqual({ kind: 'noop', reason: 'refund_not_confirmed' });
  });
});

describe('isVerifiedSuccessSnapshot — §4.4 generic gate', () => {
  const snapshot = (overrides: Partial<ProviderPaymentSnapshot>): ProviderPaymentSnapshot => ({
    provider: 'ecpay',
    merchantReference: 'BJH001',
    providerPaymentReference: 'TRADE-1',
    status: 'succeeded',
    amount: { amount: 79000, currency: 'TWD' },
    ...overrides,
  });

  it('accepts a succeeded snapshot with matching amount and currency', () => {
    expect(isVerifiedSuccessSnapshot(snapshot({}), 79000, 'TWD')).toBe(true);
  });

  it('rejects a wrong amount (no entitlement)', () => {
    expect(isVerifiedSuccessSnapshot(snapshot({}), 79001, 'TWD')).toBe(false);
    expect(isVerifiedSuccessSnapshot(snapshot({ amount: { amount: 79001, currency: 'TWD' } }), 79000, 'TWD')).toBe(false);
  });

  it('rejects a wrong currency', () => {
    expect(isVerifiedSuccessSnapshot(snapshot({}), 79000, 'JPY')).toBe(false);
    expect(isVerifiedSuccessSnapshot(snapshot({ amount: { amount: 79000, currency: 'JPY' } }), 79000, 'TWD')).toBe(false);
  });

  it('rejects any non-succeeded status', () => {
    expect(isVerifiedSuccessSnapshot(snapshot({ status: 'pending' }), 79000, 'TWD')).toBe(false);
    expect(isVerifiedSuccessSnapshot(snapshot({ status: 'failed' }), 79000, 'TWD')).toBe(false);
    expect(isVerifiedSuccessSnapshot(snapshot({ status: 'refunded' }), 79000, 'TWD')).toBe(false);
    expect(isVerifiedSuccessSnapshot(snapshot({ status: 'unknown' }), 79000, 'TWD')).toBe(false);
  });
});
