import { describe, expect, it } from 'vitest'
import { buildWorkplaceLearnCatalog, workplaceLearnCatalog } from './catalog'
import { sampleWorkplaceLearnItem, sampleWorkplaceVocabularyItem } from './sample'
import type { WorkplaceLearnAuthoringItem, WorkplaceLearnRuntimeItem } from './types'
import {
  projectWorkplaceLearnRuntimeItem,
  toWorkplaceLearnCatalogEntry,
  validateWorkplaceLearnItem,
  validateWorkplaceLearnRuntimeItem,
} from './validate'

function releasedLesson(): WorkplaceLearnAuthoringItem {
  const lesson = { ...sampleWorkplaceLearnItem }
  delete lesson.sampleLabel
  return {
    ...lesson,
    access: 'plus',
    publication: { status: 'released', releasedAt: '2026-09-20', releaseNotes: 'Reviewed first private release.' },
    reviewer: { id: 'editor-1', reviewedAt: '2026-09-19' },
    rights: { status: 'cleared', basis: 'original', attestation: 'Original hypothetical teaching material.' },
  }
}

describe('Workplace Learn authoring and runtime contract', () => {
  it('accepts the explicit hypothetical Free fixture with substantive Japanese and zh-TW support', () => {
    expect(validateWorkplaceLearnRuntimeItem(sampleWorkplaceLearnItem).ok).toBe(true)
    expect(sampleWorkplaceLearnItem.whatToSayJapanese).toContain('想定より時間がかかっており')
    expect(sampleWorkplaceLearnItem.meaningInContextZhTW).toContain('目前確認的事實')
    expect(sampleWorkplaceLearnItem.meaningInContextZhTW).not.toContain('「')
    expect(sampleWorkplaceVocabularyItem.workplaceNuanceZhTW).not.toContain('「')
    expect(sampleWorkplaceLearnItem.sampleLabel).toBe('non-proprietary-teaching-sample')
  })

  it('accepts only explicit supported language tags for titles, leads, and link labels', () => {
    for (const language of ['ja', 'zh-TW', 'zh-CN', 'en'] as const) {
      expect(validateWorkplaceLearnRuntimeItem({
        ...sampleWorkplaceLearnItem,
        titleLanguage: language,
        leadLanguage: language,
        relatedLinks: [{ kind: 'learn', label: 'related item', labelLanguage: language, targetId: sampleWorkplaceVocabularyItem.id }],
      }).ok).toBe(true)
    }
    const missingLanguages: Record<string, unknown> = { ...sampleWorkplaceLearnItem }
    delete missingLanguages.titleLanguage
    delete missingLanguages.leadLanguage
    expect(validateWorkplaceLearnRuntimeItem(missingLanguages).ok).toBe(false)
  })

  it('requires reviewed, released, rights-cleared content for release projection', () => {
    const released = releasedLesson()
    expect(validateWorkplaceLearnItem(released, { requireReleased: true }).ok).toBe(true)
    const draft = { ...released, publication: { status: 'draft' as const }, rights: { ...released.rights, status: 'pending' as const } }
    expect(validateWorkplaceLearnItem(draft).ok).toBe(true)
    expect(validateWorkplaceLearnItem(draft, { requireReleased: true }).ok).toBe(false)
    expect(() => projectWorkplaceLearnRuntimeItem(draft)).toThrow('Workplace Learn item is not releasable')
    const projected = projectWorkplaceLearnRuntimeItem(released)
    expect(projected).not.toHaveProperty('publication')
    expect(projected).not.toHaveProperty('reviewer')
    expect(projected).not.toHaveProperty('rights')
    expect(projected).not.toHaveProperty('releasedAt')
    expect(validateWorkplaceLearnRuntimeItem({ ...projected, releasedAt: '2026-09-20' }).ok).toBe(false)
  })

  it('rejects unknown authoring/runtime fields, markup, assets, malformed categories, and dates', () => {
    const base = releasedLesson()
    expect(validateWorkplaceLearnItem({ ...base, editorialNotes: 'private review notes' }).ok).toBe(false)
    expect(validateWorkplaceLearnItem({ ...base, whatToDo: '<script>alert(1)</script>' }).ok).toBe(false)
    expect(validateWorkplaceLearnItem({ ...base, whatToSayJapanese: '[link](https://example.com)' }).ok).toBe(false)
    expect(validateWorkplaceLearnItem({ ...base, cautionZhTW: '# heading' }).ok).toBe(false)
    expect(validateWorkplaceLearnItem({ ...base, assets: ['/private/lesson.png'] }).ok).toBe(false)
    expect(validateWorkplaceLearnItem({ ...base, category: 'consulting' }).ok).toBe(false)
    expect(validateWorkplaceLearnItem({ ...base, publication: { ...base.publication, releasedAt: '2026-99-20' } }).ok).toBe(false)
    expect(validateWorkplaceLearnRuntimeItem({ ...sampleWorkplaceLearnItem, rights: base.rights }).ok).toBe(false)
    expect(validateWorkplaceLearnRuntimeItem({ ...sampleWorkplaceLearnItem, slug: 'a'.repeat(81) }).ok).toBe(false)
    expect(validateWorkplaceLearnRuntimeItem({ ...sampleWorkplaceLearnItem, tags: ['a'.repeat(49)] }).ok).toBe(false)
    expect(validateWorkplaceLearnRuntimeItem({ ...sampleWorkplaceLearnItem, examples: [] }).ok).toBe(false)
    expect(validateWorkplaceLearnRuntimeItem({ ...sampleWorkplaceLearnItem, practiceTypes: [] }).ok).toBe(false)
    expect(validateWorkplaceLearnRuntimeItem({ ...sampleWorkplaceLearnItem, practiceTypes: ['dialogue'] }).ok).toBe(false)
    expect(validateWorkplaceLearnRuntimeItem({ ...sampleWorkplaceLearnItem, titleLanguage: 'fr' }).ok).toBe(false)
    expect(validateWorkplaceLearnRuntimeItem({ ...sampleWorkplaceLearnItem, relatedLinks: [{ kind: 'learn', label: '次の教材', labelLanguage: 'fr', targetId: sampleWorkplaceVocabularyItem.id }] }).ok).toBe(false)
  })

  it('requires lesson and vocabulary references to resolve within the bounded collection', () => {
    const vocabulary: WorkplaceLearnRuntimeItem = {
      schemaVersion: 1, kind: 'vocabulary', id: 'learn-term-next-update', slug: 'next-update',
      title: '次回の更新', titleLanguage: 'ja', lead: '次に状況を知らせる時点を示します。', leadLanguage: 'ja', category: 'workplace-vocabulary',
      tags: ['reporting'], access: 'free', term: '改めて状況をご報告します', reading: 'あらためてじょうきょうをごほうこくします',
      meaningZhTW: '之後再回報狀況', workplaceNuanceZhTW: '讓對方知道你會在資訊更新後再次聯絡。',
      usageContext: '承諾下一次進度回報時使用。',
      example: { context: '補充回報時間', japanese: '15時までに改めて状況をご報告します。', explanationZhTW: '明確承諾更新時間。' },
      cautionZhTW: '時間必須可實際遵守。', register: '丁寧；適用於工作聯絡。', relatedTermIds: [], relatedLinks: [], sampleLabel: 'non-proprietary-teaching-sample',
    }
    const lesson = { ...sampleWorkplaceLearnItem, relatedVocabularyIds: ['learn-term-next-update'] }
    expect(buildWorkplaceLearnCatalog([lesson, vocabulary])).toHaveLength(2)
    const learnToVocabulary = {
      ...sampleWorkplaceLearnItem,
      relatedVocabularyIds: [],
      relatedLinks: [{ kind: 'learn' as const, label: '次回の更新', labelLanguage: 'ja' as const, targetId: vocabulary.id }],
    }
    expect(buildWorkplaceLearnCatalog([learnToVocabulary, vocabulary])).toHaveLength(2)
    expect(validateWorkplaceLearnRuntimeItem({ ...lesson, relatedVocabularyIds: ['unknown-term'] }, { vocabularyIds: [vocabulary.id] }).ok).toBe(false)
    expect(() => buildWorkplaceLearnCatalog([lesson, { ...vocabulary, id: lesson.id }])).toThrow('Duplicate Workplace Learn id')
    expect(() => buildWorkplaceLearnCatalog([lesson, { ...vocabulary, slug: lesson.slug }])).toThrow('Duplicate Workplace Learn slug')
  })

  it('keeps public catalog metadata body-free and Plus entries tied to matching revisions', () => {
    expect(workplaceLearnCatalog).toHaveLength(2)
    expect(workplaceLearnCatalog[0]).toMatchObject({ access: 'free', sampleLabel: 'non-proprietary-teaching-sample' })
    expect(workplaceLearnCatalog[0]).not.toHaveProperty('whatToSayJapanese')
    expect(workplaceLearnCatalog[0]).not.toHaveProperty('examples')
    expect(workplaceLearnCatalog[0]).not.toHaveProperty('meaningInContextZhTW')
    expect(workplaceLearnCatalog[1]).toMatchObject({ kind: 'vocabulary', slug: 'sample-mikomi-estimate', access: 'free' })
    expect(workplaceLearnCatalog[1]).not.toHaveProperty('term')
    expect(workplaceLearnCatalog[1]).not.toHaveProperty('meaningZhTW')
    expect(sampleWorkplaceLearnItem.relatedVocabularyIds).toContain(sampleWorkplaceVocabularyItem.id)
    expect(sampleWorkplaceVocabularyItem.term).toBe('見込み')
    expect(sampleWorkplaceVocabularyItem.relatedLinks).toContainEqual({
      kind: 'learn', label: sampleWorkplaceLearnItem.title, labelLanguage: 'ja', targetId: sampleWorkplaceLearnItem.id,
    })

    const sampleBody = { ...sampleWorkplaceLearnItem }
    delete sampleBody.sampleLabel
    const plus = { ...sampleBody, access: 'plus' as const }
    const reference = { contentId: plus.id, revision: 'a'.repeat(64) }
    expect(toWorkplaceLearnCatalogEntry(plus, reference)).toMatchObject({ access: 'plus', releaseReference: reference })
    expect(() => toWorkplaceLearnCatalogEntry(sampleWorkplaceLearnItem, reference)).toThrow('release reference is invalid')
    const plusWithoutSampleLink = { ...plus, relatedVocabularyIds: [] }
    expect(() => buildWorkplaceLearnCatalog([plusWithoutSampleLink])).toThrow('Plus Workplace Learn bodies are not accepted')
  })
})
