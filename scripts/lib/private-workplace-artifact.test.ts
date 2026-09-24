import assert from 'node:assert/strict'
import { test } from 'node:test'
import { privateWorkplaceArtifactReason } from './private-workplace-artifact'
import { sampleWorkplaceLearnItem, sampleWorkplaceVocabularyItem } from '../../src/workplace-learn/sample'
import { preparePrivateWorkplaceLearnRelease } from '../../src/content-delivery/privateWorkplaceLearn'

function authoring(item: typeof sampleWorkplaceLearnItem | typeof sampleWorkplaceVocabularyItem) {
  const body = { ...item }
  delete body.sampleLabel
  return {
    ...body,
    access: 'plus',
    publication: { status: 'draft' },
    reviewer: { id: 'editor-1', reviewedAt: '2026-09-23' },
    rights: { status: 'pending', basis: 'original', attestation: 'Private review record.' },
  }
}

test('public Git Workplace Learn authoring boundary rejects the canonical filename before the body is complete', () => {
  assert.equal(privateWorkplaceArtifactReason('nested/workplace-item.json', '{}'), 'canonical filename')
})

test('public Git Workplace Learn authoring boundary rejects renamed complete private drafts', () => {
  const lessonDraft = authoring(sampleWorkplaceLearnItem)
  const vocabularyDraft = authoring(sampleWorkplaceVocabularyItem)
  assert.equal(privateWorkplaceArtifactReason('nested/draft.json', JSON.stringify(lessonDraft)), 'authoring shape')
  assert.equal(privateWorkplaceArtifactReason('nested/term.txt', `\uFEFF${JSON.stringify(vocabularyDraft)}`), 'authoring shape')
  assert.equal(privateWorkplaceArtifactReason('nested/draft-batch.json', JSON.stringify([lessonDraft])), 'authoring shape')
  assert.equal(privateWorkplaceArtifactReason('nested/nested-drafts.json', JSON.stringify([[vocabularyDraft]])), 'authoring shape')
})

test('public Git Workplace Learn boundary rejects direct Plus runtime bodies and delivery wrappers', () => {
  const plusLesson = { ...sampleWorkplaceLearnItem, access: 'plus' }
  const plusVocabulary = { ...sampleWorkplaceVocabularyItem, access: 'plus' }
  assert.equal(privateWorkplaceArtifactReason('nested/lesson.json', JSON.stringify(plusLesson)), 'Plus runtime shape')
  assert.equal(privateWorkplaceArtifactReason('nested/vocabulary.json', JSON.stringify(plusVocabulary)), 'Plus runtime shape')
  assert.equal(privateWorkplaceArtifactReason('nested/release.json', JSON.stringify({ workplaceLearn: plusLesson })), 'Plus runtime shape')
  assert.equal(privateWorkplaceArtifactReason('nested/vocabulary-release.json', JSON.stringify({ workplaceLearn: plusVocabulary })), 'Plus runtime shape')
  for (const item of [sampleWorkplaceLearnItem, sampleWorkplaceVocabularyItem]) {
    const authoring = { ...item, access: 'plus' as const, sampleLabel: undefined,
      publication: { status: 'released' as const, releasedAt: '2026-09-24', releaseNotes: 'Reviewed original fixture for boundary test.' },
      reviewer: { id: 'reviewer-1', reviewedAt: '2026-09-23' },
      rights: { status: 'cleared' as const, basis: 'original' as const, attestation: 'Original material used only as a boundary fixture.' },
    }
    const prepared = preparePrivateWorkplaceLearnRelease(item.id, authoring)
    assert.equal(prepared.ok, true)
    if (!prepared.ok) continue
    assert.equal(privateWorkplaceArtifactReason('renamed-release.json', JSON.stringify(prepared.value)), 'Plus runtime shape')
    assert.equal(privateWorkplaceArtifactReason('renamed-payload.json', JSON.stringify(prepared.value.payload)), 'Plus runtime shape')
    assert.equal(privateWorkplaceArtifactReason('renamed-batch.json', JSON.stringify([prepared.value])), 'Plus runtime shape')
    assert.equal(privateWorkplaceArtifactReason('renamed-nested-batch.json', JSON.stringify([[prepared.value]])), 'Plus runtime shape')
    assert.equal(privateWorkplaceArtifactReason('renamed-delivery.json', JSON.stringify({
      content: {
        contentId: prepared.value.contentId,
        revision: prepared.value.revision,
        contentKind: prepared.value.contentKind,
        payload: prepared.value.payload,
      },
    })), 'Plus runtime shape')
  }
})

test('public Git Workplace Learn authoring boundary allows runtime fixtures and body-free catalog metadata', () => {
  const freeCatalogEntry = {
    schemaVersion: 1, kind: 'lesson', id: sampleWorkplaceLearnItem.id, slug: sampleWorkplaceLearnItem.slug,
    title: sampleWorkplaceLearnItem.title, lead: sampleWorkplaceLearnItem.lead, access: 'free', category: sampleWorkplaceLearnItem.category,
  }
  const plusCatalogEntry = {
    schemaVersion: 1, kind: 'lesson', id: 'workplace-plus-example', slug: 'workplace-plus-example',
    title: 'Private title metadata only', titleLanguage: 'en', lead: 'Metadata only.', leadLanguage: 'en', access: 'plus', category: 'workplace-communication',
  }
  assert.equal(privateWorkplaceArtifactReason('src/workplace-learn/sample.json', JSON.stringify(sampleWorkplaceLearnItem)), null)
  assert.equal(privateWorkplaceArtifactReason('src/workplace-learn/catalog.json', JSON.stringify(freeCatalogEntry)), null)
  assert.equal(privateWorkplaceArtifactReason('src/workplace-learn/plus-catalog.json', JSON.stringify(plusCatalogEntry)), null)
  assert.equal(privateWorkplaceArtifactReason('src/workplace-learn/free-wrapper.json', JSON.stringify({ workplaceLearn: sampleWorkplaceLearnItem })), null)
  assert.equal(privateWorkplaceArtifactReason('src/workplace-learn/catalog-batch.json', JSON.stringify([freeCatalogEntry, plusCatalogEntry])), null)
  assert.equal(privateWorkplaceArtifactReason('src/workplace-learn/nested-catalog-batch.json', JSON.stringify([[freeCatalogEntry], [plusCatalogEntry]])), null)
})

test('public Git Workplace Learn boundary fails closed when bounded JSON traversal limits are exceeded', () => {
  const oversizedArray = JSON.stringify(new Array(10_001).fill(null))
  assert.notEqual(privateWorkplaceArtifactReason('nested/oversized.json', oversizedArray), null)

  let deeplyNested: unknown = null
  for (let depth = 0; depth < 66; depth += 1) deeplyNested = [deeplyNested]
  assert.notEqual(privateWorkplaceArtifactReason('nested/deep.json', JSON.stringify(deeplyNested)), null)
})
