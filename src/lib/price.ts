/**
 * Price display helpers. Prices are display-only metadata (docs/content-model.md
 * §2.4): the amount is a display value in the currency's major unit and is never
 * used for arithmetic.
 */

import type { Price } from '../content/types';

/** Symbol-preceded display for JPY; `CODE amount` for other currencies. */
export function formatPrice(price: Price): string | null {
  if (price.amount === undefined || price.currency === undefined) return null;
  const amount = price.amount.toLocaleString('en-US');
  return price.currency === 'JPY' ? `¥${amount}` : `${price.currency} ${amount}`;
}
