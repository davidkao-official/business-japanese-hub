import {
  WORKPLACE_LEARN_CATEGORIES,
  type WorkplaceLearnAuthoringItem,
  type WorkplaceLearnCatalogEntry,
  type WorkplaceLearnReleaseReference,
  type WorkplaceLearnRuntimeItem,
  type WorkplaceLearnRuntimeValidationResult,
  type WorkplaceLearnValidationIssue,
  type WorkplaceLearnValidationResult,
} from './types'

const ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const TAG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_SLUG_LENGTH = 80
const MAX_TAG_LENGTH = 48
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const MARKUP = /<\/?[a-z][^>]*>|!\[[^\]]*\]\([^)]*\)|\[[^\]]+\]\([^)]*\)|`|\*\*|__|(?:^|\n)\s{0,3}(?:#{1,6}\s|>\s|[-*+]\s|\d+\.\s)/i

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[], path: string, issues: WorkplaceLearnValidationIssue[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issues.push({ path: `${path}.${key}`, message: 'unknown field' })
  }
}

function plainText(value: unknown, path: string, issues: WorkplaceLearnValidationIssue[], min = 1, max = 4000): value is string {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) {
    issues.push({ path, message: `must be plain text with ${min}–${max} characters` })
    return false
  }
  if (MARKUP.test(value)) issues.push({ path, message: 'HTML and Markdown markup are not allowed' })
  return true
}

function isoDate(value: unknown, path: string, issues: WorkplaceLearnValidationIssue[]): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) {
    issues.push({ path, message: 'must be a valid YYYY-MM-DD date' })
    return false
  }
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    issues.push({ path, message: 'must be a valid YYYY-MM-DD date' })
    return false
  }
  return true
}

function stringArray(value: unknown, path: string, issues: WorkplaceLearnValidationIssue[], options: {
  max: number; pattern?: RegExp; allowed?: readonly string[]; refs?: readonly string[]; allowEmpty?: boolean
}): value is string[] {
  if (!Array.isArray(value) || value.length > options.max || (!options.allowEmpty && value.length === 0)) {
    issues.push({ path, message: `must be an array with ${options.allowEmpty ? 'at most' : '1–'}${options.max} entries` })
    return false
  }
  let valid = true
  value.forEach((entry, index) => {
    if (typeof entry !== 'string' || (options.pattern && !options.pattern.test(entry)) || (options.allowed && !options.allowed.includes(entry))) {
      issues.push({ path: `${path}[${index}]`, message: 'contains an unsupported value' })
      valid = false
    } else if (options.refs && !options.refs.includes(entry)) {
      issues.push({ path: `${path}[${index}]`, message: 'reference does not resolve in this Workplace Learn collection' })
      valid = false
    }
  })
  if (new Set(value).size !== value.length) {
    issues.push({ path, message: 'must not contain duplicate entries' })
    valid = false
  }
  return valid
}

function validateExample(value: unknown, path: string, issues: WorkplaceLearnValidationIssue[]): void {
  if (!record(value)) {
    issues.push({ path, message: 'must be an example object' })
    return
  }
  onlyKeys(value, ['context', 'japanese', 'explanationZhTW'], path, issues)
  plainText(value.context, `${path}.context`, issues, 1, 400)
  plainText(value.japanese, `${path}.japanese`, issues, 1, 1200)
  plainText(value.explanationZhTW, `${path}.explanationZhTW`, issues, 1, 1600)
}

function validateLinks(value: unknown, path: string, issues: WorkplaceLearnValidationIssue[]): void {
  if (!Array.isArray(value) || value.length > 12) {
    issues.push({ path, message: 'must be an array with at most 12 entries' })
    return
  }
  value.forEach((entry, index) => {
    const itemPath = `${path}[${index}]`
    if (!record(entry)) {
      issues.push({ path: itemPath, message: 'must be a related content link' })
      return
    }
    onlyKeys(entry, ['kind', 'label', 'targetId'], itemPath, issues)
    if (!['learn', 'read', 'practice'].includes(String(entry.kind))) issues.push({ path: `${itemPath}.kind`, message: 'must be learn, read, or practice' })
    plainText(entry.label, `${itemPath}.label`, issues, 1, 120)
    if (typeof entry.targetId !== 'string' || !ID.test(entry.targetId)) issues.push({ path: `${itemPath}.targetId`, message: 'must be a stable content id' })
  })
}

function validateRuntimeShape(
  value: Record<string, unknown>, issues: WorkplaceLearnValidationIssue[], mode: 'authoring' | 'runtime',
  references: { vocabularyIds?: readonly string[]; contentIds?: readonly string[] } = {},
): void {
  const kind = value.kind
  if (kind !== 'lesson' && kind !== 'vocabulary') {
    issues.push({ path: '$.kind', message: 'must be lesson or vocabulary' })
    return
  }
  const lessonKeys = [
    'schemaVersion', 'kind', 'id', 'slug', 'title', 'lead', 'category', 'tags', 'access',
    'situation', 'meaningInContextZhTW', 'learningObjective', 'capabilityDomain', 'skill', 'coreJudgment',
    'whatToDo', 'whatToSayJapanese', 'whyItWorksZhTW', 'practiceTypes', 'transferTakeaway', 'examples',
    'cautionZhTW', 'relationshipContext', 'relatedVocabularyIds', 'relatedLinks', 'sampleLabel',
  ]
  const vocabularyKeys = [
    'schemaVersion', 'kind', 'id', 'slug', 'title', 'lead', 'category', 'tags', 'access',
    'term', 'reading', 'meaningZhTW', 'workplaceNuanceZhTW', 'usageContext', 'example', 'cautionZhTW',
    'register', 'relationshipContext', 'relatedTermIds', 'relatedLinks', 'sampleLabel',
  ]
  const authoringKeys = mode === 'authoring' ? ['publication', 'reviewer', 'rights'] : []
  onlyKeys(value, [...(kind === 'lesson' ? lessonKeys : vocabularyKeys), ...authoringKeys], '$', issues)
  if (value.schemaVersion !== 1) issues.push({ path: '$.schemaVersion', message: 'must equal 1' })
  if (typeof value.id !== 'string' || !ID.test(value.id)) issues.push({ path: '$.id', message: 'must be a stable lowercase content id' })
  if (typeof value.slug !== 'string' || value.slug.length > MAX_SLUG_LENGTH || !SLUG.test(value.slug)) issues.push({ path: '$.slug', message: `must be a stable lowercase hyphenated slug of at most ${MAX_SLUG_LENGTH} characters` })
  plainText(value.title, '$.title', issues, 1, 180)
  plainText(value.lead, '$.lead', issues, 1, 360)
  if (!(WORKPLACE_LEARN_CATEGORIES as readonly unknown[]).includes(value.category)) issues.push({ path: '$.category', message: 'is not a supported Workplace Learn category' })
  if (value.access !== 'free' && value.access !== 'plus') issues.push({ path: '$.access', message: 'must be free or plus' })
  if (!Array.isArray(value.tags) || value.tags.length > 12 || value.tags.some((tag) => typeof tag !== 'string' || tag.length > MAX_TAG_LENGTH || !TAG.test(tag))) {
    issues.push({ path: '$.tags', message: `must contain at most 12 lowercase hyphenated tags of at most ${MAX_TAG_LENGTH} characters` })
  } else if (new Set(value.tags).size !== value.tags.length) issues.push({ path: '$.tags', message: 'must not contain duplicate tags' })

  if (kind === 'lesson') {
    plainText(value.situation, '$.situation', issues, 1, 1600)
    plainText(value.meaningInContextZhTW, '$.meaningInContextZhTW', issues, 1, 2000)
    plainText(value.learningObjective, '$.learningObjective', issues, 1, 600)
    if (!['meeting-discussion', 'hou-ren-sou', 'business-writing', 'business-reading', 'logical-japanese', 'workplace-interaction', 'job-hunting'].includes(String(value.capabilityDomain))) {
      issues.push({ path: '$.capabilityDomain', message: 'is not a supported workplace capability domain' })
    }
    plainText(value.skill, '$.skill', issues, 1, 160)
    plainText(value.coreJudgment, '$.coreJudgment', issues, 1, 1200)
    plainText(value.whatToDo, '$.whatToDo', issues, 1, 1800)
    plainText(value.whatToSayJapanese, '$.whatToSayJapanese', issues, 1, 1600)
    plainText(value.whyItWorksZhTW, '$.whyItWorksZhTW', issues, 1, 2000)
    stringArray(value.practiceTypes, '$.practiceTypes', issues, { max: 5, allowed: ['recall', 'rewrite', 'dialogue', 'role-play', 'audio-scenario'], allowEmpty: true })
    plainText(value.transferTakeaway, '$.transferTakeaway', issues, 1, 1000)
    if (!Array.isArray(value.examples) || value.examples.length === 0 || value.examples.length > 8) issues.push({ path: '$.examples', message: 'must be an array with 1–8 examples' })
    else value.examples.forEach((example, index) => validateExample(example, `$.examples[${index}]`, issues))
    plainText(value.cautionZhTW, '$.cautionZhTW', issues, 1, 1600)
    if (value.relationshipContext !== undefined) plainText(value.relationshipContext, '$.relationshipContext', issues, 1, 800)
    stringArray(value.relatedVocabularyIds, '$.relatedVocabularyIds', issues, { max: 30, pattern: ID, refs: references.vocabularyIds, allowEmpty: true })
  } else {
    plainText(value.term, '$.term', issues, 1, 120)
    plainText(value.reading, '$.reading', issues, 1, 120)
    plainText(value.meaningZhTW, '$.meaningZhTW', issues, 1, 600)
    plainText(value.workplaceNuanceZhTW, '$.workplaceNuanceZhTW', issues, 1, 1400)
    plainText(value.usageContext, '$.usageContext', issues, 1, 1000)
    validateExample(value.example, '$.example', issues)
    plainText(value.cautionZhTW, '$.cautionZhTW', issues, 1, 1200)
    plainText(value.register, '$.register', issues, 1, 300)
    if (value.relationshipContext !== undefined) plainText(value.relationshipContext, '$.relationshipContext', issues, 1, 800)
    stringArray(value.relatedTermIds, '$.relatedTermIds', issues, { max: 20, pattern: ID, refs: references.vocabularyIds, allowEmpty: true })
  }
  validateLinks(value.relatedLinks, '$.relatedLinks', issues)
  if (references.contentIds) {
    const links = Array.isArray(value.relatedLinks) ? value.relatedLinks : []
    links.forEach((link, index) => {
      if (record(link) && link.kind === 'learn' && typeof link.targetId === 'string' && !references.contentIds!.includes(link.targetId)) {
        issues.push({ path: `$.relatedLinks[${index}].targetId`, message: 'reference does not resolve in the supplied content catalog' })
      }
    })
  }
  if (value.sampleLabel !== undefined && value.sampleLabel !== 'non-proprietary-teaching-sample') {
    issues.push({ path: '$.sampleLabel', message: 'is not a supported sample marker' })
  }
}

function validateEditorial(raw: Record<string, unknown>, issues: WorkplaceLearnValidationIssue[], requireReleased: boolean): void {
  if (!record(raw.publication)) issues.push({ path: '$.publication', message: 'must declare draft or released status' })
  else {
    onlyKeys(raw.publication, ['status', 'releasedAt', 'releaseNotes'], '$.publication', issues)
    if (raw.publication.status !== 'draft' && raw.publication.status !== 'released') issues.push({ path: '$.publication.status', message: 'must be draft or released' })
    if (raw.publication.releasedAt !== undefined) isoDate(raw.publication.releasedAt, '$.publication.releasedAt', issues)
    if (raw.publication.releaseNotes !== undefined) plainText(raw.publication.releaseNotes, '$.publication.releaseNotes', issues, 1, 2000)
    if (raw.publication.status === 'released') {
      if (raw.publication.releasedAt === undefined) issues.push({ path: '$.publication.releasedAt', message: 'is required for released content' })
      if (raw.publication.releaseNotes === undefined) issues.push({ path: '$.publication.releaseNotes', message: 'are required for released content' })
      if (raw.reviewer === undefined) issues.push({ path: '$.reviewer', message: 'is required for released content' })
    }
    if (requireReleased && raw.publication.status !== 'released') issues.push({ path: '$.publication.status', message: 'must be released for private import' })
  }
  if (raw.reviewer !== undefined) {
    if (!record(raw.reviewer)) issues.push({ path: '$.reviewer', message: 'must identify the reviewer' })
    else {
      onlyKeys(raw.reviewer, ['id', 'reviewedAt'], '$.reviewer', issues)
      if (typeof raw.reviewer.id !== 'string' || !ID.test(raw.reviewer.id)) issues.push({ path: '$.reviewer.id', message: 'must be a stable reviewer id' })
      isoDate(raw.reviewer.reviewedAt, '$.reviewer.reviewedAt', issues)
    }
  }
  if (!record(raw.rights)) issues.push({ path: '$.rights', message: 'must declare rights status, basis, and attestation' })
  else {
    onlyKeys(raw.rights, ['status', 'basis', 'attestation'], '$.rights', issues)
    if (raw.rights.status !== 'pending' && raw.rights.status !== 'cleared') issues.push({ path: '$.rights.status', message: 'must be pending or cleared' })
    if (raw.rights.basis !== 'original') issues.push({ path: '$.rights.basis', message: 'must be original for this text-only Workplace Learn contract' })
    plainText(raw.rights.attestation, '$.rights.attestation', issues, 1, 1200)
    if (raw.publication && record(raw.publication) && raw.publication.status === 'released' && raw.rights.status !== 'cleared') {
      issues.push({ path: '$.rights.status', message: 'must be cleared for released content' })
    }
  }
}

export function validateWorkplaceLearnItem(raw: unknown, options: {
  requireReleased?: boolean; vocabularyIds?: readonly string[]; contentIds?: readonly string[]
} = {}): WorkplaceLearnValidationResult {
  const issues: WorkplaceLearnValidationIssue[] = []
  if (!record(raw)) return { ok: false, issues: [{ path: '$', message: 'must be an object' }] }
  validateRuntimeShape(raw, issues, 'authoring', options)
  validateEditorial(raw, issues, options.requireReleased === true)
  if (raw.sampleLabel === 'non-proprietary-teaching-sample'
    && (raw.access !== 'free' || !record(raw.rights) || raw.rights.basis !== 'original')) {
    issues.push({ path: '$.sampleLabel', message: 'requires free original teaching material' })
  }
  if (issues.length) return { ok: false, issues }
  return { ok: true, value: raw as WorkplaceLearnAuthoringItem }
}

export function validateWorkplaceLearnRuntimeItem(raw: unknown, options: {
  vocabularyIds?: readonly string[]; contentIds?: readonly string[]
} = {}): WorkplaceLearnRuntimeValidationResult {
  const issues: WorkplaceLearnValidationIssue[] = []
  if (!record(raw)) return { ok: false, issues: [{ path: '$', message: 'must be an object' }] }
  validateRuntimeShape(raw, issues, 'runtime', options)
  if (raw.sampleLabel === 'non-proprietary-teaching-sample' && raw.access !== 'free') {
    issues.push({ path: '$.sampleLabel', message: 'requires free teaching material' })
  }
  if (issues.length) return { ok: false, issues }
  return { ok: true, value: raw as WorkplaceLearnRuntimeItem }
}

/** Allowlist projection strips every authoring/review field and refuses unreleased items. */
export function projectWorkplaceLearnRuntimeItem(item: WorkplaceLearnAuthoringItem): WorkplaceLearnRuntimeItem {
  const validated = validateWorkplaceLearnItem(item, { requireReleased: true })
  if (!validated.ok) throw new Error(`Workplace Learn item is not releasable: ${validated.issues[0]?.path ?? 'unknown field'}`)
  const { publication, reviewer: _reviewer, rights: _rights, ...body } = item
  return {
    ...body,
    tags: [...item.tags],
    relatedLinks: item.relatedLinks.map((link) => ({ ...link })),
    ...(item.kind === 'lesson'
      ? { examples: item.examples.map((example) => ({ ...example })), relatedVocabularyIds: [...item.relatedVocabularyIds], practiceTypes: [...item.practiceTypes] }
      : { example: { ...item.example }, relatedTermIds: [...item.relatedTermIds] }),
  } as WorkplaceLearnRuntimeItem
}

/** Projects a body-free entry; Plus metadata requires a matching immutable release reference. */
export function toWorkplaceLearnCatalogEntry(item: WorkplaceLearnRuntimeItem, releaseReference?: WorkplaceLearnReleaseReference): WorkplaceLearnCatalogEntry {
  if ((item.access === 'plus' && releaseReference === undefined)
    || (releaseReference !== undefined && (item.access !== 'plus' || releaseReference.contentId !== item.id || !/^[a-f0-9]{64}$/.test(releaseReference.revision)))) {
    throw new Error('Workplace Learn release reference is invalid for this catalog entry')
  }
  return {
    schemaVersion: 1,
    kind: item.kind,
    id: item.id,
    slug: item.slug,
    title: item.title,
    lead: item.lead,
    category: item.category,
    tags: [...item.tags],
    access: item.access,
    ...(item.sampleLabel === undefined ? {} : { sampleLabel: item.sampleLabel }),
    ...(releaseReference === undefined ? {} : { releaseReference: { ...releaseReference } }),
  }
}
