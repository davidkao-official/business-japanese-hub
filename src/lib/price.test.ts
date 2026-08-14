import { describe, expect, it } from 'vitest'
import { formatPrice } from './price'

describe('formatPrice', () => {
  it('formats JPY with a yen sign and no decimals', () => {
    expect(formatPrice({ tier: 'paid', amount: 880, currency: 'JPY' })).toBe('¥880')
    expect(formatPrice({ tier: 'paid', amount: 1200, currency: 'JPY' })).toBe('¥1,200')
  })

  it('formats other currencies with a code prefix', () => {
    expect(formatPrice({ tier: 'paid', amount: 9, currency: 'USD' })).toBe('USD 9')
  })

  it('returns null when amount or currency is missing', () => {
    expect(formatPrice({ tier: 'paid' })).toBeNull()
    expect(formatPrice({ tier: 'paid', amount: 100 })).toBeNull()
    expect(formatPrice({ tier: 'paid', currency: 'JPY' })).toBeNull()
  })
})
