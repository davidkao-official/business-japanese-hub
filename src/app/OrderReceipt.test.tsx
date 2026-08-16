/**
 * OrderReceipt — tax-inclusive display is fail-closed: with the default
 * unresolved Japan tax status, a JPY order never claims a tax-inclusive price.
 * Only an explicitly resolved `taxable` status may label the total 税込
 * (legal-tax-launch-brief §5; the server amount is the authoritative total).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { OrderStatusResponse } from '../lib/payments/contract';
import { isJapanTaxInclusive, OrderReceipt } from './OrderReceipt';

function jpyOrder(amountMinor = 880): OrderStatusResponse {
  return {
    orderId: 'order-1',
    status: 'paid',
    paymentStatus: 'succeeded',
    bookId: 'book-sample-bj-keigo',
    amount: { amount: amountMinor, currency: 'JPY' },
  };
}

describe('isJapanTaxInclusive — fail-closed Japan tax display', () => {
  it('is false for a JPY order when the tax status is unresolved (the default)', () => {
    expect(
      isJapanTaxInclusive(jpyOrder(), { japanConsumptionTaxStatus: 'unresolved' }),
    ).toBe(false);
  });

  it('is false for a JPY order when the tax status is exempt (never claims tax-inclusive)', () => {
    expect(isJapanTaxInclusive(jpyOrder(), { japanConsumptionTaxStatus: 'exempt' })).toBe(false);
  });

  it('is true only for a JPY order with an explicitly resolved taxable status', () => {
    expect(isJapanTaxInclusive(jpyOrder(), { japanConsumptionTaxStatus: 'taxable' })).toBe(true);
  });

  it('is false for a non-JPY order even when taxable', () => {
    const twdOrder: OrderStatusResponse = {
      ...jpyOrder(),
      amount: { amount: 79000, currency: 'TWD' },
    };
    expect(isJapanTaxInclusive(twdOrder, { japanConsumptionTaxStatus: 'taxable' })).toBe(false);
  });
});

describe('OrderReceipt — renders with the default unresolved tax status', () => {
  it('does not render a tax-inclusive label for a JPY order (fail-closed)', () => {
    render(<OrderReceipt order={jpyOrder()} />);
    expect(document.querySelector('.receipt__tax')).toBeNull();
    expect(screen.getByTestId('receipt-order-id')).toHaveTextContent('order-1');
    expect(screen.getByTestId('receipt-amount')).toHaveTextContent('¥880');
  });

  it('renders the server-authoritative amount in minor units', () => {
    render(<OrderReceipt order={{ ...jpyOrder(1580) }} />);
    expect(screen.getByTestId('receipt-amount')).toHaveTextContent('¥1,580');
  });
});
