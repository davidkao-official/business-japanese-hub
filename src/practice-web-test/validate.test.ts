import { describe, expect, it } from 'vitest'
import { preparePrivatePracticeQuestionBankRelease } from '../content-delivery/privatePracticeQuestionBank'
import { nonProprietaryPracticeQuestionBankFixture } from './fixtures/nonProprietaryPracticeFixture'
import { validatePracticeQuestionBankSource } from './validate'

function cloneFixture() {
  return structuredClone(nonProprietaryPracticeQuestionBankFixture)
}

describe('Practice/Web Test private-source contract', () => {
  it('accepts the explicitly non-proprietary fixture and derives an immutable release', () => {
    expect(validatePracticeQuestionBankSource(nonProprietaryPracticeQuestionBankFixture)).toMatchObject({ ok: true })
    const release = preparePrivatePracticeQuestionBankRelease('practice-web-test-fixture', nonProprietaryPracticeQuestionBankFixture)
    expect(release).toMatchObject({ ok: true, value: { contentKind: 'practice-question-bank', accessScope: 'member' } })
    if (release.ok) expect(release.value.revision).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects an unreviewed question before controlled server import', () => {
    const source = cloneFixture()
    source.questionBank.questions[0]!.status = 'draft'
    const result = preparePrivatePracticeQuestionBankRelease('practice-web-test-fixture', source)
    expect(result).toEqual({ ok: false, reason: 'invalid practice question bank: must be released before server import' })
  })

  it('requires release notes for an immutable released question', () => {
    const source = cloneFixture()
    delete source.questionBank.questions[0]!.releaseNotes
    const result = preparePrivatePracticeQuestionBankRelease('practice-web-test-fixture', source)
    expect(result).toEqual({ ok: false, reason: 'invalid practice question bank: must be a non-empty string' })
  })

  it('rejects a choice answer that is not offered by the input', () => {
    const source = cloneFixture()
    const answer = source.questionBank.questions[0]!.answer
    if (answer.input.kind !== 'single-choice' || answer.expectedAnswer.kind !== 'single-choice') throw new Error('fixture changed')
    answer.expectedAnswer.choiceId = 'not-offered'
    const result = validatePracticeQuestionBankSource(source)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ path: '$.questionBank.questions[0].answer.expectedAnswer.choiceId' }))
  })

  it('rejects source-text and official timing fields even if the rest is structurally valid', () => {
    const source = cloneFixture() as Record<string, unknown>
    source.sourceText = 'must never enter the platform artifact'
    const result = validatePracticeQuestionBankSource(source)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ path: '$.sourceText' }))
  })

  it('requires support-overlay key terms to resolve to this question vocabulary', () => {
    const source = cloneFixture()
    source.supportOverlays![0]!.byLocale['zh-Hant']!.keyTerms![0]!.termId = 'unknown-term'
    const result = validatePracticeQuestionBankSource(source)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ path: '$.supportOverlays[0].byLocale.zh-Hant.keyTerms[0].termId' }))
  })

  it('reports malformed core data without throwing while an overlay is present', () => {
    const source = cloneFixture() as unknown as { questionBank: { questions: Array<Record<string, unknown>> }; supportOverlays: unknown[] }
    source.questionBank.questions[0]!.itemAnalysis = null
    expect(() => validatePracticeQuestionBankSource(source)).not.toThrow()
    expect(validatePracticeQuestionBankSource(source).ok).toBe(false)
  })
})
