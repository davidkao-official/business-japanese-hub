/**
 * OrderReceipt — the tax-inclusive display comes ONLY from the immutable
 * `OrderStatusResponse.compliance` snapshot (never client DEFAULT_TAX_CONFIG,
 * never currency inference). A JP consumer with a `taxable` snapshot is labeled
 * 税込 regardless of currency; a JP `exempt`/`unresolved` snapshot never claims
 * tax; a TW consumer never receives JP tax treatment. A later platform tax-config
 * change cannot rewrite a historical order's snapshot.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { JapanConsumptionTaxStatus, Jurisdiction, OrderStatusResponse } from '../lib/payments/contract';
import { isJapanTaxInclusive, OrderReceipt } from './OrderReceipt';

function order(
  overrides: {
    jurisdiction?: Jurisdiction;
    japanConsumptionTaxStatus?: JapanConsumptionTaxStatus;
    currency?: string;
    amountMinor?: number;
  } = {},
): OrderStatusResponse {
  return {
    orderId: 'order-1',
    status: 'paid',
    paymentStatus: 'succeeded',
    bookId: 'book-sample-bj-keigo',
    amount: { amount: overrides.amountMinor ?? 880, currency: overrides.currency ?? 'JPY' },
    compliance: {
      jurisdiction: overrides.jurisdiction ?? 'unresolved',
      japanConsumptionTaxStatus: overrides.japanConsumptionTaxStatus ?? 'unresolved',
    },
  };
}

describe('isJapanTaxInclusive — server snapshot only (no currency inference)', () => {
  it('is false for a JP order whose snapshot is unresolved (fail-closed)', () => {
    expect(isJapanTaxInclusive(order({ jurisdiction: 'JP', japanConsumptionTaxStatus: 'unresolved' }))).toBe(false);
  });

  it('is false for a JP order whose snapshot is exempt (never claims tax-inclusive)', () => {
    expect(isJapanTaxInclusive(order({ jurisdiction: 'JP', japanConsumptionTaxStatus: 'exempt' }))).toBe(false);
  });

  it('is true only for a JP consumer with an explicitly resolved taxable snapshot', () => {
    expect(isJapanTaxInclusive(order({ jurisdiction: 'JP', japanConsumptionTaxStatus: 'taxable' }))).toBe(true);
  });

  it('is true for a JP consumer paying TWD (currency never determines tax treatment)', () => {
    const twdJpOrder = order({ jurisdiction: 'JP', japanConsumptionTaxStatus: 'taxable', currency: 'TWD' });
    expect(isJapanTaxInclusive(twdJpOrder)).toBe(true);
  });

  it('is false for a TW consumer even with a taxable snapshot (TW never gets JP tax)', () => {
    const twOrder = order({ jurisdiction: 'TW', japanConsumptionTaxStatus: 'taxable', currency: 'JPY' });
    expect(isJapanTaxInclusive(twOrder)).toBe(false);
  });

  it('is false for an unresolved jurisdiction (defensive backfill) regardless of snapshot', () => {
    expect(isJapanTaxInclusive(order({ jurisdiction: 'unresolved', japanConsumptionTaxStatus: 'taxable' }))).toBe(false);
  });
});

describe('OrderReceipt — renders from the server snapshot', () => {
  it('labels 税込 for a JP taxable snapshot', () => {
    render(<OrderReceipt order={order({ jurisdiction: 'JP', japanConsumptionTaxStatus: 'taxable' })} />);
    expect(screen.getByTestId('receipt-amount')).toHaveTextContent('¥880');
    expect(screen.getByText('（税込）')).toBeInTheDocument();
  });

  it('labels 税込 for a JP taxable consumer paying TWD (JP treatment regardless of currency)', () => {
    render(
      <OrderReceipt
        order={order({ jurisdiction: 'JP', japanConsumptionTaxStatus: 'taxable', currency: 'TWD', amountMinor: 79000 })}
      />,
    );
    expect(screen.getByTestId('receipt-amount')).toHaveTextContent('TWD 790.00');
    expect(screen.getByText('（税込）')).toBeInTheDocument();
  });

  it('does not label tax for a JP exempt snapshot', () => {
    render(<OrderReceipt order={order({ jurisdiction: 'JP', japanConsumptionTaxStatus: 'exempt' })} />);
    expect(document.querySelector('.receipt__tax')).toBeNull();
    expect(screen.getByTestId('receipt-amount')).toHaveTextContent('¥880');
  });

  it('does not label tax for a JP unresolved snapshot (fail-closed)', () => {
    render(<OrderReceipt order={order({ jurisdiction: 'JP', japanConsumptionTaxStatus: 'unresolved' })} />);
    expect(document.querySelector('.receipt__tax')).toBeNull();
  });

  it('never labels tax for a TW consumer, even on a JPY order', () => {
    render(
      <OrderReceipt
        order={order({ jurisdiction: 'TW', japanConsumptionTaxStatus: 'taxable', currency: 'JPY', amountMinor: 1580 })}
      />,
    );
    expect(screen.getByTestId('receipt-amount')).toHaveTextContent('¥1,580');
    expect(document.querySelector('.receipt__tax')).toBeNull();
  });

  it('keeps historical semantics when the platform tax config changes later', () => {
    // Two JP orders bought at different times carry different frozen snapshots;
    // each receipt renders its OWN snapshot — the live config is never consulted.
    render(
      <>
        <OrderReceipt order={order({ jurisdiction: 'JP', japanConsumptionTaxStatus: 'taxable', amountMinor: 880 })} />
        <OrderReceipt order={order({ jurisdiction: 'JP', japanConsumptionTaxStatus: 'exempt', amountMinor: 800 })} />
      </>,
    );
    expect(screen.getAllByText('（税込）')).toHaveLength(1);
    expect(document.querySelectorAll('.receipt__tax')).toHaveLength(1);
  });

  it('renders the server-authoritative amount in minor units', () => {
    render(<OrderReceipt order={order({ jurisdiction: 'JP', japanConsumptionTaxStatus: 'exempt', amountMinor: 1580 })} />);
    expect(screen.getByTestId('receipt-amount')).toHaveTextContent('¥1,580');
  });
});
