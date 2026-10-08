/** Workplace Learn owns a narrow lesson and vocabulary contract. */

export const WORKPLACE_LEARN_CATEGORIES = [
  'workplace-communication',
  'thinking-problem-solving',
  'documents-data',
  'meetings-projects',
  'workplace-vocabulary',
] as const

export type WorkplaceLearnCategory = (typeof WORKPLACE_LEARN_CATEGORIES)[number]
export type WorkplaceLearnAccess = 'free' | 'plus'
export type WorkplaceLearnKind = 'lesson' | 'vocabulary'
export type WorkplaceLearnLanguage = 'ja' | 'zh-TW' | 'zh-CN' | 'en'
export type WorkplaceCapabilityDomain =
  | 'meeting-discussion'
  | 'hou-ren-sou'
  | 'business-writing'
  | 'business-reading'
  | 'logical-japanese'
  | 'workplace-interaction'
  | 'job-hunting'

export type WorkplaceLearnRelatedLink = {
  kind: 'learn' | 'read' | 'practice'
  label: string
  labelLanguage: WorkplaceLearnLanguage
  targetId: string
}

export type WorkplaceLearnLessonSupportOverlay = {
  meaningInContext?: string
  whyItWorks?: string
  caution?: string
  examples?: Array<{ explanation: string }>
}

export type WorkplaceLearnVocabularySupportOverlay = {
  meaning?: string
  workplaceNuance?: string
  caution?: string
  example?: { explanation: string }
}

export type WorkplaceLearnSupportOverlays<TOverlay> = {
  byLocale: Record<string, TOverlay>
}

export type WorkplaceLearnExample = {
  context: string
  japanese: string
  explanationJa: string
}

export type WorkplaceLearnLesson = {
  schemaVersion: 2
  kind: 'lesson'
  id: string
  slug: string
  title: string
  titleLanguage: WorkplaceLearnLanguage
  lead: string
  leadLanguage: WorkplaceLearnLanguage
  category: WorkplaceLearnCategory
  tags: string[]
  access: WorkplaceLearnAccess
  situation: string
  meaningInContextJa: string
  learningObjective: string
  capabilityDomain: WorkplaceCapabilityDomain
  skill: string
  coreJudgment: string
  whatToDo: string
  whatToSayJapanese: string
  whyItWorksJa: string
  /** Editorial suggestions only; this field does not assert that a Practice activity exists. */
  practiceTypes: Array<'rewrite'>
  transferTakeaway: string
  examples: WorkplaceLearnExample[]
  cautionJa: string
  relationshipContext?: string
  relatedVocabularyIds: string[]
  relatedLinks: WorkplaceLearnRelatedLink[]
  supportOverlays?: WorkplaceLearnSupportOverlays<WorkplaceLearnLessonSupportOverlay>
  sampleLabel?: 'non-proprietary-teaching-sample'
}

export type WorkplaceLearnVocabularyExample = {
  context: string
  japanese: string
  explanationJa: string
}

export type WorkplaceLearnVocabulary = {
  schemaVersion: 2
  kind: 'vocabulary'
  id: string
  slug: string
  title: string
  titleLanguage: WorkplaceLearnLanguage
  lead: string
  leadLanguage: WorkplaceLearnLanguage
  category: WorkplaceLearnCategory
  tags: string[]
  access: WorkplaceLearnAccess
  term: string
  reading: string
  meaningJa: string
  workplaceNuanceJa: string
  usageContext: string
  example: WorkplaceLearnVocabularyExample
  cautionJa: string
  register: string
  relationshipContext?: string
  relatedTermIds: string[]
  relatedLinks: WorkplaceLearnRelatedLink[]
  supportOverlays?: WorkplaceLearnSupportOverlays<WorkplaceLearnVocabularySupportOverlay>
  sampleLabel?: 'non-proprietary-teaching-sample'
}

export type WorkplaceLearnRuntimeItem = WorkplaceLearnLesson | WorkplaceLearnVocabulary

export type WorkplaceLearnRights = {
  status: 'pending' | 'cleared'
  basis: 'original'
  attestation: string
}

export type WorkplaceLearnAuthoringItem = WorkplaceLearnRuntimeItem & {
  publication: {
    status: 'draft' | 'released'
    releasedAt?: string
    releaseNotes?: string
  }
  reviewer?: { id: string; reviewedAt: string }
  rights: WorkplaceLearnRights
}

export type WorkplaceLearnReleaseReference = { contentId: string; revision: string }

/** Discovery metadata only; lesson and vocabulary bodies never belong in this shape. */
export type WorkplaceLearnCatalogEntry = Pick<WorkplaceLearnRuntimeItem,
  'schemaVersion' | 'kind' | 'id' | 'slug' | 'title' | 'titleLanguage' | 'lead' | 'leadLanguage' | 'category' | 'tags' | 'access' | 'sampleLabel'
> & { releaseReference?: WorkplaceLearnReleaseReference }

export type WorkplaceLearnValidationIssue = { path: string; message: string }
export type WorkplaceLearnValidationResult =
  | { ok: true; value: WorkplaceLearnAuthoringItem }
  | { ok: false; issues: WorkplaceLearnValidationIssue[] }
export type WorkplaceLearnRuntimeValidationResult =
  | { ok: true; value: WorkplaceLearnRuntimeItem }
  | { ok: false; issues: WorkplaceLearnValidationIssue[] }

/** Audit-only schema-v1 shape; never accepted by runtime or authoring validators. */
export type WorkplaceLearnLegacyV1Example = {
  context: string
  japanese: string
  explanationZhTW: string
}

/** Audit-only schema-v1 lesson fields retained for inspecting historical revisions. */
export type WorkplaceLearnLegacyV1Lesson = Omit<WorkplaceLearnLesson,
  'schemaVersion' | 'meaningInContextJa' | 'whyItWorksJa' | 'cautionJa' | 'examples' | 'supportOverlays'
> & {
  schemaVersion: 1
  meaningInContextZhTW: string
  whyItWorksZhTW: string
  cautionZhTW: string
  examples: WorkplaceLearnLegacyV1Example[]
}

/** Audit-only schema-v1 vocabulary fields retained for inspecting historical revisions. */
export type WorkplaceLearnLegacyV1Vocabulary = Omit<WorkplaceLearnVocabulary,
  'schemaVersion' | 'meaningJa' | 'workplaceNuanceJa' | 'cautionJa' | 'example' | 'supportOverlays'
> & {
  schemaVersion: 1
  meaningZhTW: string
  workplaceNuanceZhTW: string
  cautionZhTW: string
  example: WorkplaceLearnLegacyV1Example
}

export type WorkplaceLearnLegacyV1RuntimeItem = WorkplaceLearnLegacyV1Lesson | WorkplaceLearnLegacyV1Vocabulary
