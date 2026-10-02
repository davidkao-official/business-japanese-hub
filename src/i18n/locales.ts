/** Framework-free locale contract safe for browser, scripts, and Edge code. */
export const SUPPORTED_LOCALES = ['ja', 'zh-TW', 'zh-CN', 'en'] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'ja'

/** Complete, user-visible locales. Resources may exist before a locale launches. */
export const LAUNCHED_LOCALES: readonly Locale[] = ['ja']

/** Keep a dormant preference intact while showing only a complete locale. */
export function resolveLaunchedLocale(preferred: Locale, launched: readonly Locale[] = LAUNCHED_LOCALES): Locale {
  return launched.includes(preferred) ? preferred : DEFAULT_LOCALE
}
