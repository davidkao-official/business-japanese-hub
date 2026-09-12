import { describe, expect, it } from 'vitest'
import { preparePrivatePracticeQuestionBankRelease } from '../content-delivery/privatePracticeQuestionBank'
import { nonProprietaryPracticeQuestionBankFixture } from './fixtures/nonProprietaryPracticeFixture'
import { scoreQuestion, selectableQuestions, supportOverlay, validateRuntimePayload } from './runtime'

describe('SPI runner runtime seam', () => {
  it('validates a projected synthetic release, filters the selected category, and scores deterministically', () => {
    const release = preparePrivatePracticeQuestionBankRelease('practice-web-test-fixture', nonProprietaryPracticeQuestionBankFixture)
    expect(release.ok).toBe(true)
    if (!release.ok) return
    const payload = validateRuntimePayload(release.value.payload)
    expect(payload).not.toBeNull()
    if (!payload) return
    const questions = selectableQuestions(payload, 'fixture', 'verbal', 'fixture-category', 'untimed-learning')
    expect(questions).toHaveLength(1)
    expect(scoreQuestion(questions[0]!, 'two')).toBe(true)
    expect(scoreQuestion(questions[0]!, 'one')).toBe(false)
    expect(supportOverlay(payload, questions[0]!, 'zh-Hant')).toMatchObject({ whatIsAsked: '請選擇第二個選項。' })

    const ordering = {
      ...questions[0]!,
      answer: {
        input: { kind: 'ordering' as const, choices: [{ id: 'one', textJa: '一番' }, { id: 'two', textJa: '二番' }] },
        expectedAnswer: { kind: 'ordering' as const, choiceIds: ['two', 'one'] },
        scoring: { kind: 'exact-order' as const },
      },
    }
    expect(scoreQuestion(ordering, ['two', 'one'])).toBe(true)
    expect(scoreQuestion(ordering, ['one', 'two'])).toBe(false)
  })
})
