/**
 * Bounded Learn presentation registry.
 *
 * This holds only the route identity and presentation data needed by the one
 * admitted #110 slice. It is not a platform-wide content pipeline, a learning
 * event model, or persistent learning state.
 */
export type LearningTextLanguage = 'zh-TW' | 'ja' | 'en'

export interface LearningText {
  readonly text: string
  readonly lang: LearningTextLanguage
}

export type LearningTextBlock = readonly LearningText[]

export interface LearningUnitStep {
  readonly number: string
  readonly title: LearningText
  readonly body: LearningTextBlock
}

export interface LearningPracticeCard {
  readonly label: LearningText
  readonly title: LearningTextBlock
  readonly body: LearningTextBlock
}

export interface LearningUnitRouteData {
  readonly learnSlug: string
  readonly practiceSlug: string
  readonly title: string
  readonly courseLabel: string
  readonly gateway: {
    readonly title: LearningText
    readonly summary: LearningTextBlock
    readonly linkSummary: LearningTextBlock
  }
  readonly learn: {
    readonly lead: LearningTextBlock
    readonly sequence: LearningText
    readonly steps: readonly LearningUnitStep[]
    readonly transfer: {
      readonly label: LearningText
      readonly title: LearningText
      readonly body: LearningTextBlock
    }
    readonly practiceAction: LearningTextBlock
    readonly backAction: LearningTextBlock
  }
  readonly practice: {
    readonly title: LearningTextBlock
    readonly lead: LearningTextBlock
    readonly cards: readonly LearningPracticeCard[]
    readonly backAction: LearningTextBlock
  }
}

export const COURSE_CORRECTION_LEARN_SLUG = 'meeting-course-correction'
export const COURSE_CORRECTION_PRACTICE_SLUG = 'course-correction'

const LEARNING_UNITS: readonly LearningUnitRouteData[] = [
  {
    learnSlug: COURSE_CORRECTION_LEARN_SLUG,
    practiceSlug: COURSE_CORRECTION_PRACTICE_SLUG,
    title: '議論を本筋に戻す',
    courseLabel: 'Course Correction',
    gateway: {
      title: { text: '會議中的議論整理', lang: 'zh-TW' },
      summary: [
        {
          text: '從具體的會議場面，學習如何在保留對話關係的同時，把討論帶回主要論點。',
          lang: 'zh-TW',
        },
      ],
      linkSummary: [
        { text: '承接對方的觀點，再 ', lang: 'zh-TW' },
        { text: 'pivot', lang: 'en' },
        { text: ' 回到可作決定的主題。', lang: 'zh-TW' },
      ],
    },
    learn: {
      lead: [
        {
          text: '會議討論偏離主題時，先承接對方的意見，再把大家帶回可以做判斷與決定的主線。',
          lang: 'zh-TW',
        },
      ],
      sequence: { text: '承接 → Pivot → 收斂', lang: 'zh-TW' },
      steps: [
        {
          number: '01',
          title: { text: '承接', lang: 'zh-TW' },
          body: [
            { text: '先讓對方的關切被聽見，明確指出你接住的是哪個觀點。', lang: 'zh-TW' },
          ],
        },
        {
          number: '02',
          title: { text: 'Pivot', lang: 'en' },
          body: [
            { text: '使用「', lang: 'zh-TW' },
            { text: 'その点を踏まえて', lang: 'ja' },
            { text: '」等緩衝表達，把注意力轉回本次會議的目的。', lang: 'zh-TW' },
          ],
        },
        {
          number: '03',
          title: { text: '收斂', lang: 'zh-TW' },
          body: [
            { text: '確認下一個要決定的問題、負責人與時限，讓討論留下可執行的出口。', lang: 'zh-TW' },
          ],
        },
      ],
      transfer: {
        label: { text: 'Transfer to work', lang: 'en' },
        title: { text: '把語言選擇連回職場判斷', lang: 'zh-TW' },
        body: [
          { text: 'Course correction', lang: 'en' },
          {
            text: ' 的重點不是打斷別人，而是保留關係、重新標定議題，並讓團隊知道現在要收斂到哪個決定。',
            lang: 'zh-TW',
          },
        ],
      },
      practiceAction: [
        { text: '前往 ', lang: 'zh-TW' },
        { text: 'Practice', lang: 'en' },
        { text: '：練習改寫', lang: 'zh-TW' },
      ],
      backAction: [
        { text: '返回 ', lang: 'zh-TW' },
        { text: 'Learn', lang: 'en' },
      ],
    },
    practice: {
      title: [
        { text: '議論を本筋に戻す：', lang: 'ja' },
        { text: 'Practice', lang: 'en' },
      ],
      lead: [
        { text: '在可重複的 ', lang: 'zh-TW' },
        { text: 'situational', lang: 'en' },
        { text: ' 練習中，判斷哪一句話能承接對方、轉回主線，並完成收斂。', lang: 'zh-TW' },
      ],
      cards: [
        {
          label: { text: 'Situational', lang: 'en' },
          title: [{ text: '場面：討論開始發散', lang: 'zh-TW' }],
          body: [
            {
              text: '會議成員提出了重要但不屬於本次議題的問題。先辨識誰在意什麼，再決定如何保留這個關切。',
              lang: 'zh-TW',
            },
          ],
        },
        {
          label: { text: 'Rewrite', lang: 'en' },
          title: [
            { text: '書き換え', lang: 'ja' },
            { text: '：調整語氣與焦點', lang: 'zh-TW' },
          ],
          body: [
            { text: '將直接的「', lang: 'zh-TW' },
            { text: 'それは今回の議題ではありません', lang: 'ja' },
            { text: '」改寫成能承接、', lang: 'zh-TW' },
            { text: 'pivot', lang: 'en' },
            { text: '，再提出下一步的職場表達。', lang: 'zh-TW' },
          ],
        },
        {
          label: { text: 'Authority & context', lang: 'en' },
          title: [{ text: '立場與上下關係', lang: 'zh-TW' }],
          body: [
            {
              text: '依照對方是主管、同儕或跨部門夥伴，調整 ',
              lang: 'zh-TW',
            },
            { text: 'cushion', lang: 'en' },
            { text: '、直接程度與請對方做決定的方式。', lang: 'zh-TW' },
          ],
        },
      ],
      backAction: [
        { text: '回到 ', lang: 'zh-TW' },
        { text: 'Learn unit', lang: 'en' },
      ],
    },
  },
]

export function getLearningUnitByLearnSlug(
  slug: string | undefined,
): LearningUnitRouteData | undefined {
  return LEARNING_UNITS.find((unit) => unit.learnSlug === slug)
}

export function getLearningUnitByPracticeSlug(
  slug: string | undefined,
): LearningUnitRouteData | undefined {
  return LEARNING_UNITS.find((unit) => unit.practiceSlug === slug)
}
