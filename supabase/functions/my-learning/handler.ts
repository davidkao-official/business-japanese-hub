import { authenticateBearer } from '../_shared/auth.ts'
import type { DbClient } from '../_shared/db.ts'
import {
  forbidden,
  headerValue,
  jsonResult,
  methodNotAllowed,
  unauthorized,
  type HandlerRequest,
  type HandlerResult,
} from '../_shared/http.ts'
import {
  projectPracticeLearningSnapshot,
  type PracticeAvailability,
  type PracticeEvidenceRow,
  type PracticeReviewItem,
  type PracticeLearningSnapshot,
} from '../../../src/lib/learning/practiceMyLearning.ts'

export type MembershipAccess = 'active' | 'non-member' | 'unavailable'

export interface MyLearningDeps {
  db: DbClient
  membershipAccessFor: (userId: string) => Promise<MembershipAccess>
}

export interface MyLearningResponse {
  source: 'practice-web-test'
  snapshot: PracticeLearningSnapshot
}

const EVIDENCE_COLUMNS = 'content_id,content_revision,question_id,question_version,test_family,domain,category,practice_mode,correct,created_at'
const AVAILABILITY_COLUMNS = 'content_id,question_id,question_version,content_revision,test_family,domain,category,practice_mode,available'
const LIMIT = 50

function noStore(result: HandlerResult): HandlerResult {
  return { ...result, headers: { ...result.headers, 'Cache-Control': 'private, no-store' } }
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && value.trim() === value
}

function number(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function revision(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

function date(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function mapAttempt(row: Record<string, unknown>): PracticeEvidenceRow | null {
  if (!text(row.content_id) || !revision(row.content_revision) || !text(row.question_id) || !number(row.question_version) ||
    row.test_family !== 'spi' || (row.domain !== 'verbal' && row.domain !== 'nonverbal') || !text(row.category) ||
    (row.practice_mode !== 'untimed-learning' && row.practice_mode !== 'timed-practice') ||
    typeof row.correct !== 'boolean' || !date(row.created_at)) return null
  return {
    contentId: row.content_id,
    contentRevision: row.content_revision,
    questionId: row.question_id,
    questionVersion: row.question_version,
    testFamily: 'spi',
    domain: row.domain,
    category: row.category,
    practiceMode: row.practice_mode,
    correct: row.correct,
    createdAt: row.created_at,
  }
}

function mapReview(row: Record<string, unknown>): PracticeReviewItem | null {
  const attempt = mapAttempt(row)
  if (!attempt || attempt.correct) return null
  return {
    contentId: attempt.contentId,
    contentRevision: attempt.contentRevision,
    questionId: attempt.questionId,
    questionVersion: attempt.questionVersion,
    testFamily: attempt.testFamily,
    domain: attempt.domain,
    category: attempt.category,
    practiceMode: attempt.practiceMode,
    createdAt: attempt.createdAt,
  }
}

function mapAvailability(row: Record<string, unknown>): PracticeAvailability | null {
  if (!text(row.content_id) || !revision(row.content_revision) || !text(row.question_id) || !number(row.question_version) ||
    row.test_family !== 'spi' || (row.domain !== 'verbal' && row.domain !== 'nonverbal') || !text(row.category) ||
    (row.practice_mode !== 'untimed-learning' && row.practice_mode !== 'timed-practice') || row.available !== true) return null
  return {
    contentId: row.content_id,
    contentRevision: row.content_revision,
    questionId: row.question_id,
    questionVersion: row.question_version,
    testFamily: 'spi',
    domain: row.domain,
    category: row.category,
    practiceMode: row.practice_mode,
  }
}

async function readRows(db: DbClient, table: string, columns: string, userId: string): Promise<Record<string, unknown>[] | null> {
  try {
    const result = await db.from(table).select(columns).eq('user_id', userId).order('created_at', { ascending: false }).limit(LIMIT)
    return result.error || !Array.isArray(result.data) ? null : result.data
  } catch {
    return null
  }
}

async function readAvailability(
  db: DbClient,
  attempts: PracticeEvidenceRow[],
  reviews: PracticeReviewItem[],
): Promise<Record<string, unknown>[] | null> {
  const rows = [...attempts, ...reviews]
  const contentIds = [...new Set(rows.map((row) => row.contentId))]
  const questionIds = [...new Set(rows.map((row) => row.questionId))]
  if (contentIds.length === 0 || questionIds.length === 0) return []
  try {
    const result = await db.from('practice_question_availability')
      .select(AVAILABILITY_COLUMNS)
      .in('content_id', contentIds)
      .in('question_id', questionIds)
      .eq('available', true)
      .limit(Math.min(rows.length, LIMIT * 2))
    return result.error || !Array.isArray(result.data) ? null : result.data
  } catch {
    return null
  }
}

export async function handleMyLearning(req: HandlerRequest, deps: MyLearningDeps): Promise<HandlerResult> {
  if (req.method !== 'GET') return noStore(methodNotAllowed('GET'))
  const userId = await authenticateBearer(deps.db, headerValue(req.headers, 'authorization'))
  if (!userId) return noStore(unauthorized())
  const access = await deps.membershipAccessFor(userId)
  if (access === 'unavailable') return noStore(jsonResult(503, { error: 'membership access unavailable' }))
  if (access !== 'active') return noStore(forbidden('active membership required'))

  const [attemptRows, reviewRows] = await Promise.all([
    readRows(deps.db, 'practice_attempts', EVIDENCE_COLUMNS, userId),
    readRows(deps.db, 'practice_review_queue', EVIDENCE_COLUMNS, userId),
  ])
  if (!attemptRows || !reviewRows) return noStore(jsonResult(503, { error: 'learning evidence unavailable' }))
  const attempts = attemptRows.map(mapAttempt)
  const reviews = reviewRows.map(mapReview)
  if (attempts.some((row) => row === null) || reviews.some((row) => row === null)) {
    return noStore(jsonResult(503, { error: 'learning evidence unavailable' }))
  }
  const evidence = attempts.filter((row): row is PracticeEvidenceRow => row !== null)
  const reviewQueue = reviews.filter((row): row is PracticeReviewItem => row !== null)
  const availabilityRows = await readAvailability(deps.db, evidence, reviewQueue)
  if (!availabilityRows) return noStore(jsonResult(503, { error: 'learning evidence unavailable' }))
  const availability = availabilityRows.map(mapAvailability)
  if (availability.some((row) => row === null)) return noStore(jsonResult(503, { error: 'learning evidence unavailable' }))
  const snapshot = projectPracticeLearningSnapshot(
    evidence,
    reviewQueue,
    availability.filter((row): row is PracticeAvailability => row !== null),
  )
  return noStore(jsonResult(200, { source: 'practice-web-test', snapshot } satisfies MyLearningResponse))
}
