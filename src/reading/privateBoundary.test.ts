import { describe, expect, it } from 'vitest'
import { privateReadingArtifactReason } from '../../scripts/lib/private-reading-artifact'
import { sampleReadingItem } from './fixtures/sample-reading'
import { toReadingCatalogEntry } from './validate'

describe('public Git Reading authoring boundary', () => {
  const authoring = {
    ...sampleReadingItem,
    publication: { status: 'draft' },
    rights: { status: 'pending', basis: 'original', attestation: 'Private rights review' },
  }

  it('rejects the canonical filename even before the authoring record is complete', () => {
    expect(privateReadingArtifactReason('nested/reading-item.json', '{}')).toBe('canonical filename')
  })

  it('rejects a renamed complete private draft regardless of extension', () => {
    expect(privateReadingArtifactReason('nested/draft.json', JSON.stringify(authoring))).toBe('authoring shape')
    expect(privateReadingArtifactReason('nested/article.txt', `\uFEFF${JSON.stringify(authoring)}`)).toBe('authoring shape')
  })

  it('allows the explicit public teaching fixture and body-free discovery metadata', () => {
    expect(privateReadingArtifactReason('src/reading/sample.json', JSON.stringify(sampleReadingItem))).toBeNull()
    expect(privateReadingArtifactReason('src/reading/catalog.json', JSON.stringify(toReadingCatalogEntry(sampleReadingItem)))).toBeNull()
  })
})
