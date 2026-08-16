import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  getActiveLocale,
  getStrings,
  localeFromLanguageTag,
  setLocalePreference,
  useLocale,
  useStrings,
} from './strings'

/**
 * Runtime completeness guard for `AppStrings`. The compiler already enforces
 * that every locale implements every key (`stringsByLocale` is typed as
 * `Record<Locale, AppStrings>`); this test adds a deep shape check so a
 * restructure or an empty-string translation is caught too.
 */

/** Map an AppStrings value to its key → leaf-kind shape (string | function | object). */
function collectShape(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return typeof value
  }
  const shape: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    shape[key] = collectShape(child)
  }
  return shape
}

/** Collect every string leaf (functions are skipped). */
function collectStringLeaves(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value]
  }
  if (value === null || typeof value !== 'object') {
    return []
  }
  return Object.values(value).flatMap((child) => collectStringLeaves(child))
}

describe('i18n', () => {
  it('keeps ja as the fallback locale', () => {
    expect(DEFAULT_LOCALE).toBe('ja')
  })

  it('supports the zh-TW locale', () => {
    expect(SUPPORTED_LOCALES).toContain('zh-TW')
  })

  it('maps supported browser language tags without inventing jurisdiction', () => {
    expect(localeFromLanguageTag('ja-JP')).toBe('ja')
    expect(localeFromLanguageTag('en-US')).toBe('en')
    expect(localeFromLanguageTag('zh-TW')).toBe('zh-TW')
    expect(localeFromLanguageTag('zh-Hant-HK')).toBe('zh-TW')
    expect(localeFromLanguageTag('fr-FR')).toBeNull()
  })

  it('prefers a persisted presentation-locale override over the browser locale', () => {
    expect(getActiveLocale()).toBe('ja')
    setLocalePreference('zh-TW')
    expect(getActiveLocale()).toBe('zh-TW')
    setLocalePreference(null)
    expect(getActiveLocale()).toBe('ja')
  })

  it('reactively switches useLocale/useStrings in the same tab', () => {
    const { result } = renderHook(() => ({ locale: useLocale(), strings: useStrings() }))

    expect(result.current.locale).toBe('ja')
    expect(result.current.strings.legal.title).toBe('法律情報')

    act(() => setLocalePreference('zh-TW'))

    expect(result.current.locale).toBe('zh-TW')
    expect(result.current.strings.legal.title).toBe('法律資訊')
  })

  it('every locale implements every AppStrings key', () => {
    const jaShape = collectShape(getStrings('ja'))
    for (const locale of SUPPORTED_LOCALES) {
      expect(collectShape(getStrings(locale))).toEqual(jaShape)
    }
  })

  it('has no empty user-facing strings in any locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const leaf of collectStringLeaves(getStrings(locale))) {
        expect(leaf.trim()).not.toBe('')
      }
    }
  })

  it('implements the legal section fully in every locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const legalLeaves = collectStringLeaves(getStrings(locale).legal)
      expect(legalLeaves.length).toBeGreaterThan(0)
      for (const leaf of legalLeaves) {
        expect(leaf.trim()).not.toBe('')
      }
    }
  })
})
