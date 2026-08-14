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
  storefront: {
    catalog: string
    viewDetails: string
    featured: string
    free: string
    owned: string
  }
  home: {
    title: string
    lead: string
    sampleBooks: string
  }
  library: {
    title: string
    signedOut: string
    empty: string
    browseBooks: string
    continueReading: string
    allOwned: string
    lastRead: string
    loading: string
    loadFailed: string
    retry: string
  }
  book: {
    title: string
    lead: string
    notFound: string
    about: string
    audience: string
    prerequisite: string
    authors: string
    publicationDetails: string
    editionLabel: string
    released: string
    language: string
    purchase: string
    preview: string
    seeContents: string
    pending: string
    purchaseUnavailable: string
    ownedLabel: string
  }
  reader: {
    backToBook: string
    backToLibrary: string
    bookNotFound: string
    chapterNotFound: string
    tableOfContents: string
    settings: string
    revealChrome: string
    close: string
    skipToChapterBody: string
    chapterNav: string
    previousChapter: string
    nextChapter: string
    readFromStart: string
    continueReading: string
    progressLabel: string
    paidBoundary: string
    chapterLabel: (order: number) => string
    fontSize: string
    theme: string
    font: string
    fontSerif: string
    fontSans: string
    themeLight: string
    themeSepia: string
    themeDark: string
    fontSizeSmall: string
    fontSizeStandard: string
    fontSizeLarge: string
    fontSizeXLarge: string
    vocab: string
    meaning: string
    reading: string
    partOfSpeech: string
    example: string
    expressionExample: string
    dialogue: string
    calloutNote: string
    calloutTip: string
    calloutWarning: string
    calloutInfo: string
    caseStudy: string
    doLabel: string
    dontLabel: string
    exercise: string
    hint: string
    showAnswer: string
    hideAnswer: string
    answer: string
    explanation: string
    authorNote: string
    outcome: string
    question: string
  }
  readerGate: {
    beyondPreview: string
    locked: string
    message: string
    previewNote: string
    backToBook: string
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
  storefront: {
    catalog: 'すべての書籍',
    viewDetails: '詳細を見る',
    featured: '注目の一冊',
    free: '無料',
    owned: '取得済み',
  },
  home: {
    title: 'ビジネス日本語ハブ',
    lead: 'ビジネスシーンで役立つ日本語表現を、実践的な書籍を通して学べるプラットフォームです。',
    sampleBooks: 'サンプル書籍',
  },
  library: {
    title: 'マイライブラリ',
    signedOut: 'ログインすると、購入した書籍と読書の進捗がここに表示されます。',
    empty: 'まだ書籍を購入していません。',
    browseBooks: '書籍を探す',
    continueReading: '続きを読む',
    allOwned: '所有している本',
    lastRead: '最後に読んだ位置',
    loading: '読み込み中…',
    loadFailed: 'ライブラリの読み込み中にエラーが発生しました。',
    retry: '再試行',
  },
  book: {
    title: '書籍詳細',
    lead: 'この書籍の詳細情報は準備中です。',
    notFound: 'この書籍は見つかりませんでした。',
    about: 'この本について',
    audience: '想定読者',
    prerequisite: '前提となる日本語力',
    authors: '著者',
    publicationDetails: '書籍情報',
    editionLabel: '版',
    released: '発行',
    language: '言語',
    purchase: '購入する',
    preview: '試し読み',
    seeContents: '目次を見る',
    pending: '確認中…',
    purchaseUnavailable: '決済は準備中です。',
    ownedLabel: '取得済み',
  },
  reader: {
    backToBook: '書籍へ戻る',
    backToLibrary: 'ライブラリへ戻る',
    bookNotFound: 'この書籍は見つかりませんでした。',
    chapterNotFound: 'この章は見つかりませんでした。',
    tableOfContents: '目次',
    settings: '表示設定',
    revealChrome: '目次と設定を表示',
    close: '閉じる',
    skipToChapterBody: '章の本文へスキップ',
    chapterNav: '章のナビゲーション',
    previousChapter: '前の章',
    nextChapter: '次の章',
    readFromStart: '読み始める',
    continueReading: '続きを読む',
    progressLabel: '読書の進捗',
    paidBoundary: 'ここから先は購入後にお読みいただけます。',
    chapterLabel: (order: number) => `第 ${order} 章`,
    fontSize: '文字サイズ',
    theme: '表示テーマ',
    font: '書体',
    fontSerif: '明朝',
    fontSans: 'ゴシック',
    themeLight: 'ライト',
    themeSepia: 'セピア',
    themeDark: 'ダーク',
    fontSizeSmall: '小',
    fontSizeStandard: '標準',
    fontSizeLarge: '大',
    fontSizeXLarge: '特大',
    vocab: '語彙',
    meaning: '意味',
    reading: '読み',
    partOfSpeech: '品詞',
    example: '例',
    expressionExample: '表現例',
    dialogue: '会話',
    calloutNote: 'ポイント',
    calloutTip: 'ヒント',
    calloutWarning: '注意',
    calloutInfo: '情報',
    caseStudy: 'ケーススタディ',
    doLabel: 'やるべきこと',
    dontLabel: 'やめるべきこと',
    exercise: '練習問題',
    hint: 'ヒントを見る',
    showAnswer: '解答を見る',
    hideAnswer: '解答を隠す',
    answer: '解答',
    explanation: '解説',
    authorNote: '著者から',
    outcome: '結果',
    question: '問い',
  },
  readerGate: {
    beyondPreview: 'この先はプレビューの範囲外です。',
    locked: 'この書籍は購入後に読むことができます。',
    message: '購入すると、続きをお読みいただけます。',
    previewNote: '購入の前に、無料プレビューをお試しください。',
    backToBook: '書籍に戻る',
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
  storefront: {
    catalog: 'All books',
    viewDetails: 'View details',
    featured: 'Featured',
    free: 'Free',
    owned: 'Owned',
  },
  home: {
    title: 'Business Japanese Hub',
    lead: 'A platform for learning practical business Japanese through real-world reading materials.',
    sampleBooks: 'Sample books',
  },
  library: {
    title: 'My Library',
    signedOut: 'Sign in to see the books you own and your reading progress here.',
    empty: 'You don’t own any books yet.',
    browseBooks: 'Browse books',
    continueReading: 'Continue reading',
    allOwned: 'Books you own',
    lastRead: 'Last read',
    loading: 'Loading…',
    loadFailed: 'Something went wrong while loading your library.',
    retry: 'Retry',
  },
  book: {
    title: 'Book Details',
    lead: 'Details for this book are coming soon.',
    notFound: 'This book could not be found.',
    about: 'About this book',
    audience: 'Audience',
    prerequisite: 'Prerequisite Japanese level',
    authors: 'Author',
    publicationDetails: 'Book details',
    editionLabel: 'Edition',
    released: 'Released',
    language: 'Language',
    purchase: 'Buy',
    preview: 'Try a sample',
    seeContents: 'View contents',
    pending: 'Checking…',
    purchaseUnavailable: 'Payment is not available yet.',
    ownedLabel: 'Owned',
  },
  reader: {
    backToBook: 'Back to book',
    backToLibrary: 'Back to Library',
    bookNotFound: 'This book could not be found.',
    chapterNotFound: 'This chapter could not be found.',
    tableOfContents: 'Table of contents',
    settings: 'Display settings',
    revealChrome: 'Show contents and settings',
    close: 'Close',
    skipToChapterBody: 'Skip to chapter body',
    chapterNav: 'Chapter navigation',
    previousChapter: 'Previous chapter',
    nextChapter: 'Next chapter',
    readFromStart: 'Start reading',
    continueReading: 'Continue reading',
    progressLabel: 'Reading progress',
    paidBoundary: 'The rest of this book is available after purchase.',
    chapterLabel: (order: number) => `Chapter ${order}`,
    fontSize: 'Text size',
    theme: 'Theme',
    font: 'Typeface',
    fontSerif: 'Serif',
    fontSans: 'Gothic',
    themeLight: 'Light',
    themeSepia: 'Sepia',
    themeDark: 'Dark',
    fontSizeSmall: 'Small',
    fontSizeStandard: 'Standard',
    fontSizeLarge: 'Large',
    fontSizeXLarge: 'Extra large',
    vocab: 'Vocabulary',
    meaning: 'Meaning',
    reading: 'Reading',
    partOfSpeech: 'Part of speech',
    example: 'Example',
    expressionExample: 'Expression',
    dialogue: 'Dialogue',
    calloutNote: 'Note',
    calloutTip: 'Tip',
    calloutWarning: 'Warning',
    calloutInfo: 'Info',
    caseStudy: 'Case study',
    doLabel: 'Do',
    dontLabel: 'Don’t',
    exercise: 'Exercise',
    hint: 'Show hint',
    showAnswer: 'Show answer',
    hideAnswer: 'Hide answer',
    answer: 'Answer',
    explanation: 'Explanation',
    authorNote: 'From the author',
    outcome: 'Outcome',
    question: 'Question',
  },
  readerGate: {
    beyondPreview: 'You’ve reached the end of the preview.',
    locked: 'This book is available after purchase.',
    message: 'Purchase the book to keep reading.',
    previewNote: 'Try the free preview before you buy.',
    backToBook: 'Back to the book',
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
