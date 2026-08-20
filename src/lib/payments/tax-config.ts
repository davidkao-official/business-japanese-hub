/**
 * Japan consumption-tax configuration boundary (#25 pre-sale gate).
 *
 * Fail-closed by design: an unresolved tax status never applies a 10%
 * consumption tax and never claims tax-inclusive pricing. Only an explicitly
 * resolved `taxable` status adds 10%. The authoritative status is a server-side
 * config; clients must not override it.
 */
import type { JapanConsumptionTaxStatus } from './contract.ts';

/** Tax rate applied for a resolved Japan taxable status (electronic books: 10%). */
export const JAPAN_CONSUMPTION_TAX_RATE = 0.1;

/** Effective tax rate for a status — 0 unless explicitly `taxable` (fail closed). */
export function japanTaxRateFor(status: JapanConsumptionTaxStatus): 0 | 0.1 {
  return status === 'taxable' ? JAPAN_CONSUMPTION_TAX_RATE : 0;
}

/** True only when the pre-sale gate has been explicitly resolved. */
export function isJapanTaxResolved(status: JapanConsumptionTaxStatus): boolean {
  return status === 'taxable' || status === 'exempt';
}
