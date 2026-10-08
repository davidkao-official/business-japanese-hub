import { describe, expect, it } from 'vitest'
import { sampleReadingItem } from './fixtures/sample-reading'
import { toReadingCatalogEntry, validateReadingItem, validateReadingRuntimeItem } from './validate'

function releasedPlusItem() {
  const base = { ...sampleReadingItem }
  delete base.sampleLabel
  return {
    ...base,
    access: 'plus' as const,
    publication: { status: 'released' as const, releasedAt: '2026-09-20', releaseNotes: 'Reviewed first release.' },
    reviewer: { id: 'editor-1', reviewedAt: '2026-09-19' },
    rights: { status: 'cleared' as const, basis: 'original' as const, attestation: 'Original fictional teaching material.' },
  }
}

function japaneseV2AuthoringItem() {
  return {
    schemaVersion: 2,
    id: 'reading-synthetic-v2',
    slug: 'synthetic-japanese-contract',
    title: '問い合わせ対応の改善提案',
    summary: '架空の提案書から、課題・施策・効果のつながりを読み取ります。',
    category: 'business-document',
    tags: ['proposal-reading'],
    access: 'plus',
    source: { type: 'original', label: '架空の社内提案書' },
    japaneseMaterial: { kind: 'original', text: '問い合わせへの回答に平均三日を要している。' },
    explanationJa: '冒頭で現状を示し、次に改善策、最後に期待する効果を説明しています。',
    vocabulary: [{ term: '問い合わせ', reading: 'といあわせ', meaningJa: '相手から寄せられた質問や確認の連絡。', noteJa: '社内外の照会に広く使う表現です。' }],
    logicAnalysis: [{ label: '現状と課題', japaneseText: '回答に平均三日を要している。', explanationJa: '対応にかかる時間を示し、改善の必要性を具体化しています。' }],
    businessContextJa: '顧客対応の提案では、現状の測定方法と改善後の確認方法も合わせて示します。',
    relatedLinks: [],
    seo: { title: '提案書の論点を読む', description: '架空の提案書で論点のつながりを練習します。' },
    publication: { status: 'draft' },
    rights: { status: 'pending', basis: 'original', attestation: 'Synthetic validation fixture.' },
    supportOverlays: {
      byLocale: {
        'zh-TW': {
          explanation: '先說明現況，再提出改善方法與預期效果。',
          businessContext: '客戶服務提案也會交代改善方式。',
          vocabulary: [{ term: '問い合わせ', meaning: '詢問', note: '用於工作上的照會。' }],
          logicAnalysis: [{ label: '現況與課題', explanation: '以處理時間具體說明課題。' }],
          commentary: '此為測試用的選擇性補充說明。',
        },
      },
    },
  }
}

describe('Reading authoring contract', () => {
  it('accepts required Japanese schema-v2 core with optional locale-keyed support', () => {
    const current = japaneseV2AuthoringItem()
    const withoutSupport = { ...current }
    Reflect.deleteProperty(withoutSupport, 'supportOverlays')
    expect(validateReadingItem(current).ok).toBe(true)
    expect(validateReadingItem(withoutSupport).ok).toBe(true)
  })

  it('accepts bounded BCP-47-like support locale tags', () => {
    const current = japaneseV2AuthoringItem()
    const overlay = current.supportOverlays.byLocale['zh-TW']
    expect(validateReadingItem({
      ...current,
      supportOverlays: { byLocale: { 'zh-Hant': overlay, 'en-US': overlay, ko: overlay } },
    }).ok).toBe(true)
    expect(validateReadingItem({
      ...current,
      supportOverlays: { byLocale: { 'zh-!': overlay } },
    }).ok).toBe(false)
  })

  it.each(['explanationJa', 'businessContextJa', 'vocabulary.meaningJa', 'logicAnalysis.explanationJa'] as const)(
    'rejects missing Japanese %s even when all corresponding zh-TW support exists',
    (layer) => {
      const missingJapanese = japaneseV2AuthoringItem()
      if (layer === 'explanationJa' || layer === 'businessContextJa') {
        Reflect.deleteProperty(missingJapanese, layer)
      } else if (layer === 'vocabulary.meaningJa') {
        Reflect.deleteProperty(missingJapanese.vocabulary[0], 'meaningJa')
      } else {
        Reflect.deleteProperty(missingJapanese.logicAnalysis[0], 'explanationJa')
      }
      expect(validateReadingItem(missingJapanese)).toMatchObject({ ok: false })
    },
  )

  it('rejects legacy and unsupported schemas in the current authoring validator', () => {
    const current = japaneseV2AuthoringItem()
    expect(validateReadingItem({ ...current, schemaVersion: 1 }).ok).toBe(false)
    expect(validateReadingItem({ ...current, schemaVersion: 3 }).ok).toBe(false)
  })

  it('keeps optional support strictly nested and plain text', () => {
    const current = japaneseV2AuthoringItem()
    const overlay = current.supportOverlays.byLocale['zh-TW']
    expect(validateReadingItem({
      ...current,
      supportOverlays: { byLocale: { 'zh-TW': { ...overlay, privateReviewerNote: 'keep private' } } },
    }).ok).toBe(false)
    expect(validateReadingItem({
      ...current,
      supportOverlays: { byLocale: { 'zh-TW': { ...overlay, explanation: '<script>unsafe</script>' } } },
    }).ok).toBe(false)
    expect(validateReadingItem({
      ...current,
      supportOverlays: { byLocale: { 'zh-TW': { ...overlay, businessContext: '<script>unsafe</script>' } } },
    }).ok).toBe(false)
    expect(validateReadingItem({
      ...current,
      supportOverlays: { byLocale: { 'zh-TW': { ...overlay, vocabulary: [{ ...overlay.vocabulary[0]!, reviewerNote: 'private' }] } } },
    }).ok).toBe(false)
    expect(validateReadingItem({
      ...current,
      supportOverlays: { byLocale: { 'zh-TW': { ...overlay, vocabulary: [{ ...overlay.vocabulary[0]!, term: '<script>unsafe</script>' }] } } },
    }).ok).toBe(false)
    expect(validateReadingItem({
      ...current,
      supportOverlays: { byLocale: { 'zh-TW': { ...overlay, vocabulary: [{ ...overlay.vocabulary[0]!, meaning: '<script>unsafe</script>' }] } } },
    }).ok).toBe(false)
    expect(validateReadingItem({
      ...current,
      supportOverlays: { byLocale: { 'zh-TW': { ...overlay, vocabulary: [{ ...overlay.vocabulary[0]!, note: '<script>unsafe</script>' }] } } },
    }).ok).toBe(false)
    expect(validateReadingItem({
      ...current,
      supportOverlays: { byLocale: { 'zh-TW': { ...overlay, logicAnalysis: [{ ...overlay.logicAnalysis[0]!, privateReviewerNote: 'private' }] } } },
    }).ok).toBe(false)
    expect(validateReadingItem({
      ...current,
      supportOverlays: { byLocale: { 'zh-TW': { ...overlay, logicAnalysis: [{ ...overlay.logicAnalysis[0]!, label: '<script>unsafe</script>' }] } } },
    }).ok).toBe(false)
    expect(validateReadingItem({
      ...current,
      supportOverlays: { byLocale: { 'zh-TW': { ...overlay, logicAnalysis: [{ ...overlay.logicAnalysis[0]!, explanation: '<script>unsafe</script>' }] } } },
    }).ok).toBe(false)
    expect(validateReadingItem({
      ...current,
      supportOverlays: { byLocale: { 'zh-TW': { ...overlay, commentary: '<script>unsafe</script>' } } },
    }).ok).toBe(false)
  })

  it('accepts the explicitly marked original sample with valid released editorial metadata', () => {
    expect(validateReadingItem(releasedPlusItem(), { requireReleased: true }).ok).toBe(true)
  })

  it('supports draft records while requiring reviewed and rights-cleared data for release', () => {
    const draft = { ...releasedPlusItem(), publication: { status: 'draft' as const }, rights: { status: 'pending' as const, basis: 'original' as const, attestation: 'Pending review.' } }
    expect(validateReadingItem(draft).ok).toBe(true)
    const invalidRelease = { ...releasedPlusItem(), reviewer: undefined, rights: { ...releasedPlusItem().rights, status: 'pending' as const } }
    const result = validateReadingItem(invalidRelease, { requireReleased: true })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.map((issue) => issue.path)).toContain('$.reviewer')
  })

  it('rejects undeclared authoring fields, markup, unsafe URLs, and private asset fields', () => {
    const base = releasedPlusItem()
    expect(validateReadingItem({ ...base, reviewNotes: 'private editorial feedback' }).ok).toBe(false)
    expect(validateReadingItem({ ...base, explanationJa: '<script>alert(1)</script>' }).ok).toBe(false)
    expect(validateReadingItem({ ...base, source: { ...base.source, url: 'javascript:alert(1)' } }).ok).toBe(false)
    expect(validateReadingItem({ ...base, images: ['/private/asset.png'] }).ok).toBe(false)
    expect(validateReadingItem({ ...base, publication: { ...base.publication, releasedAt: '2026-99-99' } }).ok).toBe(false)
  })

  it('projects a body-free catalog entry', () => {
    const catalog = toReadingCatalogEntry(sampleReadingItem)
    expect(catalog).toMatchObject({ id: sampleReadingItem.id, access: 'free', sampleLabel: 'non-proprietary-teaching-sample' })
    expect(catalog).not.toHaveProperty('japaneseMaterial')
    expect(catalog).not.toHaveProperty('explanationJa')
    expect(catalog).not.toHaveProperty('supportOverlays')
    expect(catalog).not.toHaveProperty('vocabulary')
    expect(catalog).not.toHaveProperty('releaseReference')
    expect(catalog).not.toHaveProperty('releasedAt')
    expect(sampleReadingItem.relatedLinks).toContainEqual({
      kind: 'learn', label: '会議で論点を受けて展開する', targetId: 'meeting-japanese-course-correction',
    })
  })

  it('admits a strictly shaped immutable reference only for matching Plus metadata', () => {
    const plus = { ...sampleReadingItem, access: 'plus' as const }
    const releaseReference = { contentId: plus.id, revision: 'a'.repeat(64) }
    expect(toReadingCatalogEntry(plus, releaseReference)).toMatchObject({ releaseReference })
    expect(() => toReadingCatalogEntry(sampleReadingItem, releaseReference)).toThrow('Reading release reference is invalid for this catalog entry')
    expect(() => toReadingCatalogEntry(plus, { ...releaseReference, revision: 'stale' })).toThrow('Reading release reference is invalid for this catalog entry')
  })

  it('validates runtime responses without accepting authoring records or malformed nested data', () => {
    const validRuntime = { ...sampleReadingItem, releasedAt: '2026-09-20' }
    expect(validateReadingRuntimeItem(validRuntime)).toMatchObject({ ok: true })
    expect(validateReadingRuntimeItem({ reading: validRuntime }).ok).toBe(false)
    expect(validateReadingRuntimeItem({ ...validRuntime, reviewer: { id: 'editor-1' } }).ok).toBe(false)
    expect(validateReadingRuntimeItem({ ...validRuntime, rights: { basis: 'original' } }).ok).toBe(false)
    expect(validateReadingRuntimeItem({ ...validRuntime, source: { ...validRuntime.source, url: 'https://user:secret@example.com' } }).ok).toBe(false)
    expect(validateReadingRuntimeItem({ ...validRuntime, explanationJa: '[外部連結](https://example.com)' }).ok).toBe(false)
    expect(validateReadingRuntimeItem({ ...validRuntime, japaneseMaterial: { kind: 'original', text: 12 } }).ok).toBe(false)
    expect(validateReadingRuntimeItem({ ...validRuntime, releasedAt: '2026-99-99' }).ok).toBe(false)
  })

  it('accepts Japanese schema-v2 runtime data and rejects legacy or incomplete core data', () => {
    const authoring = japaneseV2AuthoringItem()
    const runtime: Record<string, unknown> = { ...authoring, releasedAt: '2026-09-20' }
    Reflect.deleteProperty(runtime, 'publication')
    Reflect.deleteProperty(runtime, 'rights')
    expect(validateReadingRuntimeItem(runtime)).toMatchObject({ ok: true })
    expect(validateReadingRuntimeItem({ ...runtime, schemaVersion: 1 }).ok).toBe(false)

    const missingJapanese = { ...runtime }
    Reflect.deleteProperty(missingJapanese, 'explanationJa')
    expect(validateReadingRuntimeItem(missingJapanese).ok).toBe(false)
  })
})
