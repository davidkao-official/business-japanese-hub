/**
 * Bounded, versioned authoring contract for the Practice / Web Test runtime.
 *
 * This is deliberately not a shared learning-content schema.  It models the
 * immutable data needed by a question runner only; Book, Career Game and
 * learning-evidence contracts remain separate bounded contexts.
 */

export const PRACTICE_QUESTION_BANK_SCHEMA_VERSION = 1 as const

export type PracticeChoice = {
  id: string
  textJa: string
  representation?: PracticeRepresentation
}

export type PracticeRepresentation =
  | { kind: 'equation'; expression: string }
  | { kind: 'table'; columns: string[]; rows: string[][] }
  | { kind: 'diagram'; altText: string; nodes: Array<{ id: string; label: string }>; edges: Array<{ from: string; to: string; label?: string }> }
  | { kind: 'elimination'; candidates: string[]; steps: string[] }
  | { kind: 'logic-grid'; columns: string[]; rows: string[]; cells: Array<{ row: string; column: string; value: 'yes' | 'no' | 'unknown' }> }
  | { kind: 'other'; label: string; content: string }

export type PracticeAnswer =
  | { input: { kind: 'single-choice'; choices: PracticeChoice[] }; expectedAnswer: { kind: 'single-choice'; choiceId: string }; scoring: { kind: 'exact-choice' } }
  | { input: { kind: 'multi-select'; choices: PracticeChoice[] }; expectedAnswer: { kind: 'multi-select'; choiceIds: string[] }; scoring: { kind: 'exact-set' } }
  | { input: { kind: 'short-text' }; expectedAnswer: { kind: 'short-text'; value: string }; scoring: { kind: 'exact-text' } }
  | { input: { kind: 'number' }; expectedAnswer: { kind: 'number'; value: number }; scoring: { kind: 'numeric'; tolerance?: number } }
  | { input: { kind: 'ordering'; choices: PracticeChoice[] }; expectedAnswer: { kind: 'ordering'; choiceIds: string[] }; scoring: { kind: 'exact-order' } }

export type PracticeQuestionStatus = 'draft' | 'reviewed' | 'released' | 'retired'

export type PracticeQuestion = {
  id: string
  version: number
  status: PracticeQuestionStatus
  testFamily: string
  domain: 'verbal' | 'nonverbal'
  category: string
  subcategory?: string
  deliveryProfile: string
  practiceProfile: string
  difficulty: 'foundation' | 'standard' | 'stretch'
  targetSeconds?: number
  releaseNotes?: string
  promptJa: string
  promptRepresentation?: PracticeRepresentation
  answer: PracticeAnswer
  coreExplanation: { concise: string; whatIsAskedJa: string; representation?: PracticeRepresentation }
  itemAnalysis: {
    languageLoads: Array<'vocabulary' | 'semantic-relation' | 'condition-parsing' | 'reading-comprehension'>
    vocabularyTermIds?: string[]
    reasoningLoads: Array<'model-selection' | 'constraint-reasoning' | 'quantitative-reasoning'>
    executionLoads: Array<'calculation' | 'choice-elimination'>
    diagnosticCheckpoints?: { registryVersion: number; ids: string[] }
  }
  provenance: {
    authoredBy: string
    reviewedBy?: string[]
    createdAt: string
    updatedAt: string
    basis: string[]
    originalContentAttestation: true
  }
}

export type PracticeVocabularyCatalog = {
  version: number
  terms: Record<string, { surfaceJa: string; explanationJa?: string }>
}

export type PracticeQuestionBank = {
  schemaVersion: typeof PRACTICE_QUESTION_BANK_SCHEMA_VERSION
  version: number
  vocabularyCatalog: PracticeVocabularyCatalog
  questions: PracticeQuestion[]
}

export type PracticeQuestionSupportOverlay = {
  questionId: string
  questionVersion: number
  version: number
  byLocale: Record<string, {
    concise?: string
    whatIsAsked?: string
    keyTerms?: Array<{ termId: string; surface: string; meaning: string; note?: string }>
    representationExplanation?: string
    commonMisread?: string
  }>
}

export type PracticeCheckpoint = {
  id: string
  version: number
  questionId: string
  questionVersion: number
  dimension: 'meaning' | 'representation' | 'execution'
  promptJa: string
  answer: PracticeAnswer
  provenance: Omit<PracticeQuestion['provenance'], 'basis'>
}

export type PracticeCheckpointRegistry = {
  version: number
  checkpoints: PracticeCheckpoint[]
}

export type PrivatePracticeQuestionBankSource = {
  questionBank: PracticeQuestionBank
  checkpointRegistry?: PracticeCheckpointRegistry
  supportOverlays?: PracticeQuestionSupportOverlay[]
}
