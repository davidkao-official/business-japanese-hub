/** Reading owns a bounded editorial/article contract, separate from Book and Learn. */

export const READING_CATEGORIES = [
  'business-news',
  'company-ir',
  'industry-report',
  'government-report',
  'business-document',
] as const

export type ReadingCategory = (typeof READING_CATEGORIES)[number]
export type ReadingAccess = 'free' | 'plus'
export type ReadingSourceType = 'original' | 'news' | 'company-ir' | 'industry-report' | 'government-report' | 'business-document'

/** User-visible citation only. Private research/review records never enter this shape. */
export type ReadingSourceCitation = {
  type: ReadingSourceType
  label: string
  url?: string
  publishedAt?: string
}

/** Retained only to describe immutable schema-v1 records during audit. */
export type ReadingLegacyV1VocabularyItem = {
  term: string
  reading?: string
  meaningZhTW: string
  noteZhTW?: string
}

/** Retained only to describe immutable schema-v1 records during audit. */
export type ReadingLegacyV1LogicPoint = {
  label: string
  japaneseText?: string
  explanationZhTW: string
}

/** Retained for audit tooling; schema-v1 Chinese-only items are not current publishable content. */
export type ReadingLegacyV1RuntimeItem = {
  schemaVersion: 1
  id: string
  slug: string
  title: string
  summary: string
  releasedAt?: string
  category: ReadingCategory
  tags: string[]
  access: ReadingAccess
  source: ReadingSourceCitation
  japaneseMaterial: { kind: 'original' | 'authorized-excerpt' | 'public-domain-excerpt'; text: string }
  explanationZhTW: string
  vocabulary: ReadingLegacyV1VocabularyItem[]
  logicAnalysis: ReadingLegacyV1LogicPoint[]
  businessContextZhTW: string
  davidCommentary?: string
  relatedLinks: ReadingRelatedLink[]
  seo: { title: string; description: string }
  sampleLabel?: 'non-proprietary-teaching-sample'
}

export type ReadingLegacyV1AuthoringItem = Omit<ReadingLegacyV1RuntimeItem, 'releasedAt'> & {
  publication: { status: 'draft' | 'released'; releasedAt?: string; releaseNotes?: string }
  reviewer?: { id: string; reviewedAt: string }
  rights: { status: 'pending' | 'cleared'; basis: ReadingRightsBasis; attestation: string }
}

export type ReadingVocabularyItem = {
  term: string
  reading?: string
  meaningJa: string
  noteJa?: string
}

export type ReadingLogicPoint = {
  label: string
  japaneseText?: string
  explanationJa: string
}

export type ReadingSupportOverlay = {
  explanation?: string
  businessContext?: string
  vocabulary?: { term: string; meaning: string; note?: string }[]
  logicAnalysis?: { label: string; explanation: string }[]
  commentary?: string
}

export type ReadingSupportOverlays = { byLocale: Record<string, ReadingSupportOverlay> }

export type ReadingRelatedLink = {
  kind: 'read' | 'learn' | 'practice'
  label: string
  targetId: string
}

/** Browser-facing detail data, deliberately free of reviewer and rights records. */
export type ReadingRuntimeItem = {
  schemaVersion: 2
  id: string
  slug: string
  title: string
  summary: string
  releasedAt?: string
  category: ReadingCategory
  tags: string[]
  access: ReadingAccess
  source: ReadingSourceCitation
  japaneseMaterial: {
    kind: 'original' | 'authorized-excerpt' | 'public-domain-excerpt'
    text: string
  }
  explanationJa: string
  vocabulary: ReadingVocabularyItem[]
  logicAnalysis: ReadingLogicPoint[]
  businessContextJa: string
  davidCommentaryJa?: string
  supportOverlays?: ReadingSupportOverlays
  relatedLinks: ReadingRelatedLink[]
  seo: { title: string; description: string }
  sampleLabel?: 'non-proprietary-teaching-sample'
}

export type ReadingCatalogEntry = Pick<ReadingRuntimeItem,
  'id' | 'slug' | 'title' | 'summary' | 'releasedAt' | 'category' | 'tags' | 'access' | 'source' | 'seo' | 'sampleLabel'
> & { releaseReference?: ReadingReleaseReference }

export type ReadingReleaseReference = { contentId: string; revision: string }

export type ReadingRightsBasis = 'original' | 'public-domain' | 'permission' | 'license' | 'quotation'

/** Private authoring envelope. These fields are validated but never projected to the runtime. */
export type ReadingAuthoringItem = Omit<ReadingRuntimeItem, 'releasedAt'> & {
  publication: {
    status: 'draft' | 'released'
    releasedAt?: string
    releaseNotes?: string
  }
  reviewer?: { id: string; reviewedAt: string }
  rights: {
    status: 'pending' | 'cleared'
    basis: ReadingRightsBasis
    attestation: string
  }
}

export type ReadingValidationIssue = { path: string; message: string }
export type ReadingValidationResult =
  | { ok: true; value: ReadingAuthoringItem }
  | { ok: false; issues: ReadingValidationIssue[] }

export type ReadingRuntimeValidationResult =
  | { ok: true; value: ReadingRuntimeItem }
  | { ok: false; issues: ReadingValidationIssue[] }
