/**
 * i18n — typed, framework-free string module.
 * ---------------------------------------------------------------------
 * All user-facing UI strings live here, keyed by locale (default `ja`).
 * The `AppStrings` interface is the source of truth: every locale must
 * implement it fully, so a missing translation is a compile error.
 *
 * Deliberately dependency-free. If the product later needs real
 * internationalization (pluralization, ICU, RTL, lazy loading), this
 * module is the single seam to swap for a framework — components only
 * ever consume strings through `useStrings` / `getStrings`.
 */

import { useMemo } from 'react'

export const SUPPORTED_LOCALES = ['ja', 'en'] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'ja'

export interface AppStrings {
  app: {
    name: string
    tagline: string
  }
  nav: {
    main: string
    home: string
    library: string
    skipToContent: string
  }
  home: {
    title: string
    lead: string
  }
  library: {
    title: string
    lead: string
  }
  book: {
    title: string
    lead: string
    notFound: string
  }
  notFound: {
    title: string
    message: string
    backHome: string
  }
  footer: {
    note: string
  }
}

const ja: AppStrings = {
  app: {
    name: 'ビジネス日本語ハブ',
    tagline: 'ビジネス日本語を学ぶためのプラットフォーム',
  },
  nav: {
    main: 'メインナビゲーション',
    home: 'ホーム',
    library: 'マイライブラリ',
    skipToContent: '本文へスキップ',
  },
  home: {
    title: 'ビジネス日本語ハブ',
    lead: 'ビジネスシーンで役立つ日本語表現を、実践的な書籍を通して学べるプラットフォームです。',
  },
  library: {
    title: 'マイライブラリ',
    lead: 'あなたの読書リストがここに表示されます。',
  },
  book: {
    title: '書籍詳細',
    lead: 'この書籍の詳細情報は準備中です。',
    notFound: 'この書籍は見つかりませんでした。',
  },
  notFound: {
    title: 'ページが見つかりません',
    message: 'お探しのページは存在しないか、移動した可能性があります。',
    backHome: 'ホームに戻る',
  },
  footer: {
    note: '© ビジネス日本語ハブ',
  },
}

const en: AppStrings = {
  app: {
    name: 'Business Japanese Hub',
    tagline: 'A platform for learning business Japanese',
  },
  nav: {
    main: 'Main navigation',
    home: 'Home',
    library: 'My Library',
    skipToContent: 'Skip to content',
  },
  home: {
    title: 'Business Japanese Hub',
    lead: 'A platform for learning practical business Japanese through real-world reading materials.',
  },
  library: {
    title: 'My Library',
    lead: 'Your reading list will appear here.',
  },
  book: {
    title: 'Book Details',
    lead: 'Details for this book are coming soon.',
    notFound: 'This book could not be found.',
  },
  notFound: {
    title: 'Page not found',
    message: 'The page you are looking for does not exist or has moved.',
    backHome: 'Back to Home',
  },
  footer: {
    note: '© Business Japanese Hub',
  },
}

const stringsByLocale: Record<Locale, AppStrings> = {
  ja,
  en,
}

/** Synchronous lookup — safe anywhere, but prefers `useStrings` in components. */
export function getStrings(locale: Locale = DEFAULT_LOCALE): AppStrings {
  return stringsByLocale[locale] ?? stringsByLocale[DEFAULT_LOCALE]
}

/**
 * Reactive lookup for components. Currently stateless; the signature is the
 * seam where a locale provider / context could be introduced later without
 * touching call sites.
 */
export function useStrings(locale: Locale = DEFAULT_LOCALE): AppStrings {
  return useMemo(() => getStrings(locale), [locale])
}
