/** Framework-free locale contract safe for browser, scripts, and Edge code. */
export const SUPPORTED_LOCALES = ['ja', 'zh-TW', 'zh-CN', 'en'] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'ja'
