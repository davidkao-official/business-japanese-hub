import type { Book } from '../types';
import { SCHEMA_VERSION } from '../types';

/**
 * Sample fixture book used by tests and documentation.
 *
 * This is deliberately a SAMPLE FIXTURE, not real product content: the topic
 * ("business Japanese": 敬語・会議) was chosen so the data reads naturally and
 * exercises every supported block type. The content model itself is
 * topic-agnostic and must never depend on this file.
 *
 * This file is pure data: no React, no JSX, no product-specific code path.
 * It is typed `Book` so any invalid field is a compile-time error.
 */
export const sampleBook: Book = {
  schemaVersion: SCHEMA_VERSION,
  id: 'book-sample-bj-keigo',
  slug: 'keigo-essentials',
  title: 'ビジネス日本語：敬語の基礎',
  subtitle: '職場で使える尊敬語・謙譲語・丁寧語',
  language: 'ja',
  description:
    'この書籍は content model の動作確認用サンプルフィクスチャです。' +
    '実際の商品書籍ではなく、敬語というテーマを使って全ブロック種別を網羅しています。',
  authors: [
    {
      id: 'author-sample',
      name: 'サンプル 太郎',
      role: 'author',
      bio: 'サンプル用の架空の著者です。',
      website: 'https://example.com/authors/sample-taro',
    },
  ],
  cover: {
    src: '/images/keigo-cover.svg',
    alt: '「敬語の基礎」の表紙イメージ',
    caption: 'サンプル表紙',
    credit: 'sample-fixture',
    width: 1200,
    height: 800,
  },
  edition: { number: 1, label: '第1版', year: 2026 },
  publication: { status: 'draft' },
  // Paid with a chapter-1 preview boundary, matching the authoring manifest
  // (books/keigo-essentials/manifest.json): chapter 1 is the free preview and
  // the rest is paid content.
  price: { tier: 'paid', amount: 880, currency: 'JPY' },
  audience: {
    levels: ['beginner', 'intermediate'],
    languages: ['zh-TW', 'en'],
    description: '日本語を学ぶビジネスパーソンを想定したサンプルです。',
  },
  difficulty: { level: 2, label: '初級', description: '初級後半から中級前半' },
  tableOfContents: {
    entries: [
      { chapterId: 'ch-1', title: '敬語の基本' },
      { chapterId: 'ch-2', title: '会議での敬語' },
      { chapterId: 'ch-3', title: '練習問題' },
    ],
  },
  tags: ['keigo', 'business-japanese', 'sample-fixture'],
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
          attribution: 'サンプル書籍の例文',
        },
        {
          id: 'ch1-blk-07',
          type: 'authorNote',
          author: 'サンプル 太郎',
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
          credit: 'sample-fixture',
          width: 800,
          height: 600,
        },
      ],
    },
  ],
};
