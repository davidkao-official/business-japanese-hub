import { describe, expect, it } from 'vitest';
import { nextOrderStatus, nextPaymentStatus, IllegalStateTransitionError } from './state';
import type { PaymentDomainEvent } from './state';

const ev = (type: PaymentDomainEvent['type']): PaymentDomainEvent => ({
  type,
  merchantReference: 'REF-1',
});

describe('nextOrderStatus — §11.3', () => {
  it('pending → paid on payment_verified', () => {
    expect(nextOrderStatus('pending', ev('payment_verified'))).toBe('paid');
  });

  it('pending → cancelled on payment_cancelled', () => {
    expect(nextOrderStatus('pending', ev('payment_cancelled'))).toBe('cancelled');
  });

  it('paid → refunded on refund_confirmed', () => {
    expect(nextOrderStatus('paid', ev('refund_confirmed'))).toBe('refunded');
  });

  it('pending stays pending on payment_failed (retryable)', () => {
    expect(nextOrderStatus('pending', ev('payment_failed'))).toBe('pending');
  });

  it('a paid order never downgrades on a late failed callback', () => {
    expect(nextOrderStatus('paid', ev('payment_failed'))).toBe('paid');
  });

  it('a paid order stays paid on a duplicate verified success', () => {
    expect(nextOrderStatus('paid', ev('payment_verified'))).toBe('paid');
    expect(nextOrderStatus('paid', ev('duplicate_success_detected'))).toBe('paid');
  });

  it('refunded is terminal (no-change for any event)', () => {
    expect(nextOrderStatus('refunded', ev('payment_verified'))).toBe('refunded');
    expect(nextOrderStatus('refunded', ev('refund_confirmed'))).toBe('refunded');
    expect(nextOrderStatus('refunded', ev('payment_failed'))).toBe('refunded');
  });

  it('cancelled is terminal for lifecycle events', () => {
    expect(nextOrderStatus('cancelled', ev('payment_failed'))).toBe('cancelled');
    expect(nextOrderStatus('cancelled', ev('payment_cancelled'))).toBe('cancelled');
  });

  it('throws on refund_confirmed for a pending (unpaid) order', () => {
    expect(() => nextOrderStatus('pending', ev('refund_confirmed'))).toThrow(IllegalStateTransitionError);
  });

  it('throws on a verified payment on a cancelled order (anomaly)', () => {
    expect(() => nextOrderStatus('cancelled', ev('payment_verified'))).toThrow(IllegalStateTransitionError);
  });
});

describe('nextPaymentStatus — §11.3 + §13', () => {
  it('created → pending → verification_pending → succeeded', () => {
    expect(nextPaymentStatus('created', ev('payment_initiated'))).toBe('pending');
    expect(nextPaymentStatus('pending', ev('verification_pending'))).toBe('verification_pending');
    expect(nextPaymentStatus('verification_pending', ev('payment_verified'))).toBe('succeeded');
  });

  it('created → pending → failed (terminal)', () => {
    expect(nextPaymentStatus('created', ev('payment_initiated'))).toBe('pending');
    expect(nextPaymentStatus('pending', ev('payment_failed'))).toBe('failed');
  });

  it('pending → succeeded on payment_verified', () => {
    expect(nextPaymentStatus('pending', ev('payment_verified'))).toBe('succeeded');
  });

  it('succeeded → refunded on refund_confirmed', () => {
    expect(nextPaymentStatus('succeeded', ev('refund_confirmed'))).toBe('refunded');
  });

  it('succeeded → duplicate_success on duplicate_success_detected (double charge)', () => {
    expect(nextPaymentStatus('succeeded', ev('duplicate_success_detected'))).toBe('duplicate_success');
  });

  it('a succeeded payment is never downgraded by a late failed callback', () => {
    expect(nextPaymentStatus('succeeded', ev('payment_failed'))).toBe('succeeded');
  });

  it('a succeeded payment stays succeeded on a duplicate verified callback (idempotent)', () => {
    expect(nextPaymentStatus('succeeded', ev('payment_verified'))).toBe('succeeded');
  });

  it('failed is terminal: a late verified callback does not resurrect it', () => {
    expect(nextPaymentStatus('failed', ev('payment_verified'))).toBe('failed');
    expect(nextPaymentStatus('failed', ev('payment_failed'))).toBe('failed');
    expect(nextPaymentStatus('failed', ev('payment_initiated'))).toBe('failed');
  });

  it('duplicate_success → refunded on refund_confirmed, terminal otherwise', () => {
    expect(nextPaymentStatus('duplicate_success', ev('refund_confirmed'))).toBe('refunded');
    expect(nextPaymentStatus('duplicate_success', ev('payment_failed'))).toBe('duplicate_success');
  });

  it('refunded is terminal (no-change for any event)', () => {
    expect(nextPaymentStatus('refunded', ev('payment_verified'))).toBe('refunded');
    expect(nextPaymentStatus('refunded', ev('refund_confirmed'))).toBe('refunded');
  });

  it('throws on refund_confirmed before a success-bearing state', () => {
    expect(() => nextPaymentStatus('pending', ev('refund_confirmed'))).toThrow(IllegalStateTransitionError);
    expect(() => nextPaymentStatus('created', ev('refund_confirmed'))).toThrow(IllegalStateTransitionError);
    expect(() => nextPaymentStatus('verification_pending', ev('refund_confirmed'))).toThrow(IllegalStateTransitionError);
    expect(() => nextPaymentStatus('failed', ev('refund_confirmed'))).toThrow(IllegalStateTransitionError);
  });

  it('throws on duplicate_success_detected before succeeded (order not yet paid)', () => {
    expect(() => nextPaymentStatus('created', ev('duplicate_success_detected'))).toThrow(IllegalStateTransitionError);
    expect(() => nextPaymentStatus('pending', ev('duplicate_success_detected'))).toThrow(IllegalStateTransitionError);
  });
});

describe('§19 matrix cases expressible at the pure level', () => {
  it('double charge: second attempt becomes duplicate_success while order stays paid', () => {
    // First attempt succeeds → order paid.
    expect(nextPaymentStatus('pending', ev('payment_verified'))).toBe('succeeded');
    expect(nextOrderStatus('pending', ev('payment_verified'))).toBe('paid');
    // Second real charge succeeds against an already-paid order.
    expect(nextPaymentStatus('succeeded', ev('duplicate_success_detected'))).toBe('duplicate_success');
    expect(nextOrderStatus('paid', ev('payment_verified'))).toBe('paid');
  });

  it('duplicate callback: repeated verified callback is a no-op', () => {
    expect(nextPaymentStatus('succeeded', ev('payment_verified'))).toBe('succeeded');
    expect(nextOrderStatus('paid', ev('payment_verified'))).toBe('paid');
  });

  it('late failed callback does not downgrade a succeeded payment / paid order', () => {
    expect(nextPaymentStatus('succeeded', ev('payment_failed'))).toBe('succeeded');
    expect(nextOrderStatus('paid', ev('payment_failed'))).toBe('paid');
  });
});
