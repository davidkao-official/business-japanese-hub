import assert from 'node:assert/strict'
import { test } from 'node:test'
import { privateWorkplaceArtifactReason } from './private-workplace-artifact'
import { sampleWorkplaceLearnItem, sampleWorkplaceVocabularyItem } from '../../src/workplace-learn/sample'

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
  assert.equal(privateWorkplaceArtifactReason('nested/draft.json', JSON.stringify(authoring(sampleWorkplaceLearnItem))), 'authoring shape')
  assert.equal(privateWorkplaceArtifactReason('nested/term.txt', `\uFEFF${JSON.stringify(authoring(sampleWorkplaceVocabularyItem))}`), 'authoring shape')
})

test('public Git Workplace Learn boundary rejects direct Plus runtime bodies and delivery wrappers', () => {
  const plusLesson = { ...sampleWorkplaceLearnItem, access: 'plus' }
  const plusVocabulary = { ...sampleWorkplaceVocabularyItem, access: 'plus' }
  assert.equal(privateWorkplaceArtifactReason('nested/lesson.json', JSON.stringify(plusLesson)), 'Plus runtime shape')
  assert.equal(privateWorkplaceArtifactReason('nested/vocabulary.json', JSON.stringify(plusVocabulary)), 'Plus runtime shape')
  assert.equal(privateWorkplaceArtifactReason('nested/release.json', JSON.stringify({ workplaceLearn: plusLesson })), 'Plus runtime shape')
  assert.equal(privateWorkplaceArtifactReason('nested/vocabulary-release.json', JSON.stringify({ workplaceLearn: plusVocabulary })), 'Plus runtime shape')
})

test('public Git Workplace Learn authoring boundary allows runtime fixtures and body-free catalog metadata', () => {
  assert.equal(privateWorkplaceArtifactReason('src/workplace-learn/sample.json', JSON.stringify(sampleWorkplaceLearnItem)), null)
  assert.equal(privateWorkplaceArtifactReason('src/workplace-learn/catalog.json', JSON.stringify({
    schemaVersion: 1, kind: 'lesson', id: sampleWorkplaceLearnItem.id, slug: sampleWorkplaceLearnItem.slug,
    title: sampleWorkplaceLearnItem.title, lead: sampleWorkplaceLearnItem.lead, access: 'free', category: sampleWorkplaceLearnItem.category,
  })), null)
  assert.equal(privateWorkplaceArtifactReason('src/workplace-learn/plus-catalog.json', JSON.stringify({
    schemaVersion: 1, kind: 'lesson', id: 'workplace-plus-example', slug: 'workplace-plus-example',
    title: 'Private title metadata only', lead: 'Metadata only.', access: 'plus', category: 'workplace-communication',
  })), null)
})
