/**
 * OrderReceipt — the tax-inclusive display comes ONLY from the immutable
 * `OrderStatusResponse.compliance` snapshot (never client DEFAULT_TAX_CONFIG,
 * never currency inference). A JP consumer with a `taxable` snapshot is labeled
 * 税込 regardless of currency; a JP `exempt`/`unresolved` snapshot never claims
 * tax; a TW consumer never receives JP tax treatment. A later platform tax-config
 * change cannot rewrite a historical order's snapshot.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JapanConsumptionTaxStatus, Jurisdiction, OrderStatusResponse } from '../lib/payments/contract';
import { isJapanTaxInclusive, OrderReceipt } from './OrderReceipt';
import { sellerDisclosureFor } from '../legal-content';
import { setLocalePreference } from '../i18n/strings';

const sellerDisclosureState = vi.hoisted(() => ({ pending: true }));

// Exercise dormant legal/UI locales here without changing the app's V1 locale gate.
vi.mock('../i18n/locales', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../i18n/locales')>();
  return { ...actual, LAUNCHED_LOCALES: actual.SUPPORTED_LOCALES };
});

vi.mock('../legal-content', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../legal-content')>();
  const confirmedSeller = {
    name: 'Example Seller LLC',
    address: '1 Example Street',
    phone: '+1-555-0100',
    responsiblePerson: 'Example Person',
    supportEmail: 'support@example.com',
    pending: false,
  };
  return {
    ...actual,
    sellerDisclosureFor: (locale: Parameters<typeof actual.sellerDisclosureFor>[0]) =>
      actual.sellerDisclosureFor(locale, sellerDisclosureState.pending ? undefined : confirmedSeller),
  };
});

afterEach(() => {
  sellerDisclosureState.pending = true;
  setLocalePreference(null);
});

function order(
  overrides: {
    jurisdiction?: Jurisdiction;
    japanConsumptionTaxStatus?: JapanConsumptionTaxStatus;
    currency?: string;
    amountMinor?: number;
    status?: OrderStatusResponse['status'];
    paymentStatus?: OrderStatusResponse['paymentStatus'];
    deliveryStatus?: OrderStatusResponse['deliveryStatus'];
  } = {},
): OrderStatusResponse {
  return {
    orderId: 'order-1',
    status: overrides.status ?? 'paid',
    paymentStatus: overrides.paymentStatus ?? 'succeeded',
    bookId: 'book-sample-bj-keigo',
    itemName: '敬語エッセンシャル',
    amount: { amount: overrides.amountMinor ?? 880, currency: overrides.currency ?? 'JPY' },
    paidAt: '2026-08-20T08:00:00Z',
    paymentProvider: 'paypal',
    paymentMethod: 'credit',
    deliveryMethod: 'library',
    deliveryStatus: overrides.deliveryStatus ?? 'available',
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

  it('renders immutable sold-title, payment, delivery, policy, and support facts', () => {
    render(<OrderReceipt order={order()} />);
    expect(screen.getByTestId('receipt-item-name')).toHaveTextContent('敬語エッセンシャル');
    expect(screen.getByText('PayPal')).toBeInTheDocument();
    expect(screen.queryByText(/PayPal \/ credit/i)).not.toBeInTheDocument();
    expect(screen.getByText('決済確認後、ライブラリへ即時配信')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返品・返金ポリシー' })).toHaveAttribute(
      'href',
      '/legal/refunds',
    );
    expect(screen.getByText(sellerDisclosureFor('ja').supportEmail)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: sellerDisclosureFor('ja').supportEmail })).not.toBeInTheDocument();
  });

  it.each([
    ['en', 'Support email pending confirmation'],
    ['zh-TW', '準備中，確定後公布'],
    ['zh-CN', '準備中，確定後公布'],
  ] as const)('shows pending support text in the %s legal locale without a mail link', (locale, text) => {
    setLocalePreference(locale);
    render(<OrderReceipt order={order()} />);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: text })).not.toBeInTheDocument();
  });

  it('links the confirmed support email when seller details are no longer pending', () => {
    sellerDisclosureState.pending = false;
    render(<OrderReceipt order={order()} />);
    expect(screen.getByRole('link', { name: 'support@example.com' })).toHaveAttribute(
      'href',
      'mailto:support@example.com',
    );
  });

  it('renders refunded and revoked delivery instead of completed access', () => {
    render(
      <OrderReceipt
        order={order({ status: 'refunded', paymentStatus: 'refunded', deliveryStatus: 'revoked' })}
      />,
    );
    expect(screen.getByText('アクセス終了')).toBeInTheDocument();
    expect(screen.getByText('返金済み')).toBeInTheDocument();
    expect(screen.queryByText('決済確認後、ライブラリへ即時配信')).not.toBeInTheDocument();
    expect(screen.queryByText('完了')).not.toBeInTheDocument();
  });

  it.each(['pending', 'cancelled'] as const)('does not render a fulfilled receipt for a %s order', (status) => {
    const { container } = render(
      <OrderReceipt
        order={order({ status, paymentStatus: status === 'pending' ? 'pending' : 'failed', deliveryStatus: 'pending' })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
