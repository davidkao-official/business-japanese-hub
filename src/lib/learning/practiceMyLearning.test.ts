import { describe, expect, it } from 'vitest'
import {
  MAX_PRACTICE_LEARNING_ATTEMPTS,
  projectPracticeLearningSnapshot,
  type PracticeEvidenceRow,
  type PracticeReviewItem,
} from './practiceMyLearning'

const baseAttempt: PracticeEvidenceRow = {
  contentId: 'practice-web-test-spi-v1',
  contentRevision: 'a'.repeat(64),
  questionId: 'question-1',
  questionVersion: 1,
  testFamily: 'spi',
  domain: 'verbal',
  category: 'vocabulary-in-context',
  practiceMode: 'untimed-learning',
  correct: true,
  createdAt: '2026-09-19T00:00:00.000Z',
}

const baseReview: PracticeReviewItem = {
  contentId: baseAttempt.contentId,
  contentRevision: baseAttempt.contentRevision,
  questionId: baseAttempt.questionId,
  questionVersion: baseAttempt.questionVersion,
  testFamily: baseAttempt.testFamily,
  domain: baseAttempt.domain,
  category: baseAttempt.category,
  practiceMode: baseAttempt.practiceMode,
  createdAt: '2026-09-19T00:01:00.000Z',
}

function attempt(overrides: Partial<PracticeEvidenceRow> = {}): PracticeEvidenceRow {
  return { ...baseAttempt, ...overrides }
}

describe('Practice My Learning projection', () => {
  it('starts practice without inventing statistics for a new member', () => {
    const snapshot = projectPracticeLearningSnapshot([], [], [])

    expect(snapshot.nextAction).toEqual({ kind: 'start-practice' })
    expect(snapshot.recentAttempts).toEqual([])
    expect(snapshot.actionableMistakes).toEqual([])
    expect(snapshot.weakArea).toBeNull()
  })

  it('prioritizes the newest actionable mistake over continuation', () => {
    const latest = { ...baseReview, questionId: 'question-2', createdAt: '2026-09-19T00:03:00.000Z' }
    const snapshot = projectPracticeLearningSnapshot(
      [attempt({ correct: true, createdAt: '2026-09-19T00:04:00.000Z' })],
      [baseReview, latest],
      [{ ...baseReview, questionId: 'question-2', questionVersion: 2 }],
    )

    expect(snapshot.actionableMistakes).toHaveLength(2)
    expect(snapshot.nextAction).toEqual({ kind: 'review-mistake', item: latest })
  })

  it('continues the newest attempt only when its current question is available', () => {
    const latest = attempt({ questionId: 'question-2', createdAt: '2026-09-19T00:04:00.000Z' })
    const availability = {
      ...baseReview,
      questionId: latest.questionId,
      questionVersion: 3,
      createdAt: undefined,
    }
    const snapshot = projectPracticeLearningSnapshot([latest], [], [availability])

    expect(snapshot.nextAction).toEqual({
      kind: 'continue-practice',
      item: {
        ...availability,
        createdAt: latest.createdAt,
      },
    })
  })

  it('uses only the latest fifty attempts for weak-area evidence', () => {
    const attempts = Array.from({ length: MAX_PRACTICE_LEARNING_ATTEMPTS + 1 }, (_, index) =>
      attempt({
        questionId: `question-${index}`,
        correct: index === MAX_PRACTICE_LEARNING_ATTEMPTS,
        createdAt: new Date(Date.parse(baseAttempt.createdAt) + index * 60_000).toISOString(),
      }),
    )
    const snapshot = projectPracticeLearningSnapshot(attempts, [], [])

    expect(snapshot.recentAttempts).toHaveLength(MAX_PRACTICE_LEARNING_ATTEMPTS)
    expect(snapshot.recentAttempts[0]?.questionId).toBe(`question-${MAX_PRACTICE_LEARNING_ATTEMPTS}`)
    expect(snapshot.weakArea).toMatchObject({
      sampleCount: MAX_PRACTICE_LEARNING_ATTEMPTS,
      incorrectCount: MAX_PRACTICE_LEARNING_ATTEMPTS - 1,
    })
  })

  it('supports a factual weak-area signal only at five samples and two mistakes', () => {
    const snapshot = projectPracticeLearningSnapshot(
      [
        attempt({ questionId: 'a', correct: false }),
        attempt({ questionId: 'b', correct: false }),
        attempt({ questionId: 'c', correct: true }),
        attempt({ questionId: 'd', correct: true }),
        attempt({ questionId: 'e', correct: true }),
      ],
      [],
      [],
    )

    expect(snapshot.weakArea).toMatchObject({
      domain: 'verbal',
      category: 'vocabulary-in-context',
      sampleCount: 5,
      incorrectCount: 2,
      accuracyPercent: 60,
    })
  })

  it('orders weak-area ties by accuracy, sample size, recency, then stable key', () => {
    const snapshot = projectPracticeLearningSnapshot(
      [
        ...Array.from({ length: 5 }, (_, index) => attempt({
          questionId: `v-${index}`,
          category: 'vocabulary-in-context',
          correct: index >= 2,
          createdAt: new Date(Date.parse(baseAttempt.createdAt) + index * 60_000).toISOString(),
        })),
        ...Array.from({ length: 6 }, (_, index) => attempt({
          questionId: `s-${index}`,
          category: 'sentence-logic',
          correct: index >= 3,
          createdAt: new Date(Date.parse(baseAttempt.createdAt) + (index + 20) * 60_000).toISOString(),
        })),
      ],
      [],
      [],
    )

    expect(snapshot.weakArea).toMatchObject({
      category: 'sentence-logic',
      sampleCount: 6,
      incorrectCount: 3,
      accuracyPercent: 50,
    })
  })

  it('drops malformed evidence instead of guessing a route or statistic', () => {
    const snapshot = projectPracticeLearningSnapshot(
      [attempt({ createdAt: 'not-a-date' }), attempt({ questionVersion: 0 })],
      [{ ...baseReview, questionVersion: 0 }],
      [],
    )

    expect(snapshot.recentAttempts).toEqual([])
    expect(snapshot.actionableMistakes).toEqual([])
    expect(snapshot.nextAction).toEqual({ kind: 'start-practice' })
    expect(snapshot.weakArea).toBeNull()
  })
})
