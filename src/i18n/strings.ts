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

import { useMemo, useSyncExternalStore } from 'react'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from './locales'

export { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from './locales'

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
  appearance: {
    label: string
    system: string
    light: string
    dark: string
  }
  storefront: {
    catalog: string
    viewDetails: string
    featured: string
    free: string
    owned: string
    practiceKicker: string
    practiceTitle: string
    practiceLead: string
    playCase: string
  }
  home: {
    title: string
    lead: string
    featureLabel: string
    featureTitle: string
    samplesLabel: string
    samplesTitle: string
    selectionsLabel: string
    selectionsTitle: string
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
  libraryLink: {
    title: string
    message: string
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
    freeReadingNote: string
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
  legal: {
    title: string
    lead: string
    documentsLabel: string
    documentNotFound: string
    backToIndex: string
    draftNotice: string
    versionLabel: string
    statusLabel: string
    statusDraft: string
    statusReview: string
    statusLive: string
    revisedLabel: string
    footerLabel: string
    sellerDisclosureLabel: string
    sellerDisclosurePending: string
  }
  checkout: {
    consentTitle: string
    waiverNoticeLabel: string
    consentLabel: string
    consentRequiredHint: string
    confirmPurchase: string
    cancel: string
    jurisdictionTitle: string
    jurisdictionNote: string
    jurisdictionTW: string
    jurisdictionJP: string
  }
  auth: {
    account: string
    signIn: string
    createAccount: string
    signOut: string
    email: string
    password: string
    submitSignIn: string
    submitSignUp: string
    cancel: string
    switchToSignIn: string
    switchToSignUp: string
    failure: string
    confirmationSent: string
    authRequired: string
    loading: string
  }
  purchaseResult: {
    title: string
    missingOrder: string
    pending: string
    stillProcessing: string
    succeededTitle: string
    succeededMessage: string
    refundedTitle: string
    refundedMessage: string
    failedTitle: string
    failedMessage: string
    cancelledTitle: string
    cancelledMessage: string
    receiptLabel: string
    orderNumber: string
    bookTitleLabel: string
    amountLabel: string
    paymentMethodLabel: string
    deliveryMethodLabel: string
    deliveryLibrary: string
    deliveryRevoked: string
    refundPolicyLabel: string
    refundPolicySummary: string
    refundPolicyLink: string
    supportLabel: string
    notAvailable: string
    statusLabel: string
    statusSucceeded: string
    statusRefunded: string
    taxInclusive: string
    goToLibrary: string
    backToBook: string
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
  appearance: {
    label: '外観',
    system: 'システム',
    light: 'ライト',
    dark: 'ダーク',
  },
  storefront: {
    catalog: 'すべての書籍',
    viewDetails: '詳細を見る',
    featured: '注目の一冊',
    free: '無料',
    owned: '取得済み',
    practiceKicker: '実践で試す',
    practiceTitle: '読んだ知識を、職場の判断へ',
    practiceLead: 'Career Gameでは、短い職場ケースを通して判断とその結果を体験できます。',
    playCase: 'ケースをプレイ',
  },
  home: {
    title: 'ビジネス日本語ハブ',
    lead: 'ビジネスシーンで役立つ日本語表現を、実践的な書籍を通して学べるプラットフォームです。',
    featureLabel: '本の構造',
    featureTitle: '実務で使う言葉を、文脈の中で読む',
    samplesLabel: '表現のサンプル',
    samplesTitle: '実際の文章と会話から学ぶ',
    selectionsLabel: '書籍からの選書',
    selectionsTitle: '公開中の書籍から、読む場所を選ぶ',
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
  libraryLink: {
    title: '関連する読書が見つかりません',
    message: 'この関連コンテンツは、現在のライブラリでは利用できません。',
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
    freeReadingNote: 'この本は全章を無料でお読みいただけます。',
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
  legal: {
    title: '法律情報',
    lead: '本サイトの利用条件・プライバシー・法令に基づく表記等を掲載しています。',
    documentsLabel: '文書一覧',
    documentNotFound: '指定された文書は見つかりませんでした。',
    backToIndex: '法律情報の一覧に戻る',
    draftNotice: '本ページはドラフトです。法律専門家による審査前であり、内容は変更される可能性があります。',
    versionLabel: '版',
    statusLabel: 'ステータス',
    statusDraft: 'ドラフト',
    statusReview: 'レビュー中',
    statusLive: '公開',
    revisedLabel: '改訂',
    footerLabel: '法律情報',
    sellerDisclosureLabel: '販売者：',
    sellerDisclosurePending: '登録名確認中',
  },
  checkout: {
    consentTitle: '事前同意（デジタルコンテンツの即時提供）',
    waiverNoticeLabel: '7日間クーリング・オフ適用除外の告知',
    consentLabel: 'デジタルコンテンツの即時提供・ダウンロードに同意します',
    consentRequiredHint: '購入を続けるには上記に同意する必要があります。',
    confirmPurchase: '同意して購入する',
    cancel: '戻る',
    jurisdictionTitle: 'お住まいの国・地域を選択してください',
    jurisdictionNote:
      '購入に適用される消費税の取扱いと法定表示は、表示言語ではなくお客様の消費者所在地に基づいて決まります。',
    jurisdictionTW: '台湾の消費者',
    jurisdictionJP: '日本の消費者',
  },
  auth: {
    account: 'アカウント',
    signIn: 'ログイン',
    createAccount: 'アカウント作成',
    signOut: 'ログアウト',
    email: 'メールアドレス',
    password: 'パスワード',
    submitSignIn: 'ログインして続ける',
    submitSignUp: 'アカウントを作成して続ける',
    cancel: '閉じる',
    switchToSignIn: 'すでにアカウントをお持ちの方',
    switchToSignUp: '初めての方はこちら',
    failure: '認証できませんでした。入力内容をご確認ください。',
    confirmationSent: '確認メールを送信しました。メール内のリンクを開いてから、もう一度ログインしてください。',
    authRequired: '購入を続けるにはログインまたはアカウント作成が必要です。',
    loading: '確認中…',
  },
  purchaseResult: {
    title: '購入結果',
    missingOrder: '注文番号がありません。',
    pending: '決済確認中…',
    stillProcessing:
      '決済の確認がまだ完了していません。しばらくしてから再度ご確認いただくか、ライブラリで最新の状態をご確認ください。',
    succeededTitle: '購入が完了しました',
    succeededMessage: 'ご購入ありがとうございます。本書はライブラリに追加されました。',
    refundedTitle: '返金が完了しました',
    refundedMessage: 'この注文は返金済みです。書籍へのアクセスは終了しました。',
    failedTitle: '決済に失敗しました',
    failedMessage: '決済が完了しませんでした。もう一度お試しください。',
    cancelledTitle: '購入はキャンセルされました',
    cancelledMessage: '注文はキャンセルされました。',
    receiptLabel: '注文の領収書',
    orderNumber: '注文番号',
    bookTitleLabel: '書籍',
    amountLabel: '金額',
    paymentMethodLabel: '支払方法',
    deliveryMethodLabel: '引渡方法',
    deliveryLibrary: '決済確認後、ライブラリへ即時配信',
    deliveryRevoked: 'アクセス終了',
    refundPolicyLabel: 'キャンセル・返金：',
    refundPolicySummary: 'デジタルコンテンツのため、決済後のキャンセルは原則として受け付けません。不具合がある場合はお問い合わせください。',
    refundPolicyLink: '返品・返金ポリシー',
    supportLabel: 'お問い合わせ：',
    notAvailable: '未確定',
    statusLabel: 'ステータス',
    statusSucceeded: '完了',
    statusRefunded: '返金済み',
    taxInclusive: '（税込）',
    goToLibrary: 'ライブラリへ',
    backToBook: '書籍へ戻る',
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
  appearance: {
    label: 'Appearance',
    system: 'System',
    light: 'Light',
    dark: 'Dark',
  },
  storefront: {
    catalog: 'All books',
    viewDetails: 'View details',
    featured: 'Featured',
    free: 'Free',
    owned: 'Owned',
    practiceKicker: 'Put it into practice',
    practiceTitle: 'Turn reading into workplace decisions',
    practiceLead: 'Career Game lets you make decisions and see their consequences in a short workplace case.',
    playCase: 'Play the case',
  },
  home: {
    title: 'Business Japanese Hub',
    lead: 'A platform for learning practical business Japanese through real-world reading materials.',
    featureLabel: 'How the books are structured',
    featureTitle: 'Read workplace language in context.',
    samplesLabel: 'Expression samples',
    samplesTitle: 'Start with real sentences and conversations.',
    selectionsLabel: 'Selected from the books',
    selectionsTitle: 'Find a place to begin in the published books.',
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
  libraryLink: {
    title: 'Related reading is unavailable',
    message: 'This related content is not available in the current Library catalog.',
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
    freeReadingNote: 'Every chapter of this book is free to read.',
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
  legal: {
    title: 'Legal',
    lead: 'Terms, privacy, and statutory notices for this platform.',
    documentsLabel: 'Documents',
    documentNotFound: 'The requested document could not be found.',
    backToIndex: 'Back to Legal',
    draftNotice: 'This page is a draft and has not yet been reviewed by legal counsel; content may change.',
    versionLabel: 'Version',
    statusLabel: 'Status',
    statusDraft: 'Draft',
    statusReview: 'In review',
    statusLive: 'Live',
    revisedLabel: 'Revised',
    footerLabel: 'Legal information',
    sellerDisclosureLabel: 'Seller: ',
    sellerDisclosurePending: 'registered name pending confirmation',
  },
  checkout: {
    consentTitle: 'Prior consent (immediate delivery of digital content)',
    waiverNoticeLabel: '7-day right-of-withdrawal exclusion notice',
    consentLabel: 'I agree to the immediate provision/download of the digital content',
    consentRequiredHint: 'You must agree to the above to continue.',
    confirmPurchase: 'Agree and pay',
    cancel: 'Back',
    jurisdictionTitle: 'Select your consumer location',
    jurisdictionNote:
      'The tax treatment and legal disclosures applied to your purchase are based on your consumer location, not the display language.',
    jurisdictionTW: 'Taiwan consumer',
    jurisdictionJP: 'Japan consumer',
  },
  auth: {
    account: 'Account',
    signIn: 'Sign in',
    createAccount: 'Create account',
    signOut: 'Sign out',
    email: 'Email',
    password: 'Password',
    submitSignIn: 'Sign in and continue',
    submitSignUp: 'Create account and continue',
    cancel: 'Close',
    switchToSignIn: 'Already have an account?',
    switchToSignUp: 'New here? Create an account',
    failure: 'We could not authenticate you. Check your details and try again.',
    confirmationSent: 'Check your email and confirm your account, then return here to sign in.',
    authRequired: 'Sign in or create an account to continue this purchase.',
    loading: 'Checking…',
  },
  purchaseResult: {
    title: 'Purchase Result',
    missingOrder: 'No order reference was provided.',
    pending: 'Confirming payment…',
    stillProcessing:
      'We are still confirming your payment. Please check again shortly, or view the latest status in your library.',
    succeededTitle: 'Purchase complete',
    succeededMessage: 'Thank you for your purchase. The book has been added to your library.',
    refundedTitle: 'Refund complete',
    refundedMessage: 'This order has been refunded and access to the book has ended.',
    failedTitle: 'Payment failed',
    failedMessage: 'Your payment could not be completed. Please try again.',
    cancelledTitle: 'Purchase cancelled',
    cancelledMessage: 'The order was cancelled.',
    receiptLabel: 'Order receipt',
    orderNumber: 'Order number',
    bookTitleLabel: 'Book',
    amountLabel: 'Amount',
    paymentMethodLabel: 'Payment method',
    deliveryMethodLabel: 'Delivery',
    deliveryLibrary: 'Immediate digital delivery to your Library after payment confirmation',
    deliveryRevoked: 'Access ended',
    refundPolicyLabel: 'Cancellation and refunds:',
    refundPolicySummary: 'Completed digital purchases are generally non-cancellable. Contact support if the content is defective.',
    refundPolicyLink: 'Returns & Refunds Policy',
    supportLabel: 'Support:',
    notAvailable: 'Unavailable',
    statusLabel: 'Status',
    statusSucceeded: 'Completed',
    statusRefunded: 'Refunded',
    taxInclusive: '(tax included)',
    goToLibrary: 'Go to Library',
    backToBook: 'Back to book',
  },
}

const zhTW: AppStrings = {
  app: {
    name: '商務日語中心',
    tagline: '學習商務日語的平台',
  },
  nav: {
    main: '主導覽',
    home: '首頁',
    library: '我的書庫',
    skipToContent: '跳到主要內容',
  },
  appearance: {
    label: '外觀',
    system: '系統',
    light: '亮色',
    dark: '深色',
  },
  storefront: {
    catalog: '所有書籍',
    viewDetails: '查看詳情',
    featured: '主打書籍',
    free: '免費',
    owned: '已擁有',
    practiceKicker: '實際演練',
    practiceTitle: '把閱讀知識化為職場判斷',
    practiceLead: '在 Career Game 的短篇職場個案中做出判斷，並查看其結果。',
    playCase: '開始個案',
  },
  home: {
    title: '商務日語中心',
    lead: '透過實際的商務日語讀物，學習職場實用日語的平台。',
    featureLabel: '書本結構',
    featureTitle: '在真實脈絡中閱讀職場日語',
    samplesLabel: '表達範例',
    samplesTitle: '從實際句子與對話開始學習',
    selectionsLabel: '書籍選讀',
    selectionsTitle: '從已公開的書籍中，找到開始閱讀的位置',
  },
  library: {
    title: '我的書庫',
    signedOut: '登入後，您購買的書籍與閱讀進度會顯示在這裡。',
    empty: '您尚未購買任何書籍。',
    browseBooks: '瀏覽書籍',
    continueReading: '繼續閱讀',
    allOwned: '已擁有的書籍',
    lastRead: '上次閱讀位置',
    loading: '載入中…',
    loadFailed: '載入書庫時發生錯誤。',
    retry: '重試',
  },
  libraryLink: {
    title: '找不到相關讀物',
    message: '此相關內容目前不在書庫目錄中。',
  },
  book: {
    title: '書籍詳情',
    lead: '本書的詳細資訊準備中。',
    notFound: '找不到這本書。',
    about: '關於本書',
    audience: '目標讀者',
    prerequisite: '建議日語程度',
    authors: '作者',
    publicationDetails: '書籍資訊',
    editionLabel: '版',
    released: '發行',
    language: '語言',
    purchase: '購買',
    preview: '試讀',
    seeContents: '查看目錄',
    pending: '確認中…',
    purchaseUnavailable: '付款功能準備中。',
    ownedLabel: '已擁有',
    freeReadingNote: '本書所有章節均可免費閱讀。',
  },
  reader: {
    backToBook: '返回書籍',
    backToLibrary: '返回書庫',
    bookNotFound: '找不到這本書。',
    chapterNotFound: '找不到這個章節。',
    tableOfContents: '目錄',
    settings: '顯示設定',
    revealChrome: '顯示目錄與設定',
    close: '關閉',
    skipToChapterBody: '跳到章節正文',
    chapterNav: '章節導覽',
    previousChapter: '上一章',
    nextChapter: '下一章',
    readFromStart: '開始閱讀',
    continueReading: '繼續閱讀',
    progressLabel: '閱讀進度',
    paidBoundary: '後續內容需購買後方可閱讀。',
    chapterLabel: (order: number) => `第 ${order} 章`,
    fontSize: '文字大小',
    theme: '顯示主題',
    font: '字型',
    fontSerif: '明體',
    fontSans: '黑體',
    themeLight: '亮色',
    themeSepia: '米色',
    themeDark: '深色',
    fontSizeSmall: '小',
    fontSizeStandard: '標準',
    fontSizeLarge: '大',
    fontSizeXLarge: '特大',
    vocab: '詞彙',
    meaning: '意思',
    reading: '讀音',
    partOfSpeech: '詞性',
    example: '例句',
    expressionExample: '表達例句',
    dialogue: '會話',
    calloutNote: '重點',
    calloutTip: '提示',
    calloutWarning: '注意',
    calloutInfo: '資訊',
    caseStudy: '個案研究',
    doLabel: '應該做',
    dontLabel: '不應該做',
    exercise: '練習題',
    hint: '查看提示',
    showAnswer: '顯示解答',
    hideAnswer: '隱藏解答',
    answer: '解答',
    explanation: '解說',
    authorNote: '作者的話',
    outcome: '結果',
    question: '問題',
  },
  readerGate: {
    beyondPreview: '這裡已超出試讀範圍。',
    locked: '本書需購買後方可閱讀。',
    message: '購買本書後，即可繼續閱讀。',
    previewNote: '購買前請先試讀免費預覽。',
    backToBook: '返回書籍',
  },
  notFound: {
    title: '找不到頁面',
    message: '您要找的頁面不存在或已移動。',
    backHome: '返回首頁',
  },
  footer: {
    note: '© 商務日語中心',
  },
  legal: {
    title: '法律資訊',
    lead: '本平台的服務條款、隱私權政策及法令標示。',
    documentsLabel: '文件一覽',
    documentNotFound: '找不到指定的文件。',
    backToIndex: '返回法律資訊',
    draftNotice: '本頁內容為草稿，尚未經法律專業審閱，內容可能變更。',
    versionLabel: '版本',
    statusLabel: '狀態',
    statusDraft: '草稿',
    statusReview: '審閱中',
    statusLive: '公開',
    revisedLabel: '修訂',
    footerLabel: '法律資訊',
    sellerDisclosureLabel: '販售者：',
    sellerDisclosurePending: '註冊名稱待確認',
  },
  checkout: {
    consentTitle: '事先同意（數位內容即時提供）',
    waiverNoticeLabel: '7 日解除權適用除外告知',
    consentLabel: '本人同意立即提供／下載數位內容',
    consentRequiredHint: '您必須勾選同意後才能繼續購買。',
    confirmPurchase: '同意並付款',
    cancel: '返回',
    jurisdictionTitle: '請選擇您的消費者所在地',
    jurisdictionNote: '您的購買所適用的稅務處理與法定告知，依消費者所在地決定，而非顯示語言。',
    jurisdictionTW: '台灣消費者',
    jurisdictionJP: '日本消費者',
  },
  auth: {
    account: '帳戶',
    signIn: '登入',
    createAccount: '建立帳戶',
    signOut: '登出',
    email: '電子郵件',
    password: '密碼',
    submitSignIn: '登入並繼續',
    submitSignUp: '建立帳戶並繼續',
    cancel: '關閉',
    switchToSignIn: '已有帳戶？',
    switchToSignUp: '第一次來？建立帳戶',
    failure: '無法完成身分驗證，請檢查資料後再試一次。',
    confirmationSent: '確認信已寄出。請先點選信中連結，再回到這裡登入。',
    authRequired: '請先登入或建立帳戶，再繼續購買。',
    loading: '確認中…',
  },
  purchaseResult: {
    title: '購買結果',
    missingOrder: '缺少訂單編號。',
    pending: '付款確認中…',
    stillProcessing: '付款仍在確認中。請稍後再查看，或至書庫查看最新狀態。',
    succeededTitle: '購買完成',
    succeededMessage: '感謝您的購買。本書已加入您的書庫。',
    refundedTitle: '退款完成',
    refundedMessage: '此訂單已退款，書籍存取權已終止。',
    failedTitle: '付款失敗',
    failedMessage: '付款未能完成，請再試一次。',
    cancelledTitle: '購買已取消',
    cancelledMessage: '訂單已取消。',
    receiptLabel: '訂單收據',
    orderNumber: '訂單編號',
    bookTitleLabel: '書籍',
    amountLabel: '金額',
    paymentMethodLabel: '付款方式',
    deliveryMethodLabel: '交付方式',
    deliveryLibrary: '付款確認後立即交付至書庫',
    deliveryRevoked: '存取權已終止',
    refundPolicyLabel: '取消與退款：',
    refundPolicySummary: '數位內容完成付款後原則上無法取消。如內容有瑕疵，請聯絡客服。',
    refundPolicyLink: '退款政策',
    supportLabel: '客服：',
    notAvailable: '尚未確定',
    statusLabel: '狀態',
    statusSucceeded: '已完成',
    statusRefunded: '已退款',
    taxInclusive: '（含稅）',
    goToLibrary: '前往書庫',
    backToBook: '返回書籍',
  },
}

const stringsByLocale: Record<Locale, AppStrings> = {
  ja,
  en,
  'zh-TW': zhTW,
}

export const LOCALE_STORAGE_KEY = 'business-japanese-hub.locale'
const LOCALE_CHANGE_EVENT = 'business-japanese-hub:locale-change'

function isLocale(value: string | null): value is Locale {
  return value !== null && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

/** Map a browser language tag to a supported presentation locale. */
export function localeFromLanguageTag(language: string | null | undefined): Locale | null {
  if (!language) return null
  const normalized = language.trim().replaceAll('_', '-').toLowerCase()
  if (!normalized) return null

  if (
    normalized === 'zh-tw' ||
    normalized === 'zh-hk' ||
    normalized === 'zh-mo' ||
    normalized.startsWith('zh-hant')
  ) {
    return 'zh-TW'
  }
  if (normalized === 'ja' || normalized.startsWith('ja-')) return 'ja'
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en'
  return null
}

function readPersistedLocale(): Locale | null {
  if (typeof window === 'undefined') return null
  try {
    const value = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    return isLocale(value) ? value : null
  } catch {
    return null
  }
}

function readBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE
  const candidates = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
  ]
  for (const candidate of candidates) {
    const locale = localeFromLanguageTag(candidate)
    if (locale) return locale
  }
  return DEFAULT_LOCALE
}

/**
 * Runtime presentation locale. Persisted user preference wins over browser
 * language. This value is presentation-only and must never be used to infer
 * consumer jurisdiction, tax treatment, payment provider, or entitlement.
 */
export function getActiveLocale(): Locale {
  return readPersistedLocale() ?? readBrowserLocale()
}

/**
 * Persist or clear a presentation-locale override. Consumers using `useLocale`
 * / `useStrings` update in the same tab; the native `storage` event covers
 * cross-tab changes.
 */
export function setLocalePreference(locale: Locale | null): void {
  if (typeof window === 'undefined') return
  try {
    if (locale === null) {
      window.localStorage.removeItem(LOCALE_STORAGE_KEY)
    } else {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    }
  } catch {
    // Storage can be unavailable (privacy mode / restricted contexts). The
    // presentation fallback remains the browser locale; never fail the app.
  }
  window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT))
}

function subscribeLocale(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (event: StorageEvent) => {
    if (event.key === LOCALE_STORAGE_KEY || event.key === null) onStoreChange()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener('languagechange', onStoreChange)
  window.addEventListener(LOCALE_CHANGE_EVENT, onStoreChange)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('languagechange', onStoreChange)
    window.removeEventListener(LOCALE_CHANGE_EVENT, onStoreChange)
  }
}

/** Synchronous lookup — safe anywhere, but prefers `useStrings` in components. */
export function getStrings(locale: Locale = DEFAULT_LOCALE): AppStrings {
  return stringsByLocale[locale] ?? stringsByLocale[DEFAULT_LOCALE]
}

/** Active presentation locale for React components. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getActiveLocale, () => DEFAULT_LOCALE)
}

/**
 * Reactive component lookup. Without an explicit locale, strings follow the
 * active runtime presentation locale. Passing a locale remains available for
 * deliberately pinned content such as jurisdiction-specific evidence copy.
 */
export function useStrings(locale?: Locale): AppStrings {
  const activeLocale = useLocale()
  const resolvedLocale = locale ?? activeLocale
  return useMemo(() => getStrings(resolvedLocale), [resolvedLocale])
}
