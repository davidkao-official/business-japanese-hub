import type { Book } from '../types';
import { SCHEMA_VERSION } from '../types';

/**
 * Paid synthetic fixtures — TEST-ONLY, never registered in the platform catalog.
 *
 * These deliberately synthetic paid books exist so the entitlement / access
 * tests can keep exercising the paid tier: paid preview boundaries, ReaderGate
 * denial, owned access, and the §8.3 CTA matrix. They intentionally retain
 * "sample" / fictional-author metadata because they are never shown to a real
 * visitor — the public-facing Prototype catalog uses the free prototype books
 * (sample-book.ts / second-book.ts) instead.
 *
 * The platform catalog (src/reader/catalog.ts) must NOT import these. Access
 * tests that need a paid book in the catalog route use `vi.mock` over the
 * catalog module and resolve these fixtures.
 */
export const paidKeigoBook: Book = {
  schemaVersion: SCHEMA_VERSION,
  id: 'book-test-paid-keigo',
  slug: 'keigo-essentials',
  title: 'ビジネス日本語：敬語の基礎（テスト用）',
  subtitle: '職場で使える尊敬語・謙譲語・丁寧語',
  language: 'ja',
  description:
    'テスト専用の有料フィクスチャです。プレビュー境界とエンタイトルメントの動作確認に使います。実際の商品書籍ではありません。',
  authors: [
    {
      id: 'author-test-keigo',
      name: 'テスト 太郎',
      role: 'author',
      bio: 'テスト用の架空の著者です。',
      website: 'https://example.com/authors/test-taro',
    },
  ],
  cover: {
    src: '/images/keigo-cover.svg',
    alt: '「敬語の基礎」の表紙イメージ',
    caption: 'テスト用表紙',
    credit: 'test-fixture',
    width: 1200,
    height: 800,
  },
  edition: { number: 1, label: '第1版', year: 2026 },
  publication: { status: 'draft' },
  price: { tier: 'paid', amount: 880, currency: 'JPY' },
  audience: {
    levels: ['beginner', 'intermediate'],
    languages: ['zh-TW', 'en'],
    description: 'テスト用の有料書籍です。',
  },
  difficulty: { level: 2, label: '初級', description: '初級後半から中級前半' },
  tableOfContents: {
    entries: [
      { chapterId: 'ch-1', title: '敬語の基本' },
      { chapterId: 'ch-2', title: '会議での敬語' },
      { chapterId: 'ch-3', title: '練習問題' },
    ],
  },
  tags: ['keigo', 'business-japanese', 'test-fixture'],
  chapters: [
    {
      id: 'ch-1',
      slug: 'keigo-basics',
      order: 1,
      title: '敬語の基本',
      subtitle: '尊敬語・謙譲語・丁寧語の整理',
      summary: '敬語の三分類と、それぞれを使う場面を学びます。',
      navigation: { next: 'ch-2' },
      blocks: [
        { id: 'ch1-blk-01', type: 'heading', text: '敬語とは', level: 2 },
        {
          id: 'ch1-blk-02',
          type: 'paragraph',
          text: '敬語は、相手や場面に合わせて言葉を整える仕組みです。ビジネスでは、相手への敬意と距離感を正しく伝えるために欠かせません。',
        },
        {
          id: 'ch1-blk-03',
          type: 'callout',
          kind: 'note',
          title: 'ポイント',
          text: '敬語は「誰が、誰に向かって、何を」するかを常に意識して使い分けます。',
        },
        {
          id: 'ch1-blk-04',
          type: 'vocabulary',
          term: '敬語',
          reading: 'けいご',
          meaning: '相手への敬意を表す言葉遣いの総称。',
          partOfSpeech: '名詞',
          example: '敬語を使うと、相手に丁寧な印象を与えます。',
        },
        {
          id: 'ch1-blk-05',
          type: 'comparison',
          title: '敬語の三分類',
          rows: [
            { label: '尊敬語', points: ['相手の動作に敬意を表す', '例：いらっしゃる、おっしゃる'] },
            { label: '謙譲語', points: ['自分や身内の動作をへりくだって表す', '例：参る、申す'] },
            { label: '丁寧語', points: ['聞き手に丁寧さを表す', '例：です・ます調'] },
          ],
        },
        {
          id: 'ch1-blk-06',
          type: 'quote',
          text: '言葉は心の届け物。敬語はその包装紙である。',
          attribution: 'テスト書籍の例文',
        },
        {
          id: 'ch1-blk-07',
          type: 'authorNote',
          author: 'テスト 太郎',
          title: '著者から',
          text: '最初は難しく感じますが、三分類を頭に入れるだけで見通しが大きく変わります。',
        },
      ],
    },
    {
      id: 'ch-2',
      slug: 'keigo-in-meetings',
      order: 2,
      title: '会議での敬語',
      subtitle: '打ち合わせで使う表現',
      summary: '会議の進行に沿って使える敬語表現を学びます。',
      navigation: { previous: 'ch-1', next: 'ch-3' },
      blocks: [
        { id: 'ch2-blk-01', type: 'heading', text: '会議の進行', level: 2 },
        {
          id: 'ch2-blk-02',
          type: 'paragraph',
          text: '会議では、発言のきっかけ、確認、締めくくりなど、場面ごとに自然な敬語表現があります。',
        },
        {
          id: 'ch2-blk-03',
          type: 'dialogue',
          context: '会議で上司と部下がやり取りをする場面',
          lines: [
            { speaker: '部長', text: 'では、本日の議題について、佐藤さんから説明をお願いします。' },
            { speaker: '佐藤', text: 'かしこまりました。まず、先月の進捗からご報告いたします。', note: '謙譲語を使っています。' },
            { speaker: '部長', text: 'ありがとうございます。質疑はあとでまとめて受け付けます。' },
          ],
        },
        {
          id: 'ch2-blk-04',
          type: 'doDont',
          title: '会議での言葉遣い',
          do: [
            '発言の前に「ご質問よろしいでしょうか」と確認する',
            '相手の意見を「なるほど、おっしゃる通りですね」と受け止める',
          ],
          dont: ['「えっと」「あのー」を多用する', '上司の意見をそのまま否定する'],
        },
        {
          id: 'ch2-blk-05',
          type: 'table',
          caption: '場面別の敬語表現',
          columns: ['場面', '丁寧な表現', 'カジュアル'],
          rows: [
            ['依頼', 'お手数をおかけしますが、ご確認のほどよろしくお願いいたします。', '確認してね。'],
            ['許可を求める', '〜していただいてもよろしいでしょうか。', '〜していい？'],
            ['謝罪', '大変申し訳ございませんでした。', 'ごめんね。'],
          ],
        },
        {
          id: 'ch2-blk-06',
          type: 'caseStudy',
          title: 'ケーススタディ：初めての議長',
          scenario: '新人の林さんが初めて会議の議長を務めることになりました。',
          questions: [
            '会議の開始時にどんな一言を添えるとよいでしょうか。',
            '発言が止まったときのフォローはどうするべきでしょうか。',
          ],
          outcome: '開始時に「本日はお忙しい中お集まりいただき、ありがとうございます」と一言添えると好印象です。',
        },
      ],
    },
    {
      id: 'ch-3',
      slug: 'practice',
      order: 3,
      title: '練習問題',
      subtitle: 'これまでの内容を確認しよう',
      summary: '選択問題と書き換え問題で知識を確認します。',
      navigation: { previous: 'ch-2' },
      blocks: [
        { id: 'ch3-blk-01', type: 'heading', text: '問題', level: 2 },
        {
          id: 'ch3-blk-02',
          type: 'exercise',
          question: '「行く」の尊敬語として正しいものを選んでください。',
          hint: '相手の動作を表すときは尊敬語を使います。',
          options: ['参る', 'いらっしゃる', '申す', '伺う'],
          answer: 'いらっしゃる',
          explanation: '「参る」「申す」「伺う」は謙譲語（自分の動作）です。',
        },
        {
          id: 'ch3-blk-03',
          type: 'exercise',
          question: '次の文を丁寧語の形に書き換えてください：「資料を見る」。',
          answer: '資料をご覧ください。',
          explanation: '「ご覧ください」は丁寧な依頼表現の一つです。',
        },
        {
          id: 'ch3-blk-04',
          type: 'example',
          text: 'お忙しいところ恐れ入りますが、明日までにご確認のほどお願い申し上げます。',
          translation: '麻煩您百忙之中抽空，麻煩請在明天前確認。',
          note: '依頼の場面で使える丁寧な定型表現です。',
        },
        {
          id: 'ch3-blk-05',
          type: 'image',
          src: '/images/keigo-pyramid.svg',
          alt: '敬語の三分類を示すピラミッド図',
          caption: '敬語のピラミッド：丁寧語を土台に、尊敬語・謙譲語を組み合わせます。',
          credit: 'test-fixture',
          width: 800,
          height: 600,
        },
      ],
    },
  ],
};

export const paidEmailBook: Book = {
  schemaVersion: SCHEMA_VERSION,
  id: 'book-test-paid-email',
  slug: 'email-manners',
  title: 'ビジネスメールの作法（テスト用）',
  subtitle: '取引先との信頼を築く文面づくり',
  language: 'ja',
  description:
    'テスト専用の有料フィクスチャです。プレビュー境界とエンタイトルメントの動作確認に使います。実際の商品書籍ではありません。',
  authors: [
    {
      id: 'author-test-email',
      name: 'テスト 花子',
      role: 'author',
      bio: 'テスト用の架空の著者です。',
      website: 'https://example.com/authors/test-hanako',
    },
  ],
  cover: {
    src: '/images/email-cover.svg',
    alt: '「ビジネスメールの作法」の表紙イメージ',
    credit: 'test-fixture',
    width: 900,
    height: 1200,
  },
  edition: { number: 1, label: '第1版', year: 2026 },
  publication: { status: 'published', releasedAt: '2026-08-01' },
  price: { tier: 'paid', amount: 660, currency: 'JPY' },
  audience: {
    levels: ['intermediate', 'advanced'],
    languages: ['zh-TW', 'en'],
    description: 'テスト用の有料書籍です。',
  },
  difficulty: { level: 3, label: '中級', description: '中級レベル（実務での応用を想定）' },
  tableOfContents: {
    entries: [
      { chapterId: 'bm-ch-1', title: 'メールの基本構成' },
      { chapterId: 'bm-ch-2', title: '件名と冒頭の作法' },
      { chapterId: 'bm-ch-3', title: '依頼と締めの表現' },
    ],
  },
  tags: ['business-email', 'business-japanese', 'test-fixture'],
  chapters: [
    {
      id: 'bm-ch-1',
      slug: 'email-basics',
      order: 1,
      title: 'メールの基本構成',
      subtitle: '読み手を迷わせない文章の骨格',
      summary: 'ビジネスメールの構成と、用件を伝えるための基本を学びます。',
      navigation: { next: 'bm-ch-2' },
      blocks: [
        { id: 'bm-ch1-blk-01', type: 'heading', text: 'メールの四つの要素', level: 2 },
        {
          id: 'bm-ch1-blk-02',
          type: 'paragraph',
          text: 'ビジネスメールは、件名・冒頭・本文・締めの四つの要素から成り立ちます。それぞれの役割を意識すると、読み手が迷わずに用件までたどり着けます。',
        },
        {
          id: 'bm-ch1-blk-03',
          type: 'example',
          text: '件名：【ご確認】8月分の請求書送付のお願い',
          translation: '主旨を先頭に置き、用件がひと目で分かる件名にします。',
          note: '「【ご確認】」のような前置きは、緊急度と用件を伝えるのに有効です。',
        },
        {
          id: 'bm-ch1-blk-04',
          type: 'callout',
          kind: 'note',
          title: 'ポイント',
          text: '一つのメールで伝える用件は、できるだけ一つに絞ります。',
        },
      ],
    },
    {
      id: 'bm-ch-2',
      slug: 'subject-and-opening',
      order: 2,
      title: '件名と冒頭の作法',
      subtitle: '最初の一行で信頼を決める',
      summary: '件名のつけ方と、宛名・挨拶の定形表現を学びます。',
      navigation: { previous: 'bm-ch-1', next: 'bm-ch-3' },
      blocks: [
        { id: 'bm-ch2-blk-01', type: 'heading', text: '件名に用件を載せる', level: 2 },
        {
          id: 'bm-ch2-blk-02',
          type: 'paragraph',
          text: '件名だけを読んでも用件が分かるように書きます。「お願い」「ご連絡」「ご相談」など、用件の種類を表す言葉を入れると親切です。',
        },
        {
          id: 'bm-ch2-blk-03',
          type: 'doDont',
          title: '件名の書き方',
          do: ['用件を表す言葉を入れる', '相手が知っている固有名詞（案件名など）を含める'],
          dont: ['「ご連絡です」のように中身の見えない件名にする', '本文にしか書かれていない情報を件名に使う'],
        },
        {
          id: 'bm-ch2-blk-04',
          type: 'paragraph',
          text: '冒頭は宛名から始め、時候の挨拶は簡潔に。「平素よりお世話になっております」のような定形表現を使うと、丁寧で安定した印象になります。',
        },
      ],
    },
    {
      id: 'bm-ch-3',
      slug: 'requests-and-closings',
      order: 3,
      title: '依頼と締めの表現',
      subtitle: '相手に動いてもらうための言葉',
      summary: '依頼を丁寧に伝え、締めまで読み手に心地よい印象を残す表現を学びます。',
      navigation: { previous: 'bm-ch-2' },
      blocks: [
        { id: 'bm-ch3-blk-01', type: 'heading', text: '依頼の定型表現', level: 2 },
        {
          id: 'bm-ch3-blk-02',
          type: 'paragraph',
          text: '依頼は、用件と期限をはっきり伝えたうえで「お願いいたします」で締めます。相手の都合を尋ねる場合は「ご都合のよい日時をご教示いただけますでしょうか」のようにやわらかく表現します。',
        },
        {
          id: 'bm-ch3-blk-03',
          type: 'example',
          text: 'お手数をおかけしますが、ご確認のほどよろしくお願いいたします。',
          translation: '麻煩您確認，謝謝。',
          note: '依頼を締めくくる定番表現です。',
        },
        {
          id: 'bm-ch3-blk-04',
          type: 'exercise',
          question: '「資料を確認してほしい」を、依頼の定型表現で書き換えてください。',
          hint: '「〜のほどよろしくお願いいたします」を使うと丁寧です。',
          answer: '資料のご確認のほど、よろしくお願いいたします。',
          explanation: '「〜のほど」を挟むことで、依頼がやわらかく伝わります。',
        },
      ],
    },
  ],
};
