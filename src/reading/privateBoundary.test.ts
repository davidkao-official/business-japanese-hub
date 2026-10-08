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

  it('recognizes renamed legacy V1 and Japanese V2 private authoring shapes', () => {
    const legacyV1 = {
      schemaVersion: 1,
      id: 'reading-legacy-private',
      slug: 'legacy-private',
      publication: { status: 'draft' },
      rights: { status: 'pending', basis: 'original' },
      japaneseMaterial: { kind: 'original', text: '架空の日本語原文。' },
      explanationZhTW: '舊版中文解說。',
      businessContextZhTW: '舊版中文背景。',
    }
    const japaneseV2 = {
      schemaVersion: 2,
      id: 'reading-current-private',
      slug: 'current-private',
      publication: { status: 'draft' },
      rights: { status: 'pending', basis: 'original' },
      japaneseMaterial: { kind: 'original', text: '架空の日本語原文。' },
      explanationJa: '架空の日本語解説。',
      vocabulary: [{ term: '架空語', meaningJa: '架空の日本語の意味。' }],
      logicAnalysis: [{ label: '現状', explanationJa: '架空の日本語による説明。' }],
      businessContextJa: '架空の日本語背景。',
    }
    expect(privateReadingArtifactReason('nested/renamed-v1.bin', JSON.stringify(legacyV1))).toBe('authoring shape')
    expect(privateReadingArtifactReason('nested/renamed-v2.bin', JSON.stringify(japaneseV2))).toBe('authoring shape')
  })

  it('allows the explicit public teaching fixture and body-free discovery metadata', () => {
    expect(privateReadingArtifactReason('src/reading/sample.json', JSON.stringify(sampleReadingItem))).toBeNull()
    expect(privateReadingArtifactReason('src/reading/catalog.json', JSON.stringify(toReadingCatalogEntry(sampleReadingItem)))).toBeNull()
  })
})
