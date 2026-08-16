/**
 * Japan consumption-tax boundary tests — fail-closed (#25 pre-sale gate).
 *
 * An unresolved tax status must NEVER apply a 10% consumption tax or claim a
 * tax-inclusive price; only an explicitly resolved `taxable` status may.
 */
import { describe, expect, it } from 'vitest';
import { JAPAN_CONSUMPTION_TAX_RATE, isJapanTaxResolved, japanTaxRateFor } from './tax-config';

describe('japanTaxRateFor — fail-closed rate resolution', () => {
  it('applies no tax when the status is unresolved (the seeded default)', () => {
    expect(japanTaxRateFor('unresolved')).toBe(0);
  });

  it('applies no tax for an exempt status (never claims tax-inclusive pricing)', () => {
    expect(japanTaxRateFor('exempt')).toBe(0);
  });

  it('applies the 10% rate only for an explicitly resolved taxable status', () => {
    expect(japanTaxRateFor('taxable')).toBe(JAPAN_CONSUMPTION_TAX_RATE);
    expect(JAPAN_CONSUMPTION_TAX_RATE).toBe(0.1);
  });
});

describe('isJapanTaxResolved — the pre-sale gate', () => {
  it('is unresolved by default and never treated as resolved', () => {
    expect(isJapanTaxResolved('unresolved')).toBe(false);
  });

  it('is resolved only for an explicit taxable or exempt status', () => {
    expect(isJapanTaxResolved('taxable')).toBe(true);
    expect(isJapanTaxResolved('exempt')).toBe(true);
  });
});
