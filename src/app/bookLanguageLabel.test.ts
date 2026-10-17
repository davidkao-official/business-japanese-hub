import { describe, expect, it } from 'vitest'
import { bookLanguageLabel } from './bookLanguageLabel'

describe('bookLanguageLabel', () => {
  it('uses the Japanese display name and preserves unknown language codes', () => {
    expect(bookLanguageLabel('ja')).toBe('日本語')
    expect(bookLanguageLabel('fr-CA')).toBe('fr-CA')
  })
})
