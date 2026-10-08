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
  it('accepts the explicit hypothetical Free fixture with a substantive Japanese core', () => {
    expect(validateWorkplaceLearnRuntimeItem(sampleWorkplaceLearnItem).ok).toBe(true)
    expect(sampleWorkplaceLearnItem.whatToSayJapanese).toContain('想定より時間がかかっており')
    expect(sampleWorkplaceLearnItem.meaningInContextJa.length).toBeGreaterThan(0)
    expect(sampleWorkplaceLearnItem.titleLanguage).toBe('ja')
    expect(sampleWorkplaceVocabularyItem.workplaceNuanceJa.length).toBeGreaterThan(0)
    expect(sampleWorkplaceVocabularyItem.register).toContain('丁寧')
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

  it('deep-clones dormant overlays in runtime projection and removes editorial fields', () => {
    const source: Record<string, unknown> = {
      ...releasedLesson(),
      supportOverlays: { byLocale: {
        'zh-TW': { meaningInContext: '補充說明。', examples: [{ explanation: '例句補充。' }] },
        'zh-Hant': { meaningInContext: '補充說明。' }, 'en-US': { meaningInContext: 'Supplementary note.' },
        ko: { meaningInContext: '보충 설명.' },
      } },
    }
    const projected = projectWorkplaceLearnRuntimeItem(source as WorkplaceLearnAuthoringItem) as unknown as Record<string, unknown>
    expect(projected).not.toHaveProperty('publication')
    expect(projected).not.toHaveProperty('reviewer')
    expect(projected).not.toHaveProperty('rights')
    expect(projected.supportOverlays).toEqual(source.supportOverlays)
    const projectedOverlay = projected.supportOverlays as { byLocale: { 'zh-TW': { examples: Array<{ explanation: string }> } } }
    projectedOverlay.byLocale['zh-TW'].examples[0]!.explanation = 'changed clone'
    expect(source.supportOverlays).not.toEqual(projected.supportOverlays)
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
    expect(validateWorkplaceLearnItem({ ...base, cautionJa: '# heading' }).ok).toBe(false)
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
      schemaVersion: 2, kind: 'vocabulary', id: 'learn-term-next-update', slug: 'next-update',
      title: '次回の更新', titleLanguage: 'ja', lead: '次に状況を知らせる時点を示します。', leadLanguage: 'ja', category: 'workplace-vocabulary',
      tags: ['reporting'], access: 'free', term: '改めて状況をご報告します', reading: 'あらためてじょうきょうをごほうこくします',
      meaningJa: '次に状況を知らせること。', workplaceNuanceJa: '情報が更新された後に再度連絡する意思を伝えます。',
      usageContext: '次の進捗報告を約束する場面で使います。',
      example: { context: '報告時間を補足する', japanese: '15時までに改めて状況をご報告します。', explanationJa: '更新する時刻を明確にしています。' },
      cautionJa: '実際に守れる時間を約束してください。', register: '丁寧な業務連絡で使えます。', relatedTermIds: [], relatedLinks: [], sampleLabel: 'non-proprietary-teaching-sample',
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
    expect(workplaceLearnCatalog[0]).not.toHaveProperty('meaningInContextJa')
    expect(workplaceLearnCatalog[1]).toMatchObject({ kind: 'vocabulary', slug: 'sample-mikomi-estimate', access: 'free' })
    expect(workplaceLearnCatalog[1]).not.toHaveProperty('term')
    expect(workplaceLearnCatalog[1]).not.toHaveProperty('meaningZhTW')
    expect(workplaceLearnCatalog[1]).not.toHaveProperty('meaningJa')
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

// Independent raw schema-v2 acceptance fixtures. These intentionally do not spread
// the public sample: later sample migration must not weaken the schema contract.
describe('Workplace Learn schema-v2 Japanese-core admission', () => {
  it('accepts required Japanese schema-v2 core with dormant locale support', () => {
    const lesson: Record<string, unknown> = {
      schemaVersion: 2, kind: 'lesson', id: 'raw-v2-lesson', slug: 'raw-v2-lesson',
      title: '進捗遅延を報告する', titleLanguage: 'ja', lead: '事実と次の対応を分けて伝えます。', leadLanguage: 'ja',
      category: 'workplace-communication', tags: ['reporting'], access: 'free',
      situation: '予定より作業が遅れていると分かった場面。',
      meaningInContextJa: '遅れの事実、影響、次の対応を分けて共有します。',
      learningObjective: '遅延の影響と次の対応を上司に報告できる。', capabilityDomain: 'hou-ren-sou',
      skill: '進捗報告', coreJudgment: '確認できた事実と見通しを区別します。',
      whatToDo: '影響範囲を確認し、次の報告時点を示します。',
      whatToSayJapanese: '予定より遅れており、影響を確認しています。',
      whyItWorksJa: '事実を先に示すと、相手が状況と対応を判断しやすくなります。',
      practiceTypes: ['rewrite'], transferTakeaway: '事実・影響・次の対応を順に伝えます。',
      examples: [{ context: '上司への進捗報告', japanese: '本日中に影響範囲を確認します。', explanationJa: '次に行う確認を具体的に示しています。' }],
      cautionJa: '原因が未確認の段階では、推測を事実のように伝えないでください。',
      relationshipContext: '担当者から上司への報告。', relatedVocabularyIds: [], relatedLinks: [],
      supportOverlays: { byLocale: { 'zh-TW': { meaningInContext: '補充說明。', examples: [{ explanation: '例句補充。' }] } } },
    }
    const vocabulary: Record<string, unknown> = {
      schemaVersion: 2, kind: 'vocabulary', id: 'raw-v2-term', slug: 'raw-v2-term',
      title: '見込み', titleLanguage: 'ja', lead: '将来の予測を表す語です。', leadLanguage: 'ja',
      category: 'workplace-vocabulary', tags: ['reporting'], access: 'free',
      term: '見込み', reading: 'みこみ', meaningJa: '現時点の情報から予測される結果。',
      workplaceNuanceJa: '確定事項ではない予測として、根拠とあわせて使います。',
      usageContext: '納期や数量など、現時点での予測を伝える場面。',
      example: { context: '納期の見通しを伝える', japanese: '金曜日に完了する見込みです。', explanationJa: '完了予測であることを示しています。' },
      cautionJa: '確定した予定と誤解されないよう、変動要因も共有します。',
      register: '丁寧な業務連絡で使用できます。', relationshipContext: '社内の進捗共有。',
      relatedTermIds: [], relatedLinks: [],
      supportOverlays: { byLocale: { 'en-US': { meaning: 'Supplemental meaning.', example: { explanation: 'Example note.' } } } },
    }

    expect(validateWorkplaceLearnRuntimeItem(lesson).ok).toBe(true)
    expect(validateWorkplaceLearnRuntimeItem(vocabulary).ok).toBe(true)
  })

  it('requires Japanese core even when a complete locale overlay is present and rejects old or wrong versions', () => {
    const lesson: Record<string, unknown> = {
      schemaVersion: 2, kind: 'lesson', id: 'raw-v2-missing-ja', slug: 'raw-v2-missing-ja',
      title: '進捗遅延を報告する', titleLanguage: 'ja', lead: '事実と次の対応を分けて伝えます。', leadLanguage: 'ja',
      category: 'workplace-communication', tags: ['reporting'], access: 'free', situation: '遅れを報告する場面。',
      learningObjective: '遅延と対応を説明する。', capabilityDomain: 'hou-ren-sou', skill: '進捗報告',
      coreJudgment: '事実と見通しを分ける。', whatToDo: '影響を確認する。', whatToSayJapanese: '遅れております。',
      practiceTypes: ['rewrite'], transferTakeaway: '次の対応を示す。',
      examples: [{ context: '報告', japanese: '確認します。', explanationJa: '次の行動を示す。' }],
      relatedVocabularyIds: [], relatedLinks: [], cautionJa: '推測を事実として伝えない。',
      supportOverlays: { byLocale: { 'zh-TW': { meaningInContext: '完整補充。', whyItWorks: '完整補充。', caution: '完整補充。', examples: [{ explanation: '完整補充。' }] } } },
    }
    const v1 = { ...lesson, schemaVersion: 1 }
    const wrongVersion = { ...lesson, schemaVersion: 3 }
    const oldTopLevelZhTW = { ...lesson, meaningInContextZhTW: '舊版欄位。', whyItWorksZhTW: '舊版欄位。', cautionZhTW: '舊版欄位。' }
    expect(validateWorkplaceLearnRuntimeItem(lesson).ok).toBe(false)
    expect(validateWorkplaceLearnRuntimeItem(v1).ok).toBe(false)
    expect(validateWorkplaceLearnRuntimeItem(wrongVersion).ok).toBe(false)
    expect(validateWorkplaceLearnRuntimeItem(oldTopLevelZhTW).ok).toBe(false)
  })

  it('rejects malformed, unsupported, marked-up, or oversized dormant locale overlays', () => {
    const base = {
      schemaVersion: 2, kind: 'vocabulary', id: 'raw-v2-overlay', slug: 'raw-v2-overlay',
      title: '見込み', titleLanguage: 'ja', lead: '予測を表す語です。', leadLanguage: 'ja',
      category: 'workplace-vocabulary', tags: ['reporting'], access: 'free', term: '見込み', reading: 'みこみ',
      meaningJa: '予測される結果。', workplaceNuanceJa: '根拠と一緒に使います。', usageContext: '納期を伝える。',
      example: { context: '納期の見通し', japanese: '金曜日に完了する見込みです。', explanationJa: '予測を表しています。' },
      cautionJa: '確定事項と混同させない。', register: '丁寧な業務連絡。', relatedTermIds: [], relatedLinks: [],
    }
    const invalidOverlays = [
      { byLocale: { 'zh-!': { meaning: 'text' } } },
      { byLocale: { 'zh-TW': { meaning: '<b>text</b>' } } },
      { byLocale: { 'zh-TW': { nested: { meaning: 'text' } } } },
      { byLocale: { 'zh-TW': { meaning: 'm'.repeat(1601) } } },
    ]
    for (const supportOverlays of invalidOverlays) {
      expect(validateWorkplaceLearnRuntimeItem({ ...base, supportOverlays }).ok).toBe(false)
    }
    expect(validateWorkplaceLearnRuntimeItem({ ...base, supportOverlays: { byLocale: { 'zh-TW': { meaning: '補充說明。' } } } }).ok).toBe(true)
    expect(validateWorkplaceLearnRuntimeItem({ ...base, supportOverlays: { byLocale: { fr: { meaning: 'Note complémentaire.' } } } }).ok).toBe(true)
  })
})

describe('schema-v2 version and Japanese-core controls', () => {
  it('isolates legacy/wrong-version and every lesson/vocabulary Japanese requirement', () => {
    const lesson: Record<string, unknown> = {
      schemaVersion: 2, kind: 'lesson', id: 'control-v2-lesson', slug: 'control-v2-lesson',
      title: '進捗遅延を報告する', titleLanguage: 'ja', lead: '事実と次の対応を伝えます。', leadLanguage: 'ja',
      category: 'workplace-communication', tags: ['reporting'], access: 'free', situation: '遅れを報告する場面。',
      meaningInContextJa: '遅れの事実と次の対応を共有します。', learningObjective: '遅延の影響を報告できます。',
      capabilityDomain: 'hou-ren-sou', skill: '進捗報告', coreJudgment: '事実と見通しを分けます。',
      whatToDo: '影響範囲を確認します。', whatToSayJapanese: '遅れが出ています。',
      whyItWorksJa: '事実が分かると対応を判断しやすくなります。', practiceTypes: ['rewrite'],
      transferTakeaway: '次の確認時点を示します。',
      examples: [{ context: '進捗報告', japanese: '本日中に確認します。', explanationJa: '次の行動を示します。' }],
      cautionJa: '未確認の推測を事実として伝えないでください。', relatedVocabularyIds: [], relatedLinks: [],
      supportOverlays: { byLocale: { 'zh-TW': {
        meaningInContext: '補充說明。', whyItWorks: '補充說明。', caution: '補充說明。',
        examples: [{ explanation: '例句補充。' }],
      } } },
    }
    const vocabulary: Record<string, unknown> = {
      schemaVersion: 2, kind: 'vocabulary', id: 'control-v2-vocabulary', slug: 'control-v2-vocabulary',
      title: '見込み', titleLanguage: 'ja', lead: '予測される結果を表す語です。', leadLanguage: 'ja',
      category: 'workplace-vocabulary', tags: ['reporting'], access: 'free', term: '見込み', reading: 'みこみ',
      meaningJa: '現時点の情報から予測される結果。', workplaceNuanceJa: '確定事項ではない予測を表します。',
      usageContext: '納期の見通しを共有する場面。',
      example: { context: '納期の共有', japanese: '金曜日に完了する見込みです。', explanationJa: '現時点の予測を示します。' },
      cautionJa: '確定した予定と誤解されないようにします。', register: '丁寧な業務連絡で使えます。',
      relatedTermIds: [], relatedLinks: [],
      supportOverlays: { byLocale: { en: {
        meaning: 'A result predicted from current information.', workplaceNuance: 'Signals an estimate.',
        caution: 'Do not present it as confirmed.', example: { explanation: 'States a current estimate.' },
      } } },
    }
    expect(validateWorkplaceLearnRuntimeItem(lesson).ok).toBe(true)
    expect(validateWorkplaceLearnRuntimeItem(vocabulary).ok).toBe(true)

    for (const schemaVersion of [1, 3]) {
      expect(validateWorkplaceLearnRuntimeItem({ ...lesson, schemaVersion }).ok).toBe(false)
      expect(validateWorkplaceLearnRuntimeItem({ ...vocabulary, schemaVersion }).ok).toBe(false)
    }
    for (const field of ['meaningInContextJa', 'whyItWorksJa', 'cautionJa'] as const) {
      const missing = { ...lesson }
      delete missing[field]
      expect(validateWorkplaceLearnRuntimeItem(missing).ok).toBe(false)
    }
    const missingLessonExample: Record<string, unknown> = JSON.parse(JSON.stringify(lesson))
    const lessonExamples = missingLessonExample.examples as Array<Record<string, unknown>>
    delete lessonExamples[0]!.explanationJa
    expect(validateWorkplaceLearnRuntimeItem(missingLessonExample).ok).toBe(false)

    for (const field of ['meaningJa', 'workplaceNuanceJa', 'cautionJa'] as const) {
      const missing = { ...vocabulary }
      delete missing[field]
      expect(validateWorkplaceLearnRuntimeItem(missing).ok).toBe(false)
    }
    const missingVocabularyExample: Record<string, unknown> = JSON.parse(JSON.stringify(vocabulary))
    delete (missingVocabularyExample.example as Record<string, unknown>).explanationJa
    expect(validateWorkplaceLearnRuntimeItem(missingVocabularyExample).ok).toBe(false)
  })
})

describe('support overlay plaintext and defined-value boundaries', () => {
  function releasedVocabulary() {
    const vocabulary = { ...sampleWorkplaceVocabularyItem }
    delete vocabulary.sampleLabel
    return {
      ...vocabulary,
      access: 'plus' as const,
      publication: { status: 'released' as const, releasedAt: '2026-09-20', releaseNotes: 'Reviewed first private release.' },
      reviewer: { id: 'editor-1', reviewedAt: '2026-09-19' },
      rights: { status: 'cleared' as const, basis: 'original' as const, attestation: 'Original hypothetical teaching material.' },
    }
  }

  function withLessonOverlay(overlay: Record<string, unknown>) {
    return { ...releasedLesson(), supportOverlays: { byLocale: { en: overlay } } }
  }

  function withVocabularyOverlay(overlay: Record<string, unknown>) {
    return { ...releasedVocabulary(), supportOverlays: { byLocale: { en: overlay } } }
  }

  function runtimeBody(raw: Record<string, unknown>) {
    const body = { ...raw }
    delete body.publication
    delete body.reviewer
    delete body.rights
    return body
  }

  function expectRejectedAtEveryBoundary(raw: Record<string, unknown>) {
    const runtimeRejected = !validateWorkplaceLearnRuntimeItem(runtimeBody(raw)).ok
    const authoringRejected = !validateWorkplaceLearnItem(raw, { requireReleased: true }).ok
    let projectionRejected = false
    try {
      projectWorkplaceLearnRuntimeItem(raw as unknown as WorkplaceLearnAuthoringItem)
    } catch {
      projectionRejected = true
    }
    expect(runtimeRejected).toBe(true)
    expect(authoringRejected).toBe(true)
    expect(projectionRejected).toBe(true)
  }

  it('rejects complete inline emphasis and strikethrough for both kinds at runtime, authoring, and projection', () => {
    for (const value of ['*Supplement*', '_Supplement_', '~~obsolete~~']) {
      expectRejectedAtEveryBoundary(withLessonOverlay({ meaningInContext: value }))
      expectRejectedAtEveryBoundary(withVocabularyOverlay({ meaning: value }))
    }
  })

  it('rejects undefined-only overlays, including multiple supported keys, at all admission boundaries', () => {
    expectRejectedAtEveryBoundary(withLessonOverlay({ meaningInContext: undefined, whyItWorks: undefined }))
    expectRejectedAtEveryBoundary(withVocabularyOverlay({ meaning: undefined, workplaceNuance: undefined }))
  })

  it('accepts technical punctuation and ignores an optional undefined field when another supported value is defined', () => {
    const technical = 'API estimate 2 * 3; error_code; C++.'
    const lesson = withLessonOverlay({ meaningInContext: technical })
    const vocabulary = withVocabularyOverlay({ meaning: technical })
    expect(validateWorkplaceLearnRuntimeItem(runtimeBody(lesson)).ok).toBe(true)
    expect(validateWorkplaceLearnItem(lesson, { requireReleased: true }).ok).toBe(true)
    expect(() => projectWorkplaceLearnRuntimeItem(lesson)).not.toThrow()
    expect(validateWorkplaceLearnRuntimeItem(runtimeBody(vocabulary)).ok).toBe(true)
    expect(validateWorkplaceLearnItem(vocabulary, { requireReleased: true }).ok).toBe(true)
    expect(() => projectWorkplaceLearnRuntimeItem(vocabulary)).not.toThrow()

    const optionalUndefinedLesson = withLessonOverlay({ meaningInContext: undefined, whyItWorks: '事実と対応を分けて補足します。' })
    const optionalUndefinedVocabulary = withVocabularyOverlay({ meaning: undefined, workplaceNuance: '確定事項と予測を区別する語です。' })
    for (const raw of [optionalUndefinedLesson, optionalUndefinedVocabulary]) {
      expect(validateWorkplaceLearnRuntimeItem(runtimeBody(raw)).ok).toBe(true)
      expect(validateWorkplaceLearnItem(raw, { requireReleased: true }).ok).toBe(true)
      expect(() => projectWorkplaceLearnRuntimeItem(raw)).not.toThrow()
    }
  })

  it('accepts incomplete emphasis delimiters and leaves the existing core-text markup policy unchanged', () => {
    for (const value of ['*Supplement *', '_Supplement _']) {
      const lesson = withLessonOverlay({ meaningInContext: value })
      const vocabulary = withVocabularyOverlay({ meaning: value })
      for (const raw of [lesson, vocabulary]) {
        expect(validateWorkplaceLearnRuntimeItem(runtimeBody(raw)).ok).toBe(true)
        expect(validateWorkplaceLearnItem(raw, { requireReleased: true }).ok).toBe(true)
        expect(() => projectWorkplaceLearnRuntimeItem(raw)).not.toThrow()
      }
    }

    expect(validateWorkplaceLearnRuntimeItem({ ...sampleWorkplaceLearnItem, whatToDo: '*Supplement*' }).ok).toBe(true)
  })

  it('rejects intraword emphasis and sparse lesson example overlays across all admission boundaries', () => {
    expectRejectedAtEveryBoundary(withLessonOverlay({ meaningInContext: 'prefix*Supplement*' }))
    expectRejectedAtEveryBoundary(withVocabularyOverlay({ meaning: 'prefix*Supplement*' }))

    const sparseLessonOverlay = withLessonOverlay({ examples: new Array(sampleWorkplaceLearnItem.examples.length) })
    expectRejectedAtEveryBoundary(sparseLessonOverlay)

    const denseExampleOnlyLesson = withLessonOverlay({
      examples: Array.from(
        { length: sampleWorkplaceLearnItem.examples.length },
        () => ({ explanation: 'この例の補足説明です。' }),
      ),
    })
    expect(validateWorkplaceLearnRuntimeItem(runtimeBody(denseExampleOnlyLesson)).ok).toBe(true)
    expect(validateWorkplaceLearnItem(denseExampleOnlyLesson, { requireReleased: true }).ok).toBe(true)
    expect(() => projectWorkplaceLearnRuntimeItem(denseExampleOnlyLesson)).not.toThrow()
  })
})
