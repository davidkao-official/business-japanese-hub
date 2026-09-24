import { describe, expect, it } from 'vitest'
import { buildWorkplaceLearnCatalog, buildWorkplaceLearnCatalogWithPlusMetadata, workplaceLearnCatalog } from './catalog'
import { sampleWorkplaceLearnItem, sampleWorkplaceVocabularyItem } from './sample'
import { toWorkplaceLearnCatalogEntry } from './validate'
import type { WorkplaceLearnRuntimeItem } from './types'

const revision = 'a'.repeat(64)

describe('Workplace Learn public catalog projection', () => {
  it('projects only explicitly labeled Free teaching fixtures from runtime bodies', () => {
    expect(buildWorkplaceLearnCatalog([sampleWorkplaceLearnItem, sampleWorkplaceVocabularyItem])).toEqual(workplaceLearnCatalog)
    expect(() => buildWorkplaceLearnCatalog([{ ...sampleWorkplaceLearnItem, sampleLabel: undefined }])).toThrow('require an explicitly non-proprietary sample label')
  })

  it('accepts strict Plus catalog metadata without requiring a Plus runtime body', () => {
    const plusBody: WorkplaceLearnRuntimeItem = {
      ...sampleWorkplaceLearnItem,
      id: 'workplace-learn-plus-reporting',
      slug: 'plus-reporting',
      title: '状況を整理して報告する',
      access: 'plus',
      sampleLabel: undefined,
      relatedVocabularyIds: [],
    }
    const metadata = toWorkplaceLearnCatalogEntry(plusBody, { contentId: plusBody.id, revision })
    const catalog = buildWorkplaceLearnCatalogWithPlusMetadata(
      [sampleWorkplaceLearnItem, sampleWorkplaceVocabularyItem],
      [metadata],
    )
    expect(catalog).toHaveLength(3)
    expect(catalog[2]).toEqual(metadata)
    expect(catalog[2]).not.toHaveProperty('whatToSayJapanese')
  })

  it('validates Free Learn links against Plus lesson or vocabulary catalog IDs', () => {
    const plusVocabulary: WorkplaceLearnRuntimeItem = {
      ...sampleWorkplaceVocabularyItem,
      id: 'workplace-vocabulary-plus-estimate',
      slug: 'plus-estimate',
      access: 'plus',
      sampleLabel: undefined,
    }
    const linkedLesson = {
      ...sampleWorkplaceLearnItem,
      relatedLinks: [{ kind: 'learn' as const, label: plusVocabulary.title, labelLanguage: plusVocabulary.titleLanguage, targetId: plusVocabulary.id }],
    }
    const catalog = buildWorkplaceLearnCatalogWithPlusMetadata(
      [linkedLesson, sampleWorkplaceVocabularyItem],
      [toWorkplaceLearnCatalogEntry(plusVocabulary, { contentId: plusVocabulary.id, revision })],
    )
    expect(catalog.find((entry) => entry.id === linkedLesson.id)).toBeDefined()
    expect(catalog.find((entry) => entry.id === plusVocabulary.id)).toMatchObject({ kind: 'vocabulary', access: 'plus' })
  })

  it.each([
    ['runtime body field', { whatToSayJapanese: 'private Japanese body' }],
    ['unknown field', { editorialNotes: 'private review note' }],
    ['sample marker on Plus', { sampleLabel: 'non-proprietary-teaching-sample' }],
  ])('rejects Plus metadata with %s', (_name, extra) => {
    const plusBody: WorkplaceLearnRuntimeItem = {
      ...sampleWorkplaceLearnItem,
      id: 'workplace-learn-plus-private-test',
      slug: 'plus-private-test',
      access: 'plus',
      sampleLabel: undefined,
      relatedVocabularyIds: [],
    }
    const metadata = toWorkplaceLearnCatalogEntry(plusBody, { contentId: plusBody.id, revision })
    expect(() => buildWorkplaceLearnCatalogWithPlusMetadata(
      [sampleWorkplaceLearnItem, sampleWorkplaceVocabularyItem],
      [{ ...metadata, ...extra }],
    )).toThrow(/missing or unknown fields/)
  })

  it.each([
    ['title language', { titleLanguage: 'fr' }],
    ['lead language', { leadLanguage: 'fr' }],
  ])('rejects Plus metadata with unsupported %s', (_name, invalidLanguage) => {
    const metadata = toWorkplaceLearnCatalogEntry({
      ...sampleWorkplaceLearnItem,
      id: 'workplace-learn-language-test',
      slug: 'workplace-language-test',
      access: 'plus',
      sampleLabel: undefined,
      relatedVocabularyIds: [],
    }, { contentId: 'workplace-learn-language-test', revision })
    expect(() => buildWorkplaceLearnCatalogWithPlusMetadata(
      [sampleWorkplaceLearnItem, sampleWorkplaceVocabularyItem],
      [{ ...metadata, ...invalidLanguage }],
    )).toThrow(/catalog (title|lead) language/)
  })

  it.each([
    ['mismatched content ID', { contentId: 'different-id', revision }],
    ['invalid revision', { contentId: 'workplace-learn-plus-reference-test', revision: 'stale' }],
  ])('rejects Plus metadata with %s', (_name, releaseReference) => {
    expect(() => buildWorkplaceLearnCatalogWithPlusMetadata(
      [sampleWorkplaceLearnItem, sampleWorkplaceVocabularyItem],
      [{
        schemaVersion: 1,
        kind: 'lesson',
        id: 'workplace-learn-plus-reference-test',
        slug: 'plus-reference-test',
        title: '報告を整える',
        titleLanguage: 'ja',
        lead: '状況と次の対応を整理します。',
        leadLanguage: 'ja',
        category: 'workplace-communication',
        tags: ['reporting'],
        access: 'plus',
        releaseReference,
      }],
    )).toThrow('Invalid Plus Workplace Learn release reference')
  })
})
