/**
 * Provider-neutral Money helpers (decision-record §8.1).
 *
 * Pure functions only: no DB / fetch / global state. `Money.amount` is the
 * integer canonical amount in the currency's minor unit (JS safe integer,
 * non-negative); `Money.currency` is a registry-validated uppercase ISO 4217
 * code (see `src/content/iso4217.ts`).
 */

import { isCurrentIso4217Code } from '../../content/iso4217';
import type { Money } from './contract';

export { isSafeMoney } from './contract';

const MINOR_UNITS: Record<string, number> = {
  JPY: 1, // zero-decimal currency
  TWD: 100,
  USD: 100,
};

/** Thrown when a currency has no supported minor-unit mapping for this domain. */
export class UnsupportedCurrency extends Error {
  constructor(currency: string) {
    super(`Unsupported currency: ${currency}`);
    this.name = 'UnsupportedCurrency';
  }
}

/**
 * Minor unit of the given currency. Codes are case-sensitive and must be a
 * known ISO 4217 code (uppercase) per `isCurrentIso4217Code`.
 * - JPY → 1 (zero-decimal)
 * - TWD / USD → 100 (cents / 分)
 * - any other valid ISO 4217 code → throws (no minor-unit mapping defined)
 * - unknown / malformed code → throws
 */
export function minorUnitFor(currency: string): number {
  if (!isCurrentIso4217Code(currency)) {
    throw new UnsupportedCurrency(currency);
  }
  const minor = MINOR_UNITS[currency];
  if (minor === undefined) {
    throw new UnsupportedCurrency(currency);
  }
  return minor;
}

/**
 * Convert a major-unit display amount to canonical integer minor units.
 *
 * Validates the input is finite and non-negative and that the result is a safe
 * integer. Rejects float imprecision (e.g. `19.99 * 100 === 1998.999…`) and
 * overflow by throwing.
 */
export function toMinorUnits(majorAmount: number, currency: string): number {
  if (!Number.isFinite(majorAmount)) {
    throw new Error(`majorAmount must be finite: ${majorAmount}`);
  }
  if (majorAmount < 0) {
    throw new Error(`majorAmount must be non-negative: ${majorAmount}`);
  }
  const minor = majorAmount * minorUnitFor(currency);
  if (!Number.isSafeInteger(minor)) {
    throw new Error(`result is not a safe integer: ${minor}`);
  }
  return minor;
}

/** True when two monies have equal amount and currency. */
export function moneyEquals(a: Money, b: Money): boolean {
  return a.amount === b.amount && a.currency === b.currency;
}
