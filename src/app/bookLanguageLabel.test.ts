import { describe, expect, it } from 'vitest'
import { bookLanguageLabel } from './bookLanguageLabel'

describe('bookLanguageLabel', () => {
  it('uses the Japanese display name for Japanese language tags', () => {
    expect(bookLanguageLabel('ja')).toBe('日本語')
    expect(bookLanguageLabel('ja-JP')).toBe('日本語')
    expect(bookLanguageLabel('JA-jp')).toBe('日本語')
  })

  it('preserves unknown language codes and tags without a Japanese primary subtag', () => {
    expect(bookLanguageLabel('fr-CA')).toBe('fr-CA')
    expect(bookLanguageLabel('japanese')).toBe('japanese')
    expect(bookLanguageLabel('jafoo')).toBe('jafoo')
    expect(bookLanguageLabel('fr-ja')).toBe('fr-ja')
  })
})
