import type { Book } from '../types';
import { SCHEMA_VERSION } from '../types';

/**
 * Second fixture book — the generic-content proof for issue #6.
 *
 * Like `sample-book.ts` this is deliberately a SAMPLE FIXTURE, not real
 * product content. It exists so the storefront / book detail / library can be
 * proven book-agnostic with more than one book: a different topic (business
 * email rather than keigo), a paid tier with a preview boundary (see the
 * catalog entry in src/reader/catalog.ts), and a portrait cover ratio. No
 * platform code depends on this file or its topic.
 *
 * Pure data: no React, no product-specific code path. Typed `Book` so any
 * invalid field is a compile-time error.
 */
export const secondBook: Book = {
  schemaVersion: SCHEMA_VERSION,
  id: 'book-sample-bj-email',
  slug: 'email-manners',
  title: 'ビジネスメールの作法',
  subtitle: '取引先との信頼を築く文面づくり',
  language: 'ja',
  description:
    '件名、冒頭、依頼、締めまで。取引先とやり取りする際に必要なビジネスメールの基本を、' +
    '実例とともに整理したサンプルフィクスチャです。実際の商品書籍ではありません。',
  authors: [
    {
      id: 'author-sample-email',
      name: 'メール 花子',
      role: 'author',
      bio: 'サンプル用の架空の著者です。',
      website: 'https://example.com/authors/hanako-email',
    },
  ],
  cover: {
    src: '/images/email-cover.svg',
    alt: '「ビジネスメールの作法」の表紙イメージ',
    credit: 'sample-fixture',
    width: 900,
    height: 1200,
  },
  edition: { number: 1, label: '第1版', year: 2026 },
  publication: { status: 'published', releasedAt: '2026-08-01' },
  price: { tier: 'paid', amount: 660, currency: 'JPY' },
  audience: {
    levels: ['intermediate', 'advanced'],
    languages: ['zh-TW', 'en'],
    description: 'ビジネスメールの書き方に自信がないビジネスパーソンを想定したサンプルです。',
  },
  difficulty: { level: 3, label: '中級', description: '中級レベル（実務での応用を想定）' },
  tableOfContents: {
    entries: [
      { chapterId: 'bm-ch-1', title: 'メールの基本構成' },
      { chapterId: 'bm-ch-2', title: '件名と冒頭の作法' },
      { chapterId: 'bm-ch-3', title: '依頼と締めの表現' },
    ],
  },
  tags: ['business-email', 'business-japanese', 'sample-fixture'],
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
