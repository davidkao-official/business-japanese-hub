/**
 * OrderReceipt — order confirmation + receipt rendered from the local
 * authoritative order status (decision-record §3.2: only the server response
 * drives the UI; browser-return query params are never payment evidence).
 *
 * The amount shown is the SERVER-authoritative `OrderStatusResponse.amount`
 * (canonical Money) — never a client-supplied price. For JPY, the Japan
 * tax-status display rule (legal-tax-launch-brief §5) is applied via the
 * tax-config helpers: an unresolved/exempt status shows the base amount with no
 * tax claim; an explicitly resolved taxable status labels the total 税込 (the
 * server amount already reflects the authoritative total).
 */
import { useStrings } from '../i18n/strings';
import { listBooks } from '../reader/catalog';
import type { OrderStatusResponse, TaxConfig } from '../lib/payments/contract';
import { DEFAULT_TAX_CONFIG } from '../lib/payments/contract';
import { isJapanTaxResolved, japanTaxRateFor } from '../lib/payments/tax-config';

/** Canonical Money → localized display (JPY is zero-decimal; others minor/100). */
export function formatOrderAmount(money: OrderStatusResponse['amount']): string {
  if (money.currency === 'JPY') {
    return `¥${money.amount.toLocaleString('en-US')}`;
  }
  const major = (money.amount / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${money.currency} ${major}`;
}

/**
 * True only when the order is JPY and the tax status is explicitly resolved
 * `taxable` — the only case where we may label the total as tax-inclusive.
 * Unresolved/exempt never claims tax (fail-closed).
 */
export function isJapanTaxInclusive(
  order: OrderStatusResponse,
  taxConfig: TaxConfig,
): boolean {
  return (
    order.amount.currency === 'JPY' &&
    isJapanTaxResolved(taxConfig.japanConsumptionTaxStatus) &&
    japanTaxRateFor(taxConfig.japanConsumptionTaxStatus) > 0
  );
}

/** Resolve the book title from the client catalog by bookId (falls back to id). */
export function bookTitleFor(bookId: string): string | undefined {
  return listBooks().find((book) => book.id === bookId)?.title;
}

export function OrderReceipt({ order }: { order: OrderStatusResponse }) {
  const strings = useStrings();
  const title = bookTitleFor(order.bookId) ?? order.bookId;
  return (
    <section className="receipt" aria-labelledby="receipt-title">
      <h2 id="receipt-title" className="receipt__title">
        {strings.purchaseResult.receiptLabel}
      </h2>
      <dl className="receipt__rows">
        <div className="receipt__row">
          <dt>{strings.purchaseResult.orderNumber}</dt>
          <dd data-testid="receipt-order-id">{order.orderId}</dd>
        </div>
        <div className="receipt__row">
          <dt>{strings.purchaseResult.bookTitleLabel}</dt>
          <dd>{title}</dd>
        </div>
        <div className="receipt__row">
          <dt>{strings.purchaseResult.amountLabel}</dt>
          <dd data-testid="receipt-amount">
            {formatOrderAmount(order.amount)}
            {isJapanTaxInclusive(order, DEFAULT_TAX_CONFIG) && (
              <span className="receipt__tax">{strings.purchaseResult.taxInclusive}</span>
            )}
          </dd>
        </div>
        <div className="receipt__row">
          <dt>{strings.purchaseResult.statusLabel}</dt>
          <dd>{strings.purchaseResult.statusSucceeded}</dd>
        </div>
      </dl>
    </section>
  );
}
