/** Framework-free locale contract safe for browser, scripts, and Edge code. */
export const SUPPORTED_LOCALES = ['ja', 'en', 'zh-TW'] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'ja'
