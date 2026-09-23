import type { Locale } from '../i18n/locales'
import type { LegalContentLocale } from './model'

/** Map UI presentation to an actually reviewed legal text variant. */
export function legalContentLocaleFor(locale: Locale): LegalContentLocale {
  return locale === 'zh-CN' ? 'zh-TW' : locale
}

export function hasLegalLocaleFallback(locale: Locale): boolean {
  return locale === 'zh-CN'
}
