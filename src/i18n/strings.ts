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
    plus: string
    plusName: string
    skipToContent: string
    openMenu: string
    closeMenu: string
    mobileMenuTitle: string
    about: string
  }
  language: {
    label: string
    options: Record<Locale, string>
  }
  appearance: {
    label: string
    system: string
    light: string
    dark: string
  }
  storefront: {
    catalog: string
    bookLabel: string
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
    concept: {
      badge: string
      headline: {
        opening: string
        examJapanese: string
        afterExam: string
        beforeWorkplace: string
        workplaceJapanese: string[]
        ending: string
      }
      support: string
      startLearning: string
      aboutPlatform: string
      visualLabel: string
      visualTitle: string
      visualBody: string
      journeyTitle: string
      journeySteps: Array<{ title: string; detail: string }>
      pillarsTitle: string
      pillars: Array<{ title: string; body: string }>
      valueTitle: string
      valueBody: string
    }
    featureLabel: string
    featureTitle: string
    samplesLabel: string
    samplesTitle: string
    selectionsLabel: string
    selectionsTitle: string
  }
  plus: {
    eyebrow: string
    lead: string
    priceLabel: string
    priceAmount: string
    pricePeriod: string
    priceDisclosure: string
    availabilityTitle: string
    availabilityBody: string
    audienceTitle: string
    audienceBody: string
    journeyTitle: string
    journeySteps: string[]
    valueTitle: string
    freeTitle: string
    freeBody: string
    plusTitle: string
    plusBody: string
    learningSystemTitle: string
    learningSystemBody: string
    surfacesTitle: string
    surfaces: Array<{ title: string; body: string }>
    accessTitle: string
    accessBody: string
    previewTitle: string
    previewBody: string
    freeLabel: string
    plusLabel: string
    freeAction: string
    memberAction: string
    states: {
      publicTitle: string
      publicBody: string
      checkingTitle: string
      checkingBody: string
      signedOutTitle: string
      signedOutBody: string
      nonMemberTitle: string
      nonMemberBody: string
      activeMemberTitle: string
      activeMemberBody: string
      unavailableTitle: string
      unavailableBody: string
      retry: string
    }
  }
  learningModes: {
    navigationLabel: string
    serviceLabel: string
    serviceTitle: string
    continueTitle: string
    modes: {
      learn: {
        title: string
        summary: string
        lead: string
      }
      read: {
        title: string
        summary: string
        lead: string
      }
      practice: {
        title: string
        summary: string
        lead: string
      }
      'my-learning': {
        title: string
        summary: string
        lead: string
      }
      experience: {
        title: string
        summary: string
        lead: string
      }
    }
    read: {
      capabilityTitle: string
      capabilityLead: string
      browseLibrary: string
    }
    experience: {
      capabilityTitle: string
      capabilityLead: string
      openCareerGame: string
    }
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
    legalLanguageFallback: string
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
    plus: 'Plus',
    plusName: 'Business Japanese Hub Plus',
    skipToContent: '本文へスキップ',
    openMenu: 'メニューを開く',
    closeMenu: 'メニューを閉じる',
    mobileMenuTitle: 'メニュー',
    about: '概要',
  },
  language: {
    label: '表示言語',
    options: { ja: '日本語', 'zh-TW': '繁體中文', 'zh-CN': '简体中文', en: 'English' },
  },
  appearance: {
    label: '外観',
    system: 'システム',
    light: 'ライト',
    dark: 'ダーク',
  },
  storefront: {
    catalog: 'すべての書籍',
    bookLabel: 'BOOK',
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
    lead: '日本求職から日本職場での成長まで、仕事で使える日本語能力を学び続けるためのサービスです。',
    concept: {
      badge: 'N1の先にある、日本語を学ぶ',
      headline: {
        opening: '「', examJapanese: '試験の日本語', afterExam: '」', beforeWorkplace: 'から「',
        workplaceJapanese: ['日本の', 'ビジネス社会で使う', '日本語'], ending: '」へ。',
      },
      support: '日本での就職、企業資料の読解、職場の会話へ。知っている日本語を、仕事で使える力につなげます。',
      startLearning: '学習を始める',
      aboutPlatform: 'サービスについて',
      visualLabel: 'JAPANESE AT WORK',
      visualTitle: '読む。考える。伝える。',
      visualBody: '仕事の文脈から、次に使える日本語を学ぶ。',
      journeyTitle: '仕事につながる学びの道筋',
      journeySteps: [
        { title: '商業資料を読む', detail: '企業・産業の情報を読む' },
        { title: '社会人語彙を知る', detail: '意味と使われ方をつかむ' },
        { title: '日本の仕事を理解する', detail: '職場や社会の背景を知る' },
        { title: '考えを伝え、話し合う', detail: '職場での対話につなげる' },
      ],
      pillarsTitle: '日本で働くための日本語を、4つの力から。',
      pillars: [
        { title: 'Business Reading', body: '公開中の日本語資料を読み、企業や商業の文脈をつかむ。' },
        { title: 'Professional Vocabulary', body: '仕事や社会で使われる語彙を、実際の文脈とともに知る。' },
        { title: 'Japan Literacy', body: '日本の職場、産業、ビジネス社会への理解を深める。' },
        { title: 'Business Discussion', body: '相手に伝わる表現を考え、仕事の対話へつなげる。' },
      ],
      valueTitle: '試験の先へ。日本語を仕事で生かす力に。',
      valueBody: '日本での就職準備、ビジネス資料の読解、入社後の職場への適応まで。実際の仕事の流れに沿って、日本語を学び続けられます。',
    },
    featureLabel: '本の構造',
    featureTitle: '実務で使う言葉を、文脈の中で読む',
    samplesLabel: '表現のサンプル',
    samplesTitle: '実際の文章と会話から学ぶ',
    selectionsLabel: '書籍からの選書',
    selectionsTitle: '公開中の書籍から、読む場所を選ぶ',
  },
  plus: {
    eyebrow: 'MEMBERSHIP',
    lead: '日本求職から入社後まで、学びの記録をつなぐ Business Japanese Hub のメンバーシップです。',
    priceLabel: 'Early Access',
    priceAmount: 'NT$299',
    pricePeriod: '/ 月',
    priceDisclosure: 'Early Access は月額のみです。年額プランは現在購入できません。料金や提供内容を自動で変更することはありません。',
    availabilityTitle: 'Early Access は準備中です',
    availabilityBody: '現在この画面から Plus の支払いはできません。実際に提供できる学習機能だけを表示し、確認できない会員状態では Plus コンテンツを解放しません。',
    audienceTitle: '対象となる方',
    audienceBody: 'JLPT N2〜N1 前後で、日本での就職、企業資料の読解、入社後の職場日本語を必要とする中国語話者の学習者。',
    journeyTitle: '日本での仕事につながる学び',
    journeySteps: ['日本での求職を準備する', '選考を通過する', '日本企業で働き始める', '職場の日本語を伸ばし続ける'],
    valueTitle: 'Free と Plus の役割',
    freeTitle: 'Free',
    freeBody: '公開された入口と学習コンテンツで、サービスと自分の課題を確かめられます。',
    plusTitle: 'Plus',
    plusBody: '対象の学習コンテンツと練習に加え、学習状態を継続的につなぐメンバーシップです。記事を増やすだけのプランではありません。',
    learningSystemTitle: 'Learning System を中心に',
    learningSystemBody: '間違いと復習、保存した表現、進捗、根拠のある弱点シグナル、次の一歩を、説明可能な学習状態としてつなぎます。十分な記録がない場合は、足りない状態を正直に表示します。',
    surfacesTitle: 'Plus の価値をつなぐ学習サーフェス',
    surfaces: [
      { title: 'Practice', body: 'Web Test や練習の履歴を、後から振り返れる学習状態へつなげます。' },
      { title: 'Read', body: '日本のビジネス情報や長文を、学習記録と結びつけます。' },
      { title: 'Learn / Work in Japan', body: '入社後の報連相、会議、文書など、職場で必要な学びを継続させます。' },
      { title: 'My Learning', body: 'それぞれの runtime が持つ本当の evidence だけを集約し、次の行動を示します。' },
    ],
    accessTitle: 'アクセス状態を正直に表示',
    accessBody: 'ブラウザのフラグではなく、サーバーが確認した会員状態だけで Plus のロックを解除します。確認できない場合は fail closed とし、会員状態を推測しません。',
    previewTitle: 'Plus プレビュー',
    previewBody: 'ロック中でも、どの学習領域が Plus の対象かを確認できます。本文や非公開の問題はここには表示しません。',
    freeLabel: 'FREE',
    plusLabel: 'PLUS',
    freeAction: '無料の学習を始める',
    memberAction: 'My Learning を見る',
    states: {
      publicTitle: 'Free で使える領域',
      publicBody: '公開コンテンツと無料の入口はそのまま利用できます。',
      checkingTitle: '会員状態を確認しています',
      checkingBody: 'サーバーの確認が終わるまで Plus コンテンツはロックされます。',
      signedOutTitle: 'ログインして会員状態を確認',
      signedOutBody: 'Plus のロックは、ログイン後にサーバーが確認した会員状態だけで解除されます。',
      nonMemberTitle: '現在は Free 状態です',
      nonMemberBody: 'このアカウントに有効な Plus 会員資格は確認できません。Early Access の支払いは、この画面ではまだ開始できません。',
      activeMemberTitle: 'Plus が有効です',
      activeMemberBody: 'このアカウントはサーバー上で有効な Plus 会員として確認されました。',
      unavailableTitle: '会員状態を確認できません',
      unavailableBody: '安全のため Plus コンテンツはロックしたままです。時間をおいてもう一度お試しください。',
      retry: 'もう一度確認する',
    },
  },

  learningModes: {
    navigationLabel: '学習モード',
    serviceLabel: '学習サービス',
    serviceTitle: '次に役立つ学び方を選ぶ',
    continueTitle: 'ほかのモードを見る',
    modes: {
      learn: {
        title: 'Learn',
        summary: '実際の職場場面から、使える判断力を身につける。',
        lead: '日本の職場で必要な判断・表現・背景を学びます。',
      },
      read: {
        title: 'Read',
        summary: '日本のビジネス情報と長文コンテンツを文脈の中で読む。',
        lead: '既存のライブラリとリーダーを通じて、日本語のビジネス情報を直接読みます。',
      },
      practice: {
        title: 'Practice',
        summary: '言語を職場の行動につなげる反復練習に取り組む。',
        lead: '反復できる想起と判断の練習を、ここから整備していきます。',
      },
      'my-learning': {
        title: 'My Learning',
        summary: '実際の進捗・復習・保存項目・次の一歩に戻る。',
        lead: '作られたスコアではなく、説明可能な実データから学習状態を育てます。',
      },
      experience: {
        title: 'Experience',
        summary: '具体的な物語の中で職場の判断を試し、その結果を知る。',
        lead: '独立してデプロイされる Career Game 職場シミュレーターへの入口です。',
      },
    },
    read: {
      capabilityTitle: '長文を読む',
      capabilityLead:
        '公開中の書籍を下の一覧から選び、Book の詳細から Reader で長文読書を始められます。個人の書籍と読書の進捗はマイライブラリで確認できます。',
      browseLibrary: 'マイライブラリを開く',
    },
    experience: {
      capabilityTitle: 'Career Game',
      capabilityLead: '独立した Experience ランタイムで、物語形式の職場ケースを通じて判断を試します。',
      openCareerGame: 'Career Game を開く',
    },
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
    legalLanguageFallback: 'この文書には簡体字中国語版がありません。以下に繁体字中国語の文書を表示しています。',
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
    plus: 'Plus',
    plusName: 'Business Japanese Hub Plus',
    skipToContent: 'Skip to content',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    mobileMenuTitle: 'Menu',
    about: 'About',
  },
  language: {
    label: 'Website language',
    options: { ja: '日本語', 'zh-TW': '繁體中文', 'zh-CN': '简体中文', en: 'English' },
  },
  appearance: {
    label: 'Appearance',
    system: 'System',
    light: 'Light',
    dark: 'Dark',
  },
  storefront: {
    catalog: 'All books',
    bookLabel: 'BOOK',
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
    lead: 'A learning service for Japanese job hunting, business reading, and growth in the workplace.',
    concept: {
      badge: 'Japanese learning beyond JLPT N1',
      headline: {
        opening: 'Move beyond ', examJapanese: 'Japanese for JLPT exams', afterExam: ' and', beforeWorkplace: ' into ',
        workplaceJapanese: ['the language of ', 'Japan’s business world'], ending: '.',
      },
      support: 'Build on the Japanese you know for job hunting, business reading, and communication at work in Japan.',
      startLearning: 'Start learning',
      aboutPlatform: 'About the platform',
      visualLabel: 'JAPANESE AT WORK',
      visualTitle: 'Read. Think. Communicate.',
      visualBody: 'Learn Japanese through the contexts where work happens.',
      journeyTitle: 'A learning path connected to work',
      journeySteps: [
        { title: 'Read business materials', detail: 'Explore company and industry information' },
        { title: 'Build professional vocabulary', detail: 'Understand meaning and use in context' },
        { title: 'Understand work in Japan', detail: 'Learn about workplace and social context' },
        { title: 'Share ideas and discuss', detail: 'Take part in workplace conversations' },
      ],
      pillarsTitle: 'Four ways to build Japanese for working in Japan.',
      pillars: [
        { title: 'Business Reading', body: 'Read public Japanese materials and understand their business context.' },
        { title: 'Professional Vocabulary', body: 'Learn the language of work and society in real contexts.' },
        { title: 'Japan Literacy', body: 'Understand Japanese workplaces, industries, and business society.' },
        { title: 'Business Discussion', body: 'Find clear ways to express ideas and take part in work conversations.' },
      ],
      valueTitle: 'Use Japanese as a skill for work, not only for exams.',
      valueBody: 'From preparing for a job in Japan and reading business materials to adapting after you join a company, keep learning along the real work journey.',
    },
    featureLabel: 'How the books are structured',
    featureTitle: 'Read workplace language in context.',
    samplesLabel: 'Expression samples',
    samplesTitle: 'Start with real sentences and conversations.',
    selectionsLabel: 'Selected from the books',
    selectionsTitle: 'Find a place to begin in the published books.',
  },
  plus: {
    eyebrow: 'MEMBERSHIP',
    lead: 'A membership that connects learning across Japanese job hunting, selection, and life after joining a company.',
    priceLabel: 'Early Access',
    priceAmount: 'NT$299',
    pricePeriod: '/ month',
    priceDisclosure: 'Early Access is monthly only. Annual billing is not currently available, and the price will not change automatically.',
    availabilityTitle: 'Early Access is being prepared',
    availabilityBody: 'Plus payment is not available from this page yet. We only describe learning features that can be delivered, and we keep Plus content locked when membership cannot be confirmed.',
    audienceTitle: 'Who it is for',
    audienceBody: 'Chinese-speaking learners around JLPT N2 to N1 who need Japanese for job hunting, reading business materials, or workplace communication after joining a Japanese company.',
    journeyTitle: 'Learning that follows the work journey',
    journeySteps: ['Prepare for a job in Japan', 'Move through the selection process', 'Start work at a Japanese company', 'Keep improving workplace Japanese'],
    valueTitle: 'How Free and Plus work together',
    freeTitle: 'Free',
    freeBody: 'Use public entry points and learning content to discover the service and identify what you need to work on.',
    plusTitle: 'Plus',
    plusBody: 'Beyond eligible learning content and practice, Plus is meant to connect your learning state over time. It is not only a plan for unlocking more articles.',
    learningSystemTitle: 'Built around the Learning System',
    learningSystemBody: 'Mistakes and review, saved expressions, progress, evidence-based weak-area signals, and the next useful step should form an explainable learning state. When there is not enough evidence, Plus should show that honestly.',
    surfacesTitle: 'Learning surfaces where Plus can add value',
    surfaces: [
      { title: 'Practice', body: 'Connect Web Test and practice history to a learning state you can review later.' },
      { title: 'Read', body: 'Connect Japanese business information and long-form reading to your learning record.' },
      { title: 'Learn / Work in Japan', body: 'Continue learning the reporting, meeting, document, and workplace skills needed after joining.' },
      { title: 'My Learning', body: 'Aggregate only real evidence from each runtime and make the next action explainable.' },
    ],
    accessTitle: 'Access states stay truthful',
    accessBody: 'Plus is unlocked only by membership state confirmed on the server, never by a browser flag. When status cannot be confirmed, the surface fails closed instead of guessing.',
    previewTitle: 'Plus preview',
    previewBody: 'Even while locked, you can see which learning areas are intended for Plus. Full member bodies and private questions are not shown here.',
    freeLabel: 'FREE',
    plusLabel: 'PLUS',
    freeAction: 'Start with free learning',
    memberAction: 'View My Learning',
    states: {
      publicTitle: 'Available for free',
      publicBody: 'Public content and free entry points remain available.',
      checkingTitle: 'Checking membership',
      checkingBody: 'Plus content stays locked until the server responds.',
      signedOutTitle: 'Sign in to check membership',
      signedOutBody: 'After sign-in, Plus unlocks only when the server confirms an active membership.',
      nonMemberTitle: 'Currently on Free access',
      nonMemberBody: 'No active Plus membership was found for this account. Early Access payment cannot be started from this page yet.',
      activeMemberTitle: 'Plus is active',
      activeMemberBody: 'This account has an active Plus membership confirmed by the server.',
      unavailableTitle: 'Membership status is unavailable',
      unavailableBody: 'Plus content stays locked for safety. Please try again later.',
      retry: 'Check again',
    },
  },

  learningModes: {
    navigationLabel: 'Learning modes',
    serviceLabel: 'Learning service',
    serviceTitle: 'Find your next useful mode',
    continueTitle: 'Continue exploring',
    modes: {
      learn: {
        title: 'Learn',
        summary: 'Build a workplace capability from a real situation to a usable decision.',
        lead: 'Study the judgment, language, and context behind Japanese workplace communication.',
      },
      read: {
        title: 'Read',
        summary: 'Read Japanese business information and long-form editorial content in context.',
        lead: 'Read business information directly in Japanese, with the existing Library and Reader as long-form paths.',
      },
      practice: {
        title: 'Practice',
        summary: 'Repeat retrieval and judgment practice that connects language to workplace action.',
        lead: 'Practice is the home for repeatable retrieval and judgment surfaces as they become available.',
      },
      'my-learning': {
        title: 'My Learning',
        summary: 'Return to real progress, review, saved items, and the next useful step.',
        lead: 'Your learning state will grow from real, explainable evidence rather than an invented score.',
      },
      experience: {
        title: 'Experience',
        summary: 'Apply workplace judgment in a concrete story and see the consequences.',
        lead: 'Experience is the gateway to the separately deployed Career Game workplace simulator.',
      },
    },
    read: {
      capabilityTitle: 'Long-form reading',
      capabilityLead:
        'Choose a published book from the catalog below to start long-form reading. Your owned books and reading progress remain available in My Library.',
      browseLibrary: 'Open My Library',
    },
    experience: {
      capabilityTitle: 'Career Game',
      capabilityLead: 'Follow the separate Experience runtime to apply workplace judgment in a story-driven case.',
      openCareerGame: 'Open Career Game',
    },
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
    legalLanguageFallback: 'This document is not available in Simplified Chinese. The existing Traditional Chinese version is shown below.',
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
    plus: 'Plus',
    plusName: 'Business Japanese Hub Plus',
    skipToContent: '跳到主要內容',
    openMenu: '開啟選單',
    closeMenu: '關閉選單',
    mobileMenuTitle: '選單',
    about: '關於',
  },
  language: {
    label: '顯示語言',
    options: { ja: '日本語', 'zh-TW': '繁體中文', 'zh-CN': '简体中文', en: 'English' },
  },
  appearance: {
    label: '外觀',
    system: '系統',
    light: '亮色',
    dark: '深色',
  },
  storefront: {
    catalog: '所有書籍',
    bookLabel: 'BOOK',
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
    lead: '從日本求職、商務閱讀到職場成長，持續學習工作中真正需要的日語能力。',
    concept: {
      badge: 'JLPT N1 之後，日文從這裡開始',
      headline: {
        opening: '從「', examJapanese: '日文檢定的日文', afterExam: '」，', beforeWorkplace: '成長為「',
        workplaceJapanese: ['日本商業社會', '的日文'], ending: '」。',
      },
      support: '通過 JLPT，不代表已經能自在地在日本職場工作。從求職、商業閱讀到職場溝通，把熟悉的日文轉化為工作能力。',
      startLearning: '開始學習商業日文',
      aboutPlatform: '了解這個平台',
      visualLabel: 'JAPANESE AT WORK',
      visualTitle: '閱讀・思考・溝通',
      visualBody: '從真實工作情境出發，探索下一步能用上的日文。',
      journeyTitle: '連結工作旅程的學習方向',
      journeySteps: [
        { title: '讀懂商業資料', detail: '閱讀企業與產業資訊' },
        { title: '理解社會人語彙', detail: '掌握詞語的意思與用法' },
        { title: '認識日本職場', detail: '理解工作與社會背景' },
        { title: '表達想法並參與討論', detail: '連結實際職場對話' },
      ],
      pillarsTitle: '從四種能力，繼續學習在日本工作所需的日文。',
      pillars: [
        { title: 'Business Reading', body: '閱讀公開的日本語資料，掌握企業與商業脈絡。' },
        { title: 'Professional Vocabulary', body: '在真實語境中理解工作與社會使用的語彙。' },
        { title: 'Japan Literacy', body: '認識日本職場、產業與商業社會的背景。' },
        { title: 'Business Discussion', body: '思考清楚傳達的方式，參與職場對話。' },
      ],
      valueTitle: '不只學會日文，而是讓日文成為你的工作能力。',
      valueBody: '從準備日本求職、閱讀商業資料，到進入企業後適應職場，讓進階日文學習貼近真實的工作旅程。',
    },
    featureLabel: '書本結構',
    featureTitle: '在真實脈絡中閱讀職場日語',
    samplesLabel: '表達範例',
    samplesTitle: '從實際句子與對話開始學習',
    selectionsLabel: '書籍選讀',
    selectionsTitle: '從已公開的書籍中，找到開始閱讀的位置',
  },
  plus: {
    eyebrow: 'MEMBERSHIP',
    lead: '從日本求職、選考到入社後，把學習狀態串起來的 Business Japanese Hub 會員方案。',
    priceLabel: 'Early Access',
    priceAmount: 'NT$299',
    pricePeriod: '/ 月',
    priceDisclosure: 'Early Access 目前僅提供月繳，年繳尚未開放購買。價格與提供內容不會自動變更。',
    availabilityTitle: 'Early Access 正在準備中',
    availabilityBody: '目前還不能在此頁開始 Plus 付款。這裡只會說明實際可提供的學習功能；無法確認會員狀態時，Plus 內容會維持鎖定。',
    audienceTitle: '適合誰',
    audienceBody: '日文程度約 JLPT N2 至 N1，正在準備日本求職、閱讀日本企業資料，或需要適應入社後職場日文的華語學習者。',
    journeyTitle: '跟著日本工作旅程累積',
    journeySteps: ['準備日本求職', '通過選考', '進入日本企業', '持續提升職場日文'],
    valueTitle: 'Free 與 Plus 如何一起運作',
    freeTitle: 'Free',
    freeBody: '透過公開入口與學習內容，先認識服務並確認自己真正需要加強的地方。',
    plusTitle: 'Plus',
    plusBody: '除了符合資格的學習內容與練習，Plus 的核心是持續串起你的學習狀態，而不是只解鎖更多文章。',
    learningSystemTitle: '以 Learning System 為核心',
    learningSystemBody: '錯題與複習、已儲存表達、進度、有證據支持的弱點訊號，以及下一步，應該形成可解釋的學習狀態。資料不足時，Plus 也會誠實顯示不足，而不是製造假進度。',
    surfacesTitle: 'Plus 可以串起價值的學習 surface',
    surfaces: [
      { title: 'Practice', body: '把 Web Test 與練習紀錄連到之後可以回顧的學習狀態。' },
      { title: 'Read', body: '把日本商務資訊與長篇閱讀連到你的學習紀錄。' },
      { title: 'Learn / Work in Japan', body: '持續學習入社後的報連相、會議、文件與職場溝通。' },
      { title: 'My Learning', body: '只彙整各 runtime 真正存在的 evidence，並解釋下一個有用行動。' },
    ],
    accessTitle: '忠實呈現存取狀態',
    accessBody: 'Plus 只會依伺服器確認的會員狀態解鎖，不會相信瀏覽器旗標。無法確認狀態時會 fail closed，不會猜測你是否具備會員資格。',
    previewTitle: 'Plus 預覽',
    previewBody: '即使內容鎖定，你仍能看到哪些學習區域屬於 Plus。完整會員內容與私有題目不會顯示在這裡。',
    freeLabel: 'FREE',
    plusLabel: 'PLUS',
    freeAction: '先從免費學習開始',
    memberAction: '查看 My Learning',
    states: {
      publicTitle: '目前可免費使用',
      publicBody: '公開內容與免費入口維持可用。',
      checkingTitle: '正在確認會員狀態',
      checkingBody: '在伺服器回覆前，Plus 內容會維持鎖定。',
      signedOutTitle: '登入後確認會員狀態',
      signedOutBody: '登入後，只有伺服器確認的有效會員資格才能解除 Plus 鎖定。',
      nonMemberTitle: '目前是 Free 狀態',
      nonMemberBody: '這個帳號目前沒有有效的 Plus 會員資格。Early Access 付款尚未在此頁開放。',
      activeMemberTitle: 'Plus 已啟用',
      activeMemberBody: '伺服器已確認這個帳號具有有效的 Plus 會員資格。',
      unavailableTitle: '目前無法確認會員狀態',
      unavailableBody: '為安全起見，Plus 內容維持鎖定。請稍後再試。',
      retry: '重新確認',
    },
  },

  learningModes: {
    navigationLabel: '學習模式',
    serviceLabel: '學習服務',
    serviceTitle: '選擇下一個有用的學習模式',
    continueTitle: '繼續探索',
    modes: {
      learn: {
        title: 'Learn',
        summary: '從真實情境培養能用於職場的判斷力。',
        lead: '學習日本職場溝通背後的判斷、語言與脈絡。',
      },
      read: {
        title: 'Read',
        summary: '在脈絡中閱讀日本商務資訊與長篇內容。',
        lead: '透過既有書庫與閱讀器，直接閱讀日文商務資訊與長篇內容。',
      },
      practice: {
        title: 'Practice',
        summary: '反覆練習提取與判斷，將語言連結到職場行動。',
        lead: '這裡會逐步提供可反覆使用的提取與判斷練習。',
      },
      'my-learning': {
        title: 'My Learning',
        summary: '回到真實進度、複習、已儲存項目與下一個有用步驟。',
        lead: '以可解釋的真實紀錄培養學習狀態，而不是虛構的分數。',
      },
      experience: {
        title: 'Experience',
        summary: '在具體故事中應用職場判斷，了解不同選擇的結果。',
        lead: '前往獨立部署的 Career Game 職場模擬器，體驗故事中的判斷。',
      },
    },
    read: {
      capabilityTitle: '長篇閱讀',
      capabilityLead:
        '從下方的公開書籍目錄選擇書籍，開始長篇閱讀；已擁有的書籍與閱讀進度仍可在我的書庫查看。',
      browseLibrary: '開啟我的書庫',
    },
    experience: {
      capabilityTitle: 'Career Game',
      capabilityLead: '前往獨立的 Experience 執行環境，透過故事化職場個案應用判斷力。',
      openCareerGame: '開啟 Career Game',
    },
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
    legalLanguageFallback: '本文件沒有簡體中文版本。以下顯示現有的繁體中文版本。',
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

// Mainland Chinese is a localized shell overlay on the existing
// Traditional Chinese resource. Deeper UI that has not been localized yet has
// a deterministic zh-TW fallback; legal documents use their own defined set.
const zhCN: AppStrings = {
  ...zhTW,
  app: { name: '商务日语中心', tagline: '学习商务日语的平台' },
  nav: {
    main: '主导航', home: '首页', library: '我的书库', plus: 'Plus',
    plusName: 'Business Japanese Hub Plus', skipToContent: '跳到主要内容',
    openMenu: '打开菜单', closeMenu: '关闭菜单', mobileMenuTitle: '菜单', about: '关于',
  },
  language: {
    label: '显示语言',
    options: { ja: '日本語', 'zh-TW': '繁體中文', 'zh-CN': '简体中文', en: 'English' },
  },
  appearance: { label: '外观', system: '跟随系统', light: '浅色', dark: '深色' },
  storefront: {
    ...zhTW.storefront,
    catalog: '全部书籍', viewDetails: '查看详情', featured: '精选内容', free: '免费', owned: '已拥有',
    practiceKicker: '在实践中应用', practiceTitle: '把阅读所得转化为职场判断',
    practiceLead: '在 Career Game 的职场案例中做出判断，并了解可能带来的结果。', playCase: '开始案例',
  },
  home: {
    title: '商务日语中心',
    lead: '从日本求职、商务阅读到职场成长，持续学习工作中真正需要的日语能力。',
    concept: {
      badge: 'JLPT N1 之后，日语从这里开始',
      headline: {
        opening: '从「', examJapanese: '日语考试中的日语', afterExam: '」，', beforeWorkplace: '成长为「',
        workplaceJapanese: ['日本商业社会', '中的日语'], ending: '」。',
      },
      support: '通过 JLPT，不代表已经能自在地在日本职场工作。从求职、商业阅读到职场沟通，把熟悉的日语转化为工作能力。',
      startLearning: '开始学习商务日语',
      aboutPlatform: '了解这个平台',
      visualLabel: 'JAPANESE AT WORK',
      visualTitle: '阅读・思考・沟通',
      visualBody: '从真实工作情境出发，探索下一步能用上的日语。',
      journeyTitle: '连接工作旅程的学习方向',
      journeySteps: [
        { title: '读懂商业资料', detail: '阅读企业与行业信息' },
        { title: '理解职场词汇', detail: '掌握词语的含义与用法' },
        { title: '认识日本职场', detail: '理解工作与社会背景' },
        { title: '表达想法并参与讨论', detail: '连接实际职场对话' },
      ],
      pillarsTitle: '从四种能力，继续学习在日本工作所需的日语。',
      pillars: [
        { title: 'Business Reading', body: '阅读公开的日语资料，理解企业与商业语境。' },
        { title: 'Professional Vocabulary', body: '在真实语境中理解工作与社会使用的词汇。' },
        { title: 'Japan Literacy', body: '认识日本职场、产业与商业社会背景。' },
        { title: 'Business Discussion', body: '思考清晰表达的方式，参与职场对话。' },
      ],
      valueTitle: '不只学会日语，也让日语成为你的工作能力。',
      valueBody: '从准备日本求职、阅读商业资料，到进入企业后适应职场，让进阶日语学习贴近真实的工作旅程。',
    },
    featureLabel: '内容结构', featureTitle: '在真实语境中阅读职场日语',
    samplesLabel: '表达示例', samplesTitle: '从真实句子与对话开始学习',
    selectionsLabel: '精选书籍', selectionsTitle: '从已发布的书籍中找到阅读起点',
  },
  footer: { note: '© 商务日语中心' },
  learningModes: {
    ...zhTW.learningModes,
    navigationLabel: '学习模式', serviceLabel: '学习服务', serviceTitle: '选择下一步适合的学习模式',
    continueTitle: '继续探索',
    modes: {
      learn: { ...zhTW.learningModes.modes.learn, summary: '从真实情境中培养可用于职场的判断力。', lead: '学习日本职场沟通背后的判断、语言与语境。' },
      read: { ...zhTW.learningModes.modes.read, summary: '结合语境阅读日本商业信息与长篇内容。', lead: '通过现有书库与阅读器直接阅读日文商业信息和长篇内容。' },
      practice: { ...zhTW.learningModes.modes.practice, summary: '反复练习提取与判断，把语言能力用于职场行动。', lead: '这里将逐步提供可重复使用的提取与判断练习。' },
      'my-learning': { ...zhTW.learningModes.modes['my-learning'], summary: '回到真实进度、复习内容、已保存项目和下一步。', lead: '根据可解释的真实记录了解学习状态，不使用虚构分数。' },
      experience: { ...zhTW.learningModes.modes.experience, summary: '在具体故事中运用职场判断，并了解不同选择的结果。', lead: '前往独立运行的 Career Game 职场模拟器，在故事中做出判断。' },
    },
  },
  legal: {
    title: '法律信息', lead: '本平台的服务条款、隐私政策及法定披露信息。', documentsLabel: '文件列表',
    documentNotFound: '找不到指定文件。', backToIndex: '返回法律信息',
    draftNotice: '本页内容为草稿，尚未经法律专业人士审阅，内容可能变更。',
    legalLanguageFallback: '本文件暂无简体中文版本，以下显示现有的繁體中文文件。',
    versionLabel: '版本', statusLabel: '状态', statusDraft: '草稿', statusReview: '审核中', statusLive: '已发布',
    revisedLabel: '修订日期', footerLabel: '法律信息', sellerDisclosureLabel: '销售方：',
    sellerDisclosurePending: '登记名称待确认',
  },
  auth: {
    ...zhTW.auth,
    account: '账户', signIn: '登录', createAccount: '创建账户', signOut: '退出登录',
    email: '电子邮箱', password: '密码', submitSignIn: '登录并继续', submitSignUp: '创建账户并继续',
    cancel: '关闭', switchToSignIn: '已有账户？登录', switchToSignUp: '首次使用？创建账户',
    failure: '身份验证失败，请检查输入信息。', confirmationSent: '确认邮件已发送。',
    authRequired: '请登录后继续。', loading: '正在加载…',
  },
}

const stringsByLocale: Record<Locale, AppStrings> = {
  ja,
  en,
  'zh-TW': zhTW,
  'zh-CN': zhCN,
}

export const LOCALE_STORAGE_KEY = 'business-japanese-hub.locale'
const LOCALE_CHANGE_EVENT = 'business-japanese-hub:locale-change'
// If browser storage is unavailable, retain the user's choice for this tab.
// `undefined` means there is no volatile override; `null` means clear it.
let volatileLocaleOverride: Locale | null | undefined

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
  if (
    normalized === 'zh-cn' ||
    normalized === 'zh-sg' ||
    normalized.startsWith('zh-hans')
  ) {
    return 'zh-CN'
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
  return volatileLocaleOverride !== undefined
    ? volatileLocaleOverride ?? readBrowserLocale()
    : readPersistedLocale() ?? readBrowserLocale()
}

/**
 * Persist or clear a presentation-locale override. Consumers using `useLocale`
 * / `useStrings` update in the same tab; the native `storage` event covers
 * cross-tab changes.
 */
export function setLocalePreference(locale: Locale | null): void {
  if (typeof window === 'undefined') return
  let persisted = true
  try {
    if (locale === null) {
      window.localStorage.removeItem(LOCALE_STORAGE_KEY)
    } else {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    }
  } catch {
    persisted = false
  }
  volatileLocaleOverride = persisted ? undefined : locale
  window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT))
}

function subscribeLocale(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (event: StorageEvent) => {
    if (event.key === LOCALE_STORAGE_KEY || event.key === null) {
      // A cross-tab storage update supersedes any same-tab fallback choice.
      volatileLocaleOverride = undefined
      onStoreChange()
    }
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
