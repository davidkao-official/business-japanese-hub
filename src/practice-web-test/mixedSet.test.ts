import { describe, expect, it } from 'vitest'
import { preparePrivatePracticeQuestionBankRelease, type PracticeRuntimePayload, type PracticeRuntimeQuestion } from '../content-delivery/privatePracticeQuestionBank'
import { nonProprietaryPracticeQuestionBankFixture } from './fixtures/nonProprietaryPracticeFixture'
import { MIXED_SET_SIZE, selectMixedQuestions } from './mixedSet'

const release = preparePrivatePracticeQuestionBankRelease('practice-web-test-fixture', nonProprietaryPracticeQuestionBankFixture)
if (!release.ok) throw new Error(release.reason)
const basePayload = release.value.payload
const baseQuestion = basePayload.questionBank.questions[0]!

function question(overrides: Partial<PracticeRuntimeQuestion>): PracticeRuntimeQuestion {
  return { ...baseQuestion, testFamily: 'spi', ...overrides }
}

function payloadWith(questions: PracticeRuntimeQuestion[]): PracticeRuntimePayload {
  return { ...basePayload, questionBank: { ...basePayload.questionBank, questions }, supportOverlays: [] }
}

/** A sequential generator keeps the draw deterministic without touching Math.random. */
function sequenceRandom(values: number[]): () => number {
  let index = 0
  return () => values[index++ % values.length]!
}

describe('selectMixedQuestions', () => {
  const bank = payloadWith([
    ...[1, 2, 3, 4].flatMap((number) => [
      question({ id: `verbal-vocab-${number}`, domain: 'verbal', category: 'vocabulary-in-context' }),
      question({ id: `verbal-reading-${number}`, domain: 'verbal', category: 'reading-inference' }),
    ]),
    ...[1, 2, 3, 4].flatMap((number) => [
      question({ id: `nonverbal-percent-${number}`, domain: 'nonverbal', category: 'percentage-profit-loss' }),
      question({ id: `nonverbal-rate-${number}`, domain: 'nonverbal', category: 'rate-and-work' }),
    ]),
  ])

  it('caps the set at ten questions and spans both domains and several categories', () => {
    const selected = selectMixedQuestions(bank, 'spi', MIXED_SET_SIZE, sequenceRandom([0.1, 0.7, 0.3, 0.9]))
    expect(selected).toHaveLength(MIXED_SET_SIZE)
    expect(new Set(selected.map((entry) => entry.domain))).toEqual(new Set(['verbal', 'nonverbal']))
    expect(new Set(selected.map((entry) => entry.category)).size).toBeGreaterThan(1)
    expect(new Set(selected.map((entry) => entry.id)).size).toBe(selected.length)
  })

  it('returns every available question when inventory is below the set size', () => {
    const selected = selectMixedQuestions(payloadWith([
      question({ id: 'verbal-only', domain: 'verbal', category: 'vocabulary-in-context' }),
      question({ id: 'nonverbal-only', domain: 'nonverbal', category: 'rate-and-work' }),
    ]), 'spi', MIXED_SET_SIZE, sequenceRandom([0.5]))
    expect(selected.map((entry) => entry.id).sort()).toEqual(['nonverbal-only', 'verbal-only'])
  })

  it('uses the latest version and excludes questions the browser cannot run', () => {
    const selected = selectMixedQuestions(payloadWith([
      question({ id: 'updated', version: 1, promptJa: '旧版' }),
      question({ id: 'updated', version: 2, promptJa: '新版' }),
      question({ id: 'timed-only', practiceProfile: 'timed-practice' }),
      question({ id: 'not-web', deliveryProfile: 'print' }),
      question({ id: 'text-input', answer: { input: { kind: 'short-text' }, expectedAnswer: { kind: 'short-text', value: '答' }, scoring: { kind: 'exact-text' } } }),
    ]), 'spi', MIXED_SET_SIZE, sequenceRandom([0.5]))
    expect(selected).toHaveLength(1)
    expect(selected[0]!.id).toBe('updated')
    expect(selected[0]!.version).toBe(2)
  })

  it('only draws from the requested family', () => {
    const selected = selectMixedQuestions(payloadWith([
      question({ id: 'spi-question' }),
      question({ id: 'other-family', testFamily: 'other' }),
    ]), 'spi', MIXED_SET_SIZE, sequenceRandom([0.5]))
    expect(selected.map((entry) => entry.id)).toEqual(['spi-question'])
  })
})
