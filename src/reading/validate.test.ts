import { describe, expect, it } from 'vitest'
import { sampleReadingItem } from './fixtures/sample-reading'
import { toReadingCatalogEntry, validateReadingItem } from './validate'

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

describe('Reading authoring contract', () => {
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
    expect(validateReadingItem({ ...base, explanationZhTW: '<script>alert(1)</script>' }).ok).toBe(false)
    expect(validateReadingItem({ ...base, source: { ...base.source, url: 'javascript:alert(1)' } }).ok).toBe(false)
    expect(validateReadingItem({ ...base, images: ['/private/asset.png'] }).ok).toBe(false)
    expect(validateReadingItem({ ...base, publication: { ...base.publication, releasedAt: '2026-99-99' } }).ok).toBe(false)
  })

  it('projects a body-free catalog entry', () => {
    const catalog = toReadingCatalogEntry(sampleReadingItem)
    expect(catalog).toMatchObject({ id: sampleReadingItem.id, access: 'free', sampleLabel: 'non-proprietary-teaching-sample' })
    expect(catalog).not.toHaveProperty('japaneseMaterial')
    expect(catalog).not.toHaveProperty('explanationZhTW')
    expect(catalog).not.toHaveProperty('vocabulary')
    expect(catalog).not.toHaveProperty('releaseReference')
    expect(sampleReadingItem.relatedLinks).toContainEqual({
      kind: 'learn', label: '論點如何在會議中承接與轉換', targetId: 'meeting-japanese-course-correction',
    })
  })

  it('admits a strictly shaped immutable reference only for matching Plus metadata', () => {
    const plus = { ...sampleReadingItem, access: 'plus' as const }
    const releaseReference = { contentId: plus.id, revision: 'a'.repeat(64) }
    expect(toReadingCatalogEntry(plus, releaseReference)).toMatchObject({ releaseReference })
    expect(() => toReadingCatalogEntry(sampleReadingItem, releaseReference)).toThrow('Reading release reference is invalid for this catalog entry')
    expect(() => toReadingCatalogEntry(plus, { ...releaseReference, revision: 'stale' })).toThrow('Reading release reference is invalid for this catalog entry')
  })
})
