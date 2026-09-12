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
    const latestOverlay = { ...payload.supportOverlays![0]!, version: 2, byLocale: { 'zh-Hant': { whatIsAsked: '最新支援說明。' } } }
    expect(supportOverlay({ ...payload, supportOverlays: [payload.supportOverlays![0]!, latestOverlay] }, questions[0]!, 'zh-Hant')).toMatchObject({ whatIsAsked: '最新支援說明。' })

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

  it('selects only the latest version per stable question id in source order', () => {
    const release = preparePrivatePracticeQuestionBankRelease('practice-web-test-fixture', nonProprietaryPracticeQuestionBankFixture)
    expect(release.ok).toBe(true)
    if (!release.ok) return
    const question = release.value.payload.questionBank.questions[0]!
    const older = { ...question, id: 'stable-a', version: 1 }
    const newer = { ...question, id: 'stable-a', version: 2, promptJa: '最新版本' }
    const other = { ...question, id: 'stable-b', version: 1 }
    const payload = { ...release.value.payload, questionBank: { ...release.value.payload.questionBank, questions: [older, other, newer] } }
    const selected = selectableQuestions(payload, 'fixture', 'verbal', 'fixture-category', 'untimed-learning')
    expect(selected.map((entry) => entry.id)).toEqual(['stable-b', 'stable-a'])
    expect(selected.map((entry) => entry.version)).toEqual([1, 2])
  })
})
