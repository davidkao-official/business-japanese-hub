import { describe, expect, it } from 'vitest'
import { sampleReadingItem } from '../reading/fixtures/sample-reading'
import { preparePrivateReadingRelease } from './privateReading'

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

describe('private Reading release preparation', () => {
  it('prepares an immutable member envelope and strips source review and rights records', () => {
    const source = releasedPlusItem()
    const result = preparePrivateReadingRelease(source.id, source)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({ contentId: source.id, contentKind: 'reading', accessScope: 'member' })
    expect(result.value.revision).toMatch(/^[a-f0-9]{64}$/)
    expect(result.value.payload.reading).not.toHaveProperty('publication')
    expect(result.value.payload.reading).not.toHaveProperty('reviewer')
    expect(result.value.payload.reading).not.toHaveProperty('rights')
    expect(result.value.payload.reading.releasedAt).toBe('2026-09-20')
    expect(result.value.schemaVersion).toBe(1)
    expect(result.value.payload.reading.schemaVersion).toBe(2)
    expect(result.value.payload.reading).toHaveProperty('supportOverlays', source.supportOverlays)
    expect(result.value.payload.reading).not.toHaveProperty('explanationZhTW')
    const projectedOverlay = result.value.payload.reading.supportOverlays!.byLocale['zh-TW']!
    projectedOverlay.explanation = 'Mutated projected support copy.'
    expect(source.supportOverlays!.byLocale['zh-TW']!.explanation).not.toBe(projectedOverlay.explanation)

    const changedJapanese = preparePrivateReadingRelease(source.id, { ...source, explanationJa: '更新後の日本語解説。' })
    expect(changedJapanese.ok).toBe(true)
    if (changedJapanese.ok) expect(changedJapanese.value.revision).not.toBe(result.value.revision)

    const zhOverlay = source.supportOverlays!.byLocale['zh-TW']!
    const changedSupport = preparePrivateReadingRelease(source.id, {
      ...source,
      supportOverlays: { byLocale: { ...source.supportOverlays!.byLocale, 'zh-TW': { ...zhOverlay, explanation: '更新後的選擇性補充。' } } },
    })
    expect(changedSupport.ok).toBe(true)
    if (changedSupport.ok) expect(changedSupport.value.revision).not.toBe(result.value.revision)
  })

  it('fails closed for free, draft, id-mismatched, and PostgreSQL-incompatible items', () => {
    const source = releasedPlusItem()
    expect(preparePrivateReadingRelease(source.id, sampleReadingItem)).toMatchObject({ ok: false })
    expect(preparePrivateReadingRelease(source.id, { ...source, publication: { status: 'draft' } })).toMatchObject({ ok: false })
    expect(preparePrivateReadingRelease(source.id, { ...source, schemaVersion: 1 })).toMatchObject({ ok: false })
    expect(preparePrivateReadingRelease(source.id, { ...source, schemaVersion: 3 })).toMatchObject({ ok: false })
    expect(preparePrivateReadingRelease('other-id', source)).toMatchObject({ ok: false, reason: 'Reading id does not match the requested server delivery reference' })
    expect(preparePrivateReadingRelease(source.id, { ...source, japaneseMaterial: { kind: 'original', text: '\u0000' } })).toMatchObject({ ok: false, reason: 'Reading payload contains strings incompatible with PostgreSQL jsonb' })
    const missingJapanese = { ...source }
    Reflect.deleteProperty(missingJapanese, 'explanationJa')
    expect(preparePrivateReadingRelease(source.id, missingJapanese)).toMatchObject({ ok: false, reason: expect.stringContaining('invalid Reading item') })
  })
})
