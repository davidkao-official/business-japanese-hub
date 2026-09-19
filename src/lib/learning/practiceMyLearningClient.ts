import type {
  PracticeEvidenceRow,
  PracticeLearningSnapshot,
  PracticeReviewItem,
  PracticeWeakArea,
} from './practiceMyLearning'

export type PracticeLearningFetchResult =
  | { kind: 'ok'; snapshot: PracticeLearningSnapshot }
  | { kind: 'signed-out' | 'non-member' | 'unavailable' }

function functionsBaseUrl(): string | null {
  const explicit = import.meta.env.VITE_EDGE_FUNCTIONS_BASE_URL as string | undefined
  const supabase = import.meta.env.VITE_SUPABASE_URL as string | undefined
  return (explicit || (supabase ? `${supabase.replace(/\/+$/, '')}/functions/v1` : '')).replace(/\/+$/, '') || null
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function validAttempt(value: unknown): value is PracticeEvidenceRow {
  if (!record(value) || !exactKeys(value, ['contentId', 'contentRevision', 'questionId', 'questionVersion', 'testFamily', 'domain', 'category', 'practiceMode', 'correct', 'createdAt'])) return false
  return typeof value.contentId === 'string' && typeof value.contentRevision === 'string' &&
    typeof value.questionId === 'string' && typeof value.questionVersion === 'number' && value.questionVersion > 0 &&
    value.testFamily === 'spi' && (value.domain === 'verbal' || value.domain === 'nonverbal') &&
    typeof value.category === 'string' && (value.practiceMode === 'untimed-learning' || value.practiceMode === 'timed-practice') &&
    typeof value.correct === 'boolean' && typeof value.createdAt === 'string'
}

function validReview(value: unknown): value is PracticeReviewItem {
  if (!record(value) || !exactKeys(value, ['contentId', 'contentRevision', 'questionId', 'questionVersion', 'testFamily', 'domain', 'category', 'practiceMode', 'createdAt'])) return false
  return typeof value.contentId === 'string' && typeof value.contentRevision === 'string' &&
    typeof value.questionId === 'string' && typeof value.questionVersion === 'number' && value.questionVersion > 0 &&
    value.testFamily === 'spi' && (value.domain === 'verbal' || value.domain === 'nonverbal') &&
    typeof value.category === 'string' && (value.practiceMode === 'untimed-learning' || value.practiceMode === 'timed-practice') &&
    typeof value.createdAt === 'string'
}

function validWeakArea(value: unknown): value is PracticeWeakArea {
  if (!record(value) || !exactKeys(value, ['domain', 'category', 'sampleCount', 'incorrectCount', 'accuracyPercent', 'latestAt'])) return false
  return (value.domain === 'verbal' || value.domain === 'nonverbal') && typeof value.category === 'string' &&
    typeof value.sampleCount === 'number' && value.sampleCount >= 5 && typeof value.incorrectCount === 'number' &&
    value.incorrectCount >= 2 && typeof value.accuracyPercent === 'number' && typeof value.latestAt === 'string'
}

function validSnapshot(value: unknown): value is PracticeLearningSnapshot {
  if (!record(value) || !exactKeys(value, ['recentAttempts', 'actionableMistakes', 'weakArea', 'nextAction']) ||
    !Array.isArray(value.recentAttempts) || !value.recentAttempts.every(validAttempt) ||
    !Array.isArray(value.actionableMistakes) || !value.actionableMistakes.every(validReview)) return false
  if (value.weakArea !== null && !validWeakArea(value.weakArea)) return false
  if (!record(value.nextAction) || typeof value.nextAction.kind !== 'string') return false
  if (value.nextAction.kind === 'start-practice') return exactKeys(value.nextAction, ['kind'])
  return (value.nextAction.kind === 'review-mistake' || value.nextAction.kind === 'continue-practice') &&
    exactKeys(value.nextAction, ['kind', 'item']) && validReview(value.nextAction.item)
}

export async function fetchPracticeLearningSnapshot(
  getAccessToken: () => Promise<string | null>,
): Promise<PracticeLearningFetchResult> {
  let token: string | null
  try {
    token = await getAccessToken()
  } catch {
    return { kind: 'unavailable' }
  }
  if (!token) return { kind: 'signed-out' }
  const base = functionsBaseUrl()
  if (!base) return { kind: 'unavailable' }
  try {
    const response = await fetch(`${base}/my-learning`, {
      method: 'GET',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (response.status === 401) return { kind: 'signed-out' }
    if (response.status === 403) return { kind: 'non-member' }
    if (!response.ok) return { kind: 'unavailable' }
    const body = await response.json() as { source?: unknown; snapshot?: unknown }
    return body.source === 'practice-web-test' && validSnapshot(body.snapshot)
      ? { kind: 'ok', snapshot: body.snapshot }
      : { kind: 'unavailable' }
  } catch {
    return { kind: 'unavailable' }
  }
}
