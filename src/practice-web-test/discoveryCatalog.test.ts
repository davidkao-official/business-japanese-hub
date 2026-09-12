import { describe, expect, it } from 'vitest'
import type { PrivatePracticeQuestionBankRelease } from '../content-delivery/privatePracticeQuestionBank'
import {
  createPracticeDiscoveryCatalog,
  validatePracticeDiscoveryCatalog,
} from './discoveryCatalog'

function syntheticRelease(overrides: Partial<PrivatePracticeQuestionBankRelease> = {}): PrivatePracticeQuestionBankRelease {
  const question = {
    id: 'synthetic-question',
    version: 1,
    testFamily: 'spi',
    domain: 'verbal' as const,
    category: 'vocabulary-in-context',
    deliveryProfile: 'web',
    practiceProfile: 'untimed-learning',
    difficulty: 'foundation' as const,
    promptJa: 'テスト専用の問題文です。',
    answer: {
      input: { kind: 'single-choice' as const, choices: [{ id: 'yes', textJa: 'はい' }] },
      expectedAnswer: { kind: 'single-choice' as const, choiceId: 'yes' },
      scoring: { kind: 'exact-choice' as const },
    },
    coreExplanation: { concise: 'テスト専用の解説です。', whatIsAskedJa: '答えること。' },
    itemAnalysis: { languageLoads: [], reasoningLoads: [], executionLoads: [] },
  }
  return {
    schemaVersion: 1,
    contentId: 'practice-web-test-spi-v1',
    revision: 'a'.repeat(64),
    contentKind: 'practice-question-bank',
    accessScope: 'member',
    payload: {
      questionBank: {
        schemaVersion: 1,
        version: 1,
        vocabularyCatalog: { version: 1, terms: {} },
        questions: [question],
      },
    },
    ...overrides,
  }
}

describe('Practice discovery catalog', () => {
  it('projects only the declared discovery fields and excludes editorial/runtime data', () => {
    const catalog = createPracticeDiscoveryCatalog(syntheticRelease())

    expect(catalog).toEqual({
      schemaVersion: 1,
      releaseIdentity: { contentId: 'practice-web-test-spi-v1', revision: 'a'.repeat(64) },
      families: [{
        testFamily: 'spi',
        domains: [{
          domain: 'verbal',
          categories: [{
            category: 'vocabulary-in-context',
            releasedCount: 1,
            modes: ['untimed-learning'],
          }],
        }],
      }],
    })
    const serialized = JSON.stringify(catalog)
    for (const forbidden of ['synthetic-question', 'テスト専用の問題文', '答え', '解説', 'itemAnalysis', 'vocabularyCatalog']) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  it('counts only the latest released version of a stable question ID', () => {
    const release = syntheticRelease()
    const first = release.payload.questionBank.questions[0]!
    release.payload.questionBank.questions.push({ ...first, version: 2 })

    const catalog = createPracticeDiscoveryCatalog(release)
    expect(catalog.families[0]?.domains[0]?.categories[0]?.releasedCount).toBe(1)
  })

  it('counts only web-delivery items in the browser discovery projection', () => {
    const release = syntheticRelease()
    const first = release.payload.questionBank.questions[0]!
    const web = {
      ...first,
      answer: {
        input: { kind: 'single-choice' as const, choices: [{ id: 'yes', textJa: 'はい' }] },
        expectedAnswer: { kind: 'single-choice' as const, choiceId: 'yes' },
        scoring: { kind: 'exact-choice' as const },
      },
    }
    release.payload.questionBank.questions[0] = web
    release.payload.questionBank.questions.push({ ...web, id: 'test-center-question', deliveryProfile: 'test-center' })
    release.payload.questionBank.questions.push({ ...web, id: 'short-text-question', answer: {
      input: { kind: 'short-text' as const },
      expectedAnswer: { kind: 'short-text' as const, value: '答え' },
      scoring: { kind: 'exact-text' as const },
    } })

    const catalog = createPracticeDiscoveryCatalog(release)
    expect(catalog.families[0]?.domains[0]?.categories[0]?.releasedCount).toBe(1)
  })

  it('rejects unsupported items with unknown metadata before browser filtering', () => {
    const release = syntheticRelease()
    const first = release.payload.questionBank.questions[0]!
    release.payload.questionBank.questions.push({ ...first, id: 'unsupported-unknown-category', category: 'private-editorial-label', answer: {
      input: { kind: 'short-text' as const },
      expectedAnswer: { kind: 'short-text' as const, value: '答え' },
      scoring: { kind: 'exact-text' as const },
    } })

    expect(() => createPracticeDiscoveryCatalog(release)).toThrow('not registered for public discovery')
  })

  it('rejects unregistered private family/category/mode metadata before it becomes public', () => {
    const release = syntheticRelease()
    release.payload.questionBank.questions[0]!.category = 'private-editorial-label'
    expect(() => createPracticeDiscoveryCatalog(release)).toThrow('not registered for public discovery')

    const unknownMode = syntheticRelease()
    unknownMode.payload.questionBank.questions[0]!.practiceProfile = 'internal-only'
    expect(() => createPracticeDiscoveryCatalog(unknownMode)).toThrow('not registered for public discovery')
  })

  it('fails closed on public catalog fields or routes outside the bounded registry', () => {
    const catalog = createPracticeDiscoveryCatalog(syntheticRelease())
    expect(validatePracticeDiscoveryCatalog(catalog)).toBe(true)
    expect(validatePracticeDiscoveryCatalog({
      ...catalog,
      releaseIdentity: { ...catalog.releaseIdentity, contentId: 'private-editorial-bank' },
    })).toBe(false)
    expect(validatePracticeDiscoveryCatalog({
      ...catalog,
      families: [{
        ...catalog.families[0]!,
        domains: [{
          ...catalog.families[0]!.domains[0]!,
          categories: [{
            ...catalog.families[0]!.domains[0]!.categories[0]!,
            category: 'unregistered-category',
          }],
        }],
      }],
    })).toBe(false)
    expect(validatePracticeDiscoveryCatalog({ ...catalog, editorialReview: 'private' })).toBe(false)
  })
})
