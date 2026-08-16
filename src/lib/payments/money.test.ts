import { describe, expect, it } from 'vitest';
import { minorUnitFor, moneyEquals, toMinorUnits, isSafeMoney, UnsupportedCurrency } from './money';

describe('minorUnitFor', () => {
  it('maps JPY to 1 (zero-decimal currency)', () => {
    expect(minorUnitFor('JPY')).toBe(1);
  });

  it('maps TWD and USD to 100 (cents)', () => {
    expect(minorUnitFor('TWD')).toBe(100);
    expect(minorUnitFor('USD')).toBe(100);
  });

  it('throws for a valid ISO 4217 code with no defined minor-unit mapping', () => {
    expect(() => minorUnitFor('EUR')).toThrow(UnsupportedCurrency);
  });

  it('throws for codes that are not current ISO 4217 codes', () => {
    expect(() => minorUnitFor('AAA')).toThrow(UnsupportedCurrency);
    expect(() => minorUnitFor('BTC')).toThrow(UnsupportedCurrency);
    expect(() => minorUnitFor('')).toThrow(UnsupportedCurrency);
  });

  it('is case-sensitive: lowercase codes are rejected', () => {
    expect(() => minorUnitFor('jpy')).toThrow(UnsupportedCurrency);
    expect(() => minorUnitFor('twd')).toThrow(UnsupportedCurrency);
  });
});

describe('toMinorUnits', () => {
  it('converts major-unit amounts to canonical integer minor units', () => {
    expect(toMinorUnits(790, 'TWD')).toBe(79000);
    expect(toMinorUnits(880, 'JPY')).toBe(880);
    expect(toMinorUnits(9.99, 'USD')).toBe(999);
    expect(toMinorUnits(0, 'TWD')).toBe(0);
  });

  it('throws on negative amounts', () => {
    expect(() => toMinorUnits(-1, 'TWD')).toThrow(/non-negative/);
  });

  it('throws on non-finite amounts', () => {
    expect(() => toMinorUnits(Number.NaN, 'TWD')).toThrow(/finite/);
    expect(() => toMinorUnits(Number.POSITIVE_INFINITY, 'TWD')).toThrow(/finite/);
  });

  it('throws when the result is not a safe integer (float imprecision)', () => {
    expect(() => toMinorUnits(19.99, 'TWD')).toThrow(/safe integer/);
  });

  it('throws when the result overflows the safe-integer range', () => {
    expect(() => toMinorUnits(1e16, 'JPY')).toThrow(/safe integer/);
  });

  it('throws for unsupported / unknown currencies', () => {
    expect(() => toMinorUnits(1, 'EUR')).toThrow(UnsupportedCurrency);
    expect(() => toMinorUnits(1, 'AAA')).toThrow(UnsupportedCurrency);
  });
});

describe('moneyEquals', () => {
  it('is true when amount and currency are equal', () => {
    expect(moneyEquals({ amount: 79000, currency: 'TWD' }, { amount: 79000, currency: 'TWD' })).toBe(true);
  });

  it('is false on amount mismatch', () => {
    expect(moneyEquals({ amount: 79000, currency: 'TWD' }, { amount: 79001, currency: 'TWD' })).toBe(false);
  });

  it('is false on currency mismatch', () => {
    expect(moneyEquals({ amount: 79000, currency: 'TWD' }, { amount: 79000, currency: 'JPY' })).toBe(false);
  });
});

describe('isSafeMoney (re-exported from contract)', () => {
  it('accepts a non-negative safe-integer amount', () => {
    expect(isSafeMoney({ amount: 79000, currency: 'TWD' })).toBe(true);
    expect(isSafeMoney({ amount: 0, currency: 'JPY' })).toBe(true);
  });

  it('rejects negative, fractional, and non-safe-integer amounts', () => {
    expect(isSafeMoney({ amount: -1, currency: 'TWD' })).toBe(false);
    expect(isSafeMoney({ amount: 1.5, currency: 'TWD' })).toBe(false);
    expect(isSafeMoney({ amount: Number.MAX_SAFE_INTEGER + 1, currency: 'TWD' })).toBe(false);
  });
});
