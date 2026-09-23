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
    const changed = preparePrivateReadingRelease(source.id, { ...source, explanationZhTW: '更新後的原創說明。' })
    expect(changed.ok).toBe(true)
    if (changed.ok) expect(changed.value.revision).not.toBe(result.value.revision)
  })

  it('fails closed for free, draft, id-mismatched, and PostgreSQL-incompatible items', () => {
    const source = releasedPlusItem()
    expect(preparePrivateReadingRelease(source.id, sampleReadingItem)).toMatchObject({ ok: false })
    expect(preparePrivateReadingRelease(source.id, { ...source, publication: { status: 'draft' } })).toMatchObject({ ok: false })
    expect(preparePrivateReadingRelease('other-id', source)).toMatchObject({ ok: false, reason: 'Reading id does not match the requested server delivery reference' })
    expect(preparePrivateReadingRelease(source.id, { ...source, japaneseMaterial: { kind: 'original', text: '\u0000' } })).toMatchObject({ ok: false, reason: 'Reading payload contains strings incompatible with PostgreSQL jsonb' })
  })
})
