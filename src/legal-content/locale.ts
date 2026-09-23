import type { Locale } from '../i18n/locales.ts'
import type { LegalContentLocale } from './model.ts'

/** Map UI presentation to an available legal document variant (which may be a draft). */
export function legalContentLocaleFor(locale: Locale): LegalContentLocale {
  return locale === 'zh-CN' ? 'zh-TW' : locale
}

export function hasLegalLocaleFallback(locale: Locale): boolean {
  return locale === 'zh-CN'
}
