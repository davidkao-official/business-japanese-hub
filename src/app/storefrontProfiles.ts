export interface PublicProfileLanguage {
  label: string
  language: 'zh-TW' | 'ja' | 'en'
}

export interface PublicProfile {
  heading: string
  credentials: readonly string[]
  language: 'zh-TW'
  languages?: readonly PublicProfileLanguage[]
}

/**
 * Public-facing profile copy approved in GitHub Issue #70.
 * Keep these claims verbatim unless the issue receives a new explicit approval.
 */
export const FOUNDER_PROFILE: PublicProfile = {
  heading: '創辦人｜David Kao',
  credentials: [
    '高中時期通過 JLPT N1',
    '通過台灣國家考試，取得日語導遊、日語領隊資格',
    '大學期間累積日文家教及中日口譯經驗',
    '於日本取得 MBA（工商管理碩士）',
    '四大日本法人 Business Consultant 經歷',
    '透過日本高度人才制度取得日本永久居留資格',
  ],
  language: 'zh-TW',
  languages: [
    { label: '繁體中文', language: 'zh-TW' },
    { label: '日本語', language: 'ja' },
    { label: 'English', language: 'en' },
  ],
}

export const COFOUNDER_PROFILE: PublicProfile = {
  heading: '共同創辦人｜塔奇巧克力（TachikoChoko）',
  credentials: [
    '曾於直播平台「初樂（TrueLoveLive）」擔任後端工程師',
    '曾於冰角工作室擔任後端 Lead，主要負責後端系統開發',
    '長期關注資料庫效能優化、查詢速度與系統架構等後端工程議題',
    '名字中的「塔奇」取自《攻殼機動隊》的塔奇克馬',
    '現居東京，並於東京的語言學校學習日文',
    '以工程師與日語學習者的雙重視角，參與 Business Japanese Hub 的產品與技術開發',
  ],
  language: 'zh-TW',
}
