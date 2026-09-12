import { describe, expect, it } from 'vitest'
import { preparePrivatePracticeQuestionBankRelease } from '../content-delivery/privatePracticeQuestionBank'
import { nonProprietaryPracticeQuestionBankFixture } from './fixtures/nonProprietaryPracticeFixture'
import { resolveQuestionCheckpoints, scoreAnswer, scoreQuestion, selectableQuestions, supportOverlay, validateRuntimePayload } from './runtime'

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

  it('applies latest-version filtering before category and input selection', () => {
    const release = preparePrivatePracticeQuestionBankRelease('practice-web-test-fixture', nonProprietaryPracticeQuestionBankFixture)
    expect(release.ok).toBe(true)
    if (!release.ok) return
    const question = release.value.payload.questionBank.questions[0]!
    const moved = { ...question, id: 'moved-question', version: 1 }
    const movedLatest = { ...moved, version: 2, category: 'another-category' }
    const unsupported = { ...question, id: 'unsupported-question', version: 1 }
    const unsupportedLatest = { ...unsupported, version: 2, answer: { input: { kind: 'short-text' as const }, expectedAnswer: { kind: 'short-text' as const, value: 'synthetic' }, scoring: { kind: 'exact-text' as const } } }
    const payload = { ...release.value.payload, questionBank: { ...release.value.payload.questionBank, questions: [moved, movedLatest, unsupported, unsupportedLatest] } }
    expect(selectableQuestions(payload, 'fixture', 'verbal', 'fixture-category', 'untimed-learning')).toEqual([])
    expect(selectableQuestions(payload, 'fixture', 'verbal', 'another-category', 'untimed-learning').map((entry) => entry.id)).toEqual(['moved-question'])
  })

  it('scores numeric tolerance and multi-select sets deterministically', () => {
    expect(scoreAnswer({ input: { kind: 'number' }, expectedAnswer: { kind: 'number', value: 10 }, scoring: { kind: 'numeric', tolerance: 0.5 } }, 10.5)).toBe(true)
    expect(scoreAnswer({ input: { kind: 'number' }, expectedAnswer: { kind: 'number', value: 10 }, scoring: { kind: 'numeric', tolerance: 0.5 } }, 10.6)).toBe(false)
    const multi = { input: { kind: 'multi-select' as const, choices: [{ id: 'a', textJa: 'A' }, { id: 'b', textJa: 'B' }] }, expectedAnswer: { kind: 'multi-select' as const, choiceIds: ['a', 'b'] }, scoring: { kind: 'exact-set' as const } }
    expect(scoreAnswer(multi, ['b', 'a'])).toBe(true)
    expect(scoreAnswer(multi, ['a'])).toBe(false)
  })

  it('validates an authored checkpoint after runtime provenance projection', () => {
    const source = structuredClone(nonProprietaryPracticeQuestionBankFixture)
    const question = source.questionBank.questions[0]!
    question.itemAnalysis.diagnosticCheckpoints = { registryVersion: 1, ids: ['synthetic-checkpoint-01'] }
    source.checkpointRegistry = {
      version: 1,
      checkpoints: [{
        id: 'synthetic-checkpoint-01', version: 1, questionId: question.id, questionVersion: question.version,
        dimension: 'meaning', promptJa: '選択肢を選んでください。',
        answer: { input: { kind: 'single-choice', choices: [{ id: 'two', textJa: '二番' }] }, expectedAnswer: { kind: 'single-choice', choiceId: 'two' }, scoring: { kind: 'exact-choice' } },
        provenance: { authoredBy: 'fixture-author', createdAt: '2026-09-10T00:00:00.000Z', updatedAt: '2026-09-10T00:00:00.000Z', originalContentAttestation: true },
      }],
    }
    const release = preparePrivatePracticeQuestionBankRelease('practice-web-test-fixture', source)
    expect(release.ok).toBe(true)
    if (!release.ok) return
    const payload = validateRuntimePayload(release.value.payload)
    expect(payload).not.toBeNull()
    if (!payload) return
    const resolved = resolveQuestionCheckpoints(payload, payload.questionBank.questions[0]!)
    expect(resolved).toHaveLength(1)
    expect(resolved?.[0]?.id).toBe('synthetic-checkpoint-01')
  })
})
