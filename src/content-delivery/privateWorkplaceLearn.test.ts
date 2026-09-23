import { describe, expect, it } from 'vitest'
import { sampleWorkplaceLearnItem, sampleWorkplaceVocabularyItem } from '../workplace-learn/sample'
import { preparePrivateWorkplaceLearnRelease } from './privateWorkplaceLearn'

function releasedPlus<T extends typeof sampleWorkplaceLearnItem | typeof sampleWorkplaceVocabularyItem>(item: T) {
  const body = { ...item }
  delete body.sampleLabel
  return {
    ...body,
    access: 'plus' as const,
    publication: { status: 'released' as const, releasedAt: '2026-09-24', releaseNotes: 'Reviewed private release.' },
    reviewer: { id: 'editor-1', reviewedAt: '2026-09-23' },
    rights: { status: 'cleared' as const, basis: 'original' as const, attestation: 'Original hypothetical teaching material.' },
  }
}

describe('private Workplace Learn release preparation', () => {
  it('prepares deterministic member envelopes for lesson and vocabulary with distinct kinds', () => {
    for (const source of [releasedPlus(sampleWorkplaceLearnItem), releasedPlus(sampleWorkplaceVocabularyItem)]) {
      const result = preparePrivateWorkplaceLearnRelease(source.id, source)
      expect(result.ok).toBe(true)
      if (!result.ok) continue
      expect(result.value).toMatchObject({ contentId: source.id, accessScope: 'member' })
      expect(result.value.revision).toMatch(/^[a-f0-9]{64}$/)
      expect(result.value.contentKind).toBe(source.kind === 'lesson' ? 'workplace-lesson' : 'workplace-vocabulary')
      expect(Object.keys(result.value.payload)).toEqual(['workplaceLearn'])
      expect(result.value.payload.workplaceLearn).not.toHaveProperty('publication')
      expect(result.value.payload.workplaceLearn).not.toHaveProperty('reviewer')
      expect(result.value.payload.workplaceLearn).not.toHaveProperty('rights')
      expect(preparePrivateWorkplaceLearnRelease(source.id, source)).toMatchObject({ ok: true, value: { revision: result.value.revision } })
    }
    const lesson = releasedPlus(sampleWorkplaceLearnItem)
    const revisedLesson = { ...lesson, whatToDo: `${lesson.whatToDo} 再確認します。` }
    const original = preparePrivateWorkplaceLearnRelease(lesson.id, lesson)
    const revised = preparePrivateWorkplaceLearnRelease(lesson.id, revisedLesson)
    expect(original.ok && revised.ok && original.value.revision !== revised.value.revision).toBe(true)
  })

  it('fails closed for Free/sample, draft, rights-pending, and mismatched identities', () => {
    const source = releasedPlus(sampleWorkplaceLearnItem)
    expect(preparePrivateWorkplaceLearnRelease(sampleWorkplaceLearnItem.id, sampleWorkplaceLearnItem)).toMatchObject({ ok: false })
    expect(preparePrivateWorkplaceLearnRelease(source.id, { ...source, publication: { status: 'draft' } })).toMatchObject({ ok: false })
    expect(preparePrivateWorkplaceLearnRelease(source.id, { ...source, rights: { ...source.rights, status: 'pending' } })).toMatchObject({ ok: false })
    expect(preparePrivateWorkplaceLearnRelease(source.id, { ...source, sampleLabel: 'non-proprietary-teaching-sample' })).toMatchObject({ ok: false })
    expect(preparePrivateWorkplaceLearnRelease('different-id', source)).toMatchObject({ ok: false, reason: 'Workplace Learn id does not match the requested server delivery reference' })
    expect(preparePrivateWorkplaceLearnRelease('not a valid id', source)).toMatchObject({ ok: false })
  })

  it('rejects unknown fields, PostgreSQL-incompatible text, and oversized projected JSON', () => {
    const source = releasedPlus(sampleWorkplaceLearnItem)
    expect(preparePrivateWorkplaceLearnRelease(source.id, { ...source, secretAssetPath: '/private/image.png' })).toMatchObject({ ok: false })
    expect(preparePrivateWorkplaceLearnRelease(source.id, { ...source, whatToSayJapanese: 'bad\u0000text' })).toMatchObject({
      ok: false, reason: 'Workplace Learn payload contains strings incompatible with PostgreSQL jsonb',
    })
    const oversized = {
      ...source,
      examples: Array.from({ length: 8 }, () => ({
        context: 'c'.repeat(400), japanese: '日'.repeat(1200), explanationZhTW: '解'.repeat(1600),
      })),
    }
    expect(preparePrivateWorkplaceLearnRelease(source.id, oversized)).toMatchObject({
      ok: false, reason: 'Workplace Learn payload exceeds the server delivery size limit',
    })
  })
})
