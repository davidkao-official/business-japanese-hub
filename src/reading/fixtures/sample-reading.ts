import type { ReadingRuntimeItem } from '../types.ts'

/** Original fictional sample; Japanese core and metadata are first-principles drafts pending independent content-quality review. */
export const sampleReadingItem: ReadingRuntimeItem = {
  schemaVersion: 2,
  id: 'reading-sample-internal-proposal',
  slug: 'sample-internal-proposal',
  title: '社内提案に見る論点の組み立て方',
  summary: '架空の提案文を読み、現状・施策・期待される効果のつながりを捉えます。',
  category: 'business-document',
  tags: ['argument-structure', 'proposal-reading'],
  access: 'free',
  source: { type: 'original', label: '架空の社内文書・学習用サンプル' },
  japaneseMaterial: {
    kind: 'original',
    text: '現在、問い合わせへの回答に平均三日を要している。まず質問の分類表を作成し、担当部署を明確にする。これにより、回答時間を短縮し、顧客対応の質を安定させる。',
  },
  explanationJa: 'この提案は、最初に現在の問題を示し、次に二つの施策を挙げ、最後に期待される効果を述べています。「現在」は現状を提示し、「これにより」は施策と結果を結び付けています。',
  vocabulary: [
    { term: '問い合わせ', reading: 'といあわせ', meaningJa: '相手に質問や確認を求めること。', noteJa: '顧客や別の部署から寄せられる質問を指します。' },
    { term: '担当部署', reading: 'たんとうぶしょ', meaningJa: 'ある業務を受け持つ部署。', noteJa: 'この文では、問い合わせへの対応を担う部署です。' },
    { term: '安定させる', reading: 'あんていさせる', meaningJa: '変動を抑え、一定の状態に保つ。', noteJa: 'ここでは、顧客対応の質を一定に保つことを表します。' },
  ],
  logicAnalysis: [
    { label: '現状と課題', japaneseText: '問い合わせへの回答に平均三日を要している。', explanationJa: '平均三日という観察可能な情報で、改善が必要な理由を具体的に示しています。' },
    { label: '施策と効果', japaneseText: 'これにより、回答時間を短縮し…', explanationJa: '「これにより」は直前の施策を受け、その施策から期待される結果へ話を進めています。' },
  ],
  businessContextJa: 'この架空の提案は、回答時間の短縮を目指しています。実際の社内資料では、対象期間、担当範囲、効果の測定方法も示すと、施策の妥当性を確かめやすくなります。この例は実在の企業や出版物を参照していません。',
  supportOverlays: {
    byLocale: {
      'zh-TW': {
        explanation: '這段提案先指出目前的問題，再提出兩項做法，最後說明預期效果。閱讀時可留意「現在」如何引出現況，以及「これにより」如何把措施連到結果。',
        businessContext: '架空提案以縮短回覆時間為目標。真實企業資料通常還會說明統計期間、責任分工與衡量方式；本範例沒有引用任何真實公司或出版資料。',
        vocabulary: [
          { term: '問い合わせ', meaning: '詢問、洽詢', note: '商務文件中常指客戶或其他部門提出的問題。' },
          { term: '担当部署', meaning: '負責部門', note: '指出由哪個部門承接處理。' },
          { term: '安定させる', meaning: '使之穩定', note: '此處描述讓服務品質維持一致。' },
        ],
        logicAnalysis: [
          { label: '現況與課題', explanation: '先用可觀察的時間資訊呈現問題，讓改善理由具體化。' },
          { label: '措施與效果', explanation: '「これにより」回指前面的措施，接著交代預期效果。' },
        ],
      },
    },
  },
  relatedLinks: [
    { kind: 'learn', label: '会議で論点を受けて展開する', targetId: 'meeting-japanese-course-correction' },
  ],
  seo: {
    title: 'ビジネス文書読解：提案の論点構成｜Business Japanese Hub',
    description: '架空の社内提案を読み、現状・施策・期待される効果の関係を学びます。',
  },
  sampleLabel: 'non-proprietary-teaching-sample',
}
