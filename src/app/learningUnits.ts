import { getBookBySlug } from '../reader/catalog'
import type {
  CalloutBlock,
  Chapter,
  ExerciseBlock,
  ParagraphBlock,
  TableBlock,
} from '../content/types'

/**
 * Bounded Learn presentation data for the admitted #110 slice.
 *
 * The unit is projected from the released Book/chapter below. The route UI
 * labels stay local to this presentation seam; this is not a universal
 * content model, learning event schema, or persistence layer.
 */
export type LearningTextLanguage = 'zh-TW' | 'ja' | 'en'

export interface LearningText {
  readonly text: string
  readonly lang: LearningTextLanguage
}

export type LearningTextBlock = readonly LearningText[]

export interface LearningUnitStep {
  readonly number: string
  readonly title: LearningTextBlock
  readonly body: LearningTextBlock
}

export interface LearningPracticeExercise {
  readonly id: string
  readonly question: LearningTextBlock
  readonly options: readonly LearningTextBlock[]
  readonly hint?: LearningTextBlock
  readonly answer?: LearningTextBlock
  readonly explanation?: LearningTextBlock
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
    readonly sequence: LearningTextBlock
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
    readonly activityLabel: LearningText
    readonly exercises: readonly LearningPracticeExercise[]
    readonly backAction: LearningTextBlock
  }
}

const ADMITTED_BOOK_SLUG = 'meeting-japanese'
const ADMITTED_CHAPTER_SLUG = 'course-correction'
const admittedBook = getBookBySlug(ADMITTED_BOOK_SLUG)
const admittedChapter = admittedBook?.chapters.find(
  (chapter) => chapter.slug === ADMITTED_CHAPTER_SLUG,
)

export const COURSE_CORRECTION_LEARN_SLUG = admittedBook && admittedChapter
  ? `${admittedBook.slug}-${admittedChapter.slug}`
  : ''
export const COURSE_CORRECTION_PRACTICE_SLUG = admittedChapter?.slug ?? ''

function asText(text: string, lang: LearningTextLanguage): LearningText {
  return { text, lang }
}

function asBlock(text: string, lang: LearningTextLanguage): LearningTextBlock {
  return [asText(text, lang)]
}

function sourceLanguage(language: string): LearningTextLanguage {
  if (language === 'zh-TW' || language === 'en') return language
  return 'ja'
}

function firstParagraph(chapter: Chapter): ParagraphBlock | undefined {
  return chapter.blocks.find((block): block is ParagraphBlock => block.type === 'paragraph')
}

function firstCallout(chapter: Chapter): CalloutBlock | undefined {
  return chapter.blocks.find((block): block is CalloutBlock => block.type === 'callout')
}

function firstTable(chapter: Chapter): TableBlock | undefined {
  return chapter.blocks.find((block): block is TableBlock => block.type === 'table')
}

function mixedPivotText(text: string): LearningTextBlock {
  const pivotIndex = text.indexOf('Pivot')
  if (pivotIndex < 0) return asBlock(text, 'zh-TW')

  return [
    asText(text.slice(0, pivotIndex), 'zh-TW'),
    asText('Pivot', 'en'),
    asText(text.slice(pivotIndex + 'Pivot'.length), 'zh-TW'),
  ]
}

function titleCaseSlug(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const ENGLISH_RUN_PATTERN = /[A-Za-z][A-Za-z0-9]*(?:['’/-][A-Za-z0-9]+)*/g

type AuthoredTextField = 'exercise' | 'japanese-step-title'

function inferAuthoredLanguage(
  text: string,
  fallback: LearningTextLanguage,
  field: AuthoredTextField,
): LearningTextLanguage {
  if (
    field === 'exercise' &&
    fallback === 'ja' &&
    /[\u3400-\u9fff]/.test(text) &&
    !/[\u3040-\u30ff]/.test(text)
  ) {
    return 'zh-TW'
  }
  return fallback
}

function appendTextPart(
  parts: LearningText[],
  text: string,
  language: LearningTextLanguage,
): void {
  if (!text) return
  const previous = parts.at(-1)
  if (previous?.lang === language) {
    parts[parts.length - 1] = asText(`${previous.text}${text}`, language)
    return
  }
  parts.push(asText(text, language))
}

/**
 * Project authored prose into accessible language runs. The release model
 * stores each field as a string, so this narrow seam keeps embedded English
 * terms separate while recognizing Chinese exercise support prose without
 * making the content model aware of presentation languages.
 */
function projectAuthoredText(
  text: string,
  fallback: LearningTextLanguage,
  field: AuthoredTextField = 'exercise',
): LearningTextBlock {
  const baseLanguage = inferAuthoredLanguage(text, fallback, field)
  const parts: LearningText[] = []
  let cursor = 0

  for (const match of text.matchAll(ENGLISH_RUN_PATTERN)) {
    const index = match.index ?? cursor
    const prefix = text.slice(cursor, index)
    const prefixLanguage = /^\s*$/.test(prefix) && parts.at(-1)?.lang === 'en'
      ? 'en'
      : baseLanguage
    appendTextPart(parts, prefix, prefixLanguage)
    appendTextPart(parts, match[0], 'en')
    cursor = index + match[0].length
  }

  appendTextPart(parts, text.slice(cursor), baseLanguage)
  return parts.length > 0 ? parts : [asText(text, baseLanguage)]
}

function projectExercise(block: ExerciseBlock, language: LearningTextLanguage): LearningPracticeExercise {
  return {
    id: block.id,
    question: projectAuthoredText(block.question, language),
    options: (block.options ?? []).map((option) => projectAuthoredText(option, language)),
    hint: block.hint ? projectAuthoredText(block.hint, language) : undefined,
    answer: block.answer ? projectAuthoredText(block.answer, language) : undefined,
    explanation: block.explanation ? projectAuthoredText(block.explanation, language) : undefined,
  }
}

function createAdmittedLearningUnit(): LearningUnitRouteData | undefined {
  if (!admittedBook || !admittedChapter || !admittedChapter.subtitle || !admittedChapter.summary) {
    return undefined
  }

  const callout = firstCallout(admittedChapter)
  const stepTable = firstTable(admittedChapter)
  const intro = firstParagraph(admittedChapter)
  const exercises = admittedChapter.blocks.filter(
    (block): block is ExerciseBlock => block.type === 'exercise',
  )
  if (
    !callout?.title ||
    !callout.text ||
    !stepTable ||
    stepTable.rows.length === 0 ||
    stepTable.rows.some((row) => row.length < 3) ||
    exercises.length === 0
  ) {
    return undefined
  }

  const language = sourceLanguage(admittedBook.language)
  const steps = stepTable.rows.slice(0, 3).map((row, index) => ({
    number: String(index + 1).padStart(2, '0'),
    title: projectAuthoredText(row[0], language, 'japanese-step-title'),
    body: [asText(row[1], language), asText(` ${row[2]}`, language)],
  }))

  return {
    learnSlug: `${admittedBook.slug}-${admittedChapter.slug}`,
    practiceSlug: admittedChapter.slug,
    title: admittedChapter.title,
    courseLabel: titleCaseSlug(admittedChapter.slug),
    gateway: {
      title: asText(admittedChapter.title, language),
      summary: asBlock(admittedChapter.summary, language),
      linkSummary: asBlock(admittedChapter.subtitle, language),
    },
    learn: {
      lead: asBlock(intro?.text ?? admittedChapter.summary, language),
      sequence: mixedPivotText(callout.title),
      steps,
      transfer: {
        label: asText('Transfer to work', 'en'),
        title: asText(admittedChapter.subtitle, language),
        body: asBlock(callout.text, 'zh-TW'),
      },
      practiceAction: [
        asText('前往 ', 'zh-TW'),
        asText('Practice', 'en'),
        asText('：練習改寫', 'zh-TW'),
      ],
      backAction: [asText('返回 ', 'zh-TW'), asText('Learn', 'en')],
    },
    practice: {
      title: [asText(`${admittedChapter.title}：`, language), asText('Practice', 'en')],
      lead: asBlock(admittedChapter.summary, language),
      activityLabel: asText('Situational practice', 'en'),
      exercises: exercises.map((exercise) => projectExercise(exercise, language)),
      backAction: [asText('回到 ', 'zh-TW'), asText('Learn unit', 'en')],
    },
  }
}

const admittedLearningUnit = createAdmittedLearningUnit()
const LEARNING_UNITS: readonly LearningUnitRouteData[] = admittedLearningUnit
  ? [admittedLearningUnit]
  : []

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
