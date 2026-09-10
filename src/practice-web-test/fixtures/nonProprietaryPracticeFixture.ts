import type { PrivatePracticeQuestionBankSource } from '../contract'

/**
 * Tiny synthetic fixture for contract tests only. It is not an SPI item,
 * production corpus, release candidate, or renderer input.
 */
export const nonProprietaryPracticeQuestionBankFixture: PrivatePracticeQuestionBankSource = {
  questionBank: {
    schemaVersion: 1,
    version: 1,
    vocabularyCatalog: { version: 1, terms: { 'term-choice': { surfaceJa: '選択', explanationJa: '選ぶこと。' } } },
    questions: [{
      id: 'fixture-choice-01', version: 1, status: 'released', testFamily: 'fixture', domain: 'verbal',
      category: 'fixture-category', deliveryProfile: 'web', practiceProfile: 'untimed-learning', difficulty: 'foundation', targetSeconds: 30, releaseNotes: 'Synthetic fixture release only.',
      promptJa: '表示された選択肢から「二番」を選んでください。',
      answer: { input: { kind: 'single-choice', choices: [{ id: 'one', textJa: '一番' }, { id: 'two', textJa: '二番' }] }, expectedAnswer: { kind: 'single-choice', choiceId: 'two' }, scoring: { kind: 'exact-choice' } },
      coreExplanation: { concise: '指定された選択肢を選びます。', whatIsAskedJa: '二番を選ぶことが求められています。' },
      itemAnalysis: { languageLoads: ['vocabulary'], vocabularyTermIds: ['term-choice'], reasoningLoads: [], executionLoads: ['choice-elimination'] },
      provenance: { authoredBy: 'fixture-author', reviewedBy: ['fixture-reviewer'], createdAt: '2026-09-10T00:00:00.000Z', updatedAt: '2026-09-10T00:00:00.000Z', basis: ['synthetic contract fixture'], originalContentAttestation: true },
    }],
  },
  supportOverlays: [{
    questionId: 'fixture-choice-01', questionVersion: 1, version: 1,
    byLocale: { 'zh-Hant': { whatIsAsked: '請選擇第二個選項。', keyTerms: [{ termId: 'term-choice', surface: '選択', meaning: '選擇' }] } },
  }],
}
