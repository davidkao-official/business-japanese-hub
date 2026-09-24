import type { ReadingRuntimeItem } from '../types.ts'

/** Original fictional teaching sample. This is not sourced from a real company or publication. */
export const sampleReadingItem: ReadingRuntimeItem = {
  schemaVersion: 1,
  id: 'reading-sample-internal-proposal',
  slug: 'sample-internal-proposal',
  title: '從內部提案看日本商務資料的論點安排',
  summary: '以原創架空的日文提案摘要，練習辨認現況、措施與預期效果。',
  category: 'business-document',
  tags: ['argument-structure', 'proposal-reading'],
  access: 'free',
  source: { type: 'original', label: '原創架空商業文件・教學範例' },
  japaneseMaterial: {
    kind: 'original',
    text: '現在、問い合わせへの回答に平均三日を要している。まず質問の分類表を作成し、担当部署を明確にする。これにより、回答時間を短縮し、顧客対応の質を安定させる。',
  },
  explanationZhTW: '這段提案先指出目前的問題，再提出兩項做法，最後說明預期效果。閱讀時可留意「現在」如何引出現況，以及「これにより」如何把措施連到結果。',
  vocabulary: [
    { term: '問い合わせ', reading: 'といあわせ', meaningZhTW: '詢問、洽詢', noteZhTW: '商務文件中常指客戶或其他部門提出的問題。' },
    { term: '担当部署', reading: 'たんとうぶしょ', meaningZhTW: '負責部門', noteZhTW: '指出由哪個部門承接處理。' },
    { term: '安定させる', reading: 'あんていさせる', meaningZhTW: '使之穩定', noteZhTW: '此處描述讓服務品質維持一致。' },
  ],
  logicAnalysis: [
    { label: '現況與課題', japaneseText: '問い合わせへの回答に平均三日を要している。', explanationZhTW: '先用可觀察的時間資訊呈現問題，讓改善理由具體化。' },
    { label: '措施與效果', japaneseText: 'これにより、回答時間を短縮し…', explanationZhTW: '「これにより」回指前面的措施，接著交代預期效果。' },
  ],
  businessContextZhTW: '架空提案以縮短回覆時間為目標。真實企業資料通常還會說明統計期間、責任分工與衡量方式；本範例沒有引用任何真實公司或出版資料。',
  relatedLinks: [
    { kind: 'learn', label: '論點如何在會議中承接與轉換', targetId: 'meeting-japanese-course-correction' },
  ],
  seo: {
    title: '日本商務資料讀解：提案的論點安排｜Business Japanese Hub',
    description: '透過原創架空的日文商務提案，練習閱讀現況、措施與預期效果。',
  },
  sampleLabel: 'non-proprietary-teaching-sample',
}
