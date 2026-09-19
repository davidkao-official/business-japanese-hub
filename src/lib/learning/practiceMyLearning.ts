export const MAX_PRACTICE_LEARNING_ATTEMPTS = 50

export type PracticeDomain = 'verbal' | 'nonverbal'
export type PracticeMode = 'untimed-learning' | 'timed-practice'

export interface PracticeEvidenceRow {
  contentId: string
  contentRevision: string
  questionId: string
  questionVersion: number
  testFamily: 'spi'
  domain: PracticeDomain
  category: string
  practiceMode: PracticeMode
  correct: boolean
  createdAt: string
}

export interface PracticeReviewItem {
  contentId: string
  contentRevision: string
  questionId: string
  questionVersion: number
  testFamily: 'spi'
  domain: PracticeDomain
  category: string
  practiceMode: PracticeMode
  createdAt: string
}

export type PracticeAvailability = Omit<PracticeReviewItem, 'createdAt'>

export interface PracticeWeakArea {
  domain: PracticeDomain
  category: string
  sampleCount: number
  incorrectCount: number
  accuracyPercent: number
  latestAt: string
}

export type PracticeNextAction =
  | { kind: 'review-mistake'; item: PracticeReviewItem }
  | { kind: 'continue-practice'; item: PracticeReviewItem }
  | { kind: 'start-practice' }

export interface PracticeLearningSnapshot {
  recentAttempts: PracticeEvidenceRow[]
  actionableMistakes: PracticeReviewItem[]
  weakArea: PracticeWeakArea | null
  nextAction: PracticeNextAction
}

function validText(value: unknown, maxLength = 128): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength && value.trim() === value
}

function validRevision(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

function validVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function validIdentity(value: {
  contentId?: unknown
  contentRevision?: unknown
  questionId?: unknown
  questionVersion?: unknown
  testFamily?: unknown
  domain?: unknown
  category?: unknown
  practiceMode?: unknown
}): value is Omit<PracticeReviewItem, 'createdAt'> {
  return validText(value.contentId) && validRevision(value.contentRevision) && validText(value.questionId) &&
    validVersion(value.questionVersion) && value.testFamily === 'spi' &&
    (value.domain === 'verbal' || value.domain === 'nonverbal') && validText(value.category) &&
    (value.practiceMode === 'untimed-learning' || value.practiceMode === 'timed-practice')
}

function validAttempt(value: PracticeEvidenceRow): boolean {
  return validIdentity(value) && typeof value.correct === 'boolean' && validDate(value.createdAt)
}

function validReview(value: PracticeReviewItem): boolean {
  return validIdentity(value) && validDate(value.createdAt)
}

function sortByRecent<T extends { createdAt: string; questionId: string }>(left: T, right: T): number {
  const byDate = Date.parse(right.createdAt) - Date.parse(left.createdAt)
  if (byDate !== 0) return byDate
  return left.questionId.localeCompare(right.questionId, 'en')
}

function samePracticeCategory(attempt: PracticeEvidenceRow, availability: PracticeAvailability): boolean {
  return attempt.contentId === availability.contentId && attempt.testFamily === availability.testFamily &&
    attempt.domain === availability.domain && attempt.category === availability.category &&
    attempt.practiceMode === availability.practiceMode
}

function weakAreaFor(attempts: PracticeEvidenceRow[]): PracticeWeakArea | null {
  const groups = new Map<string, {
    domain: PracticeDomain
    category: string
    sampleCount: number
    incorrectCount: number
    latestAt: string
  }>()
  for (const attempt of attempts) {
    const key = `${attempt.domain}\0${attempt.category}`
    const group = groups.get(key) ?? {
      domain: attempt.domain,
      category: attempt.category,
      sampleCount: 0,
      incorrectCount: 0,
      latestAt: attempt.createdAt,
    }
    group.sampleCount += 1
    if (!attempt.correct) group.incorrectCount += 1
    if (Date.parse(attempt.createdAt) > Date.parse(group.latestAt)) group.latestAt = attempt.createdAt
    groups.set(key, group)
  }

  const eligible = [...groups.values()].filter((group) => group.sampleCount >= 5 && group.incorrectCount >= 2)
  eligible.sort((left, right) => {
    const accuracyOrder = right.incorrectCount * left.sampleCount - left.incorrectCount * right.sampleCount
    if (accuracyOrder !== 0) return accuracyOrder
    if (left.sampleCount !== right.sampleCount) return right.sampleCount - left.sampleCount
    const recentOrder = Date.parse(right.latestAt) - Date.parse(left.latestAt)
    if (recentOrder !== 0) return recentOrder
    return `${left.domain}\0${left.category}`.localeCompare(`${right.domain}\0${right.category}`, 'en')
  })
  const selected = eligible[0]
  if (!selected) return null
  return {
    ...selected,
    accuracyPercent: Math.round(((selected.sampleCount - selected.incorrectCount) / selected.sampleCount) * 100),
  }
}

export function projectPracticeLearningSnapshot(
  attempts: PracticeEvidenceRow[],
  reviewQueue: PracticeReviewItem[],
  currentAvailability: PracticeAvailability[],
): PracticeLearningSnapshot {
  const recentAttempts = attempts.filter(validAttempt).sort(sortByRecent).slice(0, MAX_PRACTICE_LEARNING_ATTEMPTS)
  const actionableMistakes = reviewQueue.filter(validReview).sort(sortByRecent).slice(0, MAX_PRACTICE_LEARNING_ATTEMPTS)
  const current = currentAvailability.filter(validIdentity)
  const latestCurrentAttempt = recentAttempts.find((attempt) => current.some((item) => samePracticeCategory(attempt, item)))
  const continuation = latestCurrentAttempt
    ? current.find((item) => samePracticeCategory(latestCurrentAttempt, item))
    : undefined
  const nextAction: PracticeNextAction = actionableMistakes[0]
    ? { kind: 'review-mistake', item: actionableMistakes[0] }
    : continuation
      ? { kind: 'continue-practice', item: { ...continuation, createdAt: latestCurrentAttempt!.createdAt } }
      : { kind: 'start-practice' }

  return {
    recentAttempts,
    actionableMistakes,
    weakArea: weakAreaFor(recentAttempts),
    nextAction,
  }
}

export function practiceRunnerHref(item: PracticeReviewItem, review = false): string {
  const base = `/practice/web-test/${encodeURIComponent(item.testFamily)}/${encodeURIComponent(item.domain)}/${encodeURIComponent(item.category)}`
  const query = new URLSearchParams({ mode: item.practiceMode })
  if (review) {
    query.set('review', item.questionId)
    query.set('reviewVersion', String(item.questionVersion))
  }
  return `${base}?${query.toString()}`
}
