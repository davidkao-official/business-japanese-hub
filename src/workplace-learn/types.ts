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

export type WorkplaceLearnExample = {
  context: string
  japanese: string
  explanationZhTW: string
}

export type WorkplaceLearnLesson = {
  schemaVersion: 1
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
  meaningInContextZhTW: string
  learningObjective: string
  capabilityDomain: WorkplaceCapabilityDomain
  skill: string
  coreJudgment: string
  whatToDo: string
  whatToSayJapanese: string
  whyItWorksZhTW: string
  /** Editorial suggestions only; this field does not assert that a Practice activity exists. */
  practiceTypes: Array<'rewrite'>
  transferTakeaway: string
  examples: WorkplaceLearnExample[]
  cautionZhTW: string
  relationshipContext?: string
  relatedVocabularyIds: string[]
  relatedLinks: WorkplaceLearnRelatedLink[]
  sampleLabel?: 'non-proprietary-teaching-sample'
}

export type WorkplaceLearnVocabulary = {
  schemaVersion: 1
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
  meaningZhTW: string
  workplaceNuanceZhTW: string
  usageContext: string
  example: WorkplaceLearnExample
  cautionZhTW: string
  register: string
  relationshipContext?: string
  relatedTermIds: string[]
  relatedLinks: WorkplaceLearnRelatedLink[]
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
