/**
 * OrderReceipt — order confirmation + receipt rendered from the local
 * authoritative order status (decision-record §3.2: only the server response
 * drives the UI; browser-return query params are never payment evidence).
 *
 * The amount shown is the SERVER-authoritative `OrderStatusResponse.amount`
 * (canonical Money) — never a client-supplied price. The Japan tax-status
 * display (legal-tax-launch-brief §5) comes ONLY from the immutable
 * `OrderStatusResponse.compliance` snapshot frozen at purchase — never from the
 * client `DEFAULT_TAX_CONFIG` and never inferred from the currency/provider:
 * a JP consumer paying TWD still gets JP tax treatment; a TW consumer never
 * does. An unresolved/exempt snapshot shows the base amount with no tax claim;
 * a resolved `taxable` snapshot labels the total 税込 (the server amount already
 * reflects the authoritative total).
 */
import { useStrings } from '../i18n/strings';
import type { OrderStatusResponse } from '../lib/payments/contract';
import { isJapanTaxResolved, japanTaxRateFor } from '../lib/payments/tax-config';
import { SELLER_DISCLOSURE } from '../legal-content';

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
 * True only when the ORDER's immutable snapshot is a JP consumer whose Japan
 * tax status was explicitly resolved to `taxable` at purchase — the only case
 * where the total may be labeled tax-inclusive. Unresolved/exempt never claims
 * tax (fail-closed), and a TW consumer never receives JP tax treatment —
 * regardless of the currency (a JP consumer paying TWD still gets JP treatment).
 */
export function isJapanTaxInclusive(order: OrderStatusResponse): boolean {
  return (
    order.compliance.jurisdiction === 'JP' &&
    isJapanTaxResolved(order.compliance.japanConsumptionTaxStatus) &&
    japanTaxRateFor(order.compliance.japanConsumptionTaxStatus) > 0
  );
}

export function OrderReceipt({ order }: { order: OrderStatusResponse }) {
  const strings = useStrings();
  const isRefunded = order.status === 'refunded' || order.deliveryStatus === 'revoked';
  if (order.status !== 'paid' && !isRefunded) return null;
  const paymentMethod = order.paymentProvider?.toLowerCase() === 'paypal'
    ? 'PayPal'
    : [order.paymentProvider === 'ecpay' ? 'ECPay' : order.paymentProvider, order.paymentMethod]
        .filter(Boolean)
        .join(' / ');
  const refundPolicyUrl = `${import.meta.env.BASE_URL}legal/refunds`;
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
          <dd data-testid="receipt-item-name">{order.itemName}</dd>
        </div>
        <div className="receipt__row">
          <dt>{strings.purchaseResult.amountLabel}</dt>
          <dd data-testid="receipt-amount">
            {formatOrderAmount(order.amount)}
            {isJapanTaxInclusive(order) && (
              <span className="receipt__tax">{strings.purchaseResult.taxInclusive}</span>
            )}
          </dd>
        </div>
        <div className="receipt__row">
          <dt>{strings.purchaseResult.paymentMethodLabel}</dt>
          <dd>{paymentMethod || strings.purchaseResult.notAvailable}</dd>
        </div>
        <div className="receipt__row">
          <dt>{strings.purchaseResult.deliveryMethodLabel}</dt>
          <dd>
            {isRefunded
              ? strings.purchaseResult.deliveryRevoked
              : strings.purchaseResult.deliveryLibrary}
          </dd>
        </div>
        <div className="receipt__row">
          <dt>{strings.purchaseResult.statusLabel}</dt>
          <dd>
            {isRefunded
              ? strings.purchaseResult.statusRefunded
              : strings.purchaseResult.statusSucceeded}
          </dd>
        </div>
      </dl>
      <div className="receipt__aftercare">
        <p>
          <strong>{strings.purchaseResult.refundPolicyLabel}</strong>{' '}
          {strings.purchaseResult.refundPolicySummary}{' '}
          <a href={refundPolicyUrl}>{strings.purchaseResult.refundPolicyLink}</a>
        </p>
        <p>
          <strong>{strings.purchaseResult.supportLabel}</strong>{' '}
          <a href={`mailto:${SELLER_DISCLOSURE.supportEmail}`}>
            {SELLER_DISCLOSURE.supportEmail}
          </a>
        </p>
      </div>
    </section>
  );
}
