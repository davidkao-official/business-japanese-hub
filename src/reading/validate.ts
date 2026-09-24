import {
  READING_CATEGORIES,
  type ReadingAuthoringItem,
  type ReadingCatalogEntry,
  type ReadingReleaseReference,
  type ReadingRuntimeItem,
  type ReadingRuntimeValidationResult,
  type ReadingValidationIssue,
  type ReadingValidationResult,
} from './types.ts'

const ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const TAG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const FORBIDDEN_TEXT = /<[^>]*>|\[[^\]]+\]\([^)]*\)|(?:https?:\/\/|www\.)/i

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[], path: string, issues: ReadingValidationIssue[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issues.push({ path: `${path}.${key}`, message: 'unknown field' })
  }
}

function plainText(value: unknown, path: string, issues: ReadingValidationIssue[], min = 1, max = 12000): value is string {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) {
    issues.push({ path, message: `must be plain text with ${min}–${max} characters` })
    return false
  }
  if (FORBIDDEN_TEXT.test(value)) issues.push({ path, message: 'markup and inline links are not allowed' })
  return true
}

function isoDate(value: unknown, path: string, issues: ReadingValidationIssue[]): value is string {
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

function safeHttpsUrl(value: unknown, path: string, issues: ReadingValidationIssue[]): value is string {
  if (typeof value !== 'string') {
    issues.push({ path, message: 'must be an HTTPS URL' })
    return false
  }
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('unsafe URL')
    return true
  } catch {
    issues.push({ path, message: 'must be an HTTPS URL without credentials' })
    return false
  }
}

function validateRuntime(value: Record<string, unknown>, issues: ReadingValidationIssue[], mode: 'authoring' | 'runtime'): void {
  onlyKeys(value, [
    'schemaVersion', 'id', 'slug', 'title', 'summary', ...(mode === 'runtime' ? ['releasedAt'] : []), 'category', 'tags', 'access', 'source',
    'japaneseMaterial', 'explanationZhTW', 'vocabulary', 'logicAnalysis', 'businessContextZhTW',
    'davidCommentary', 'relatedLinks', 'seo', 'sampleLabel', ...(mode === 'authoring' ? ['publication', 'reviewer', 'rights'] : []),
  ], '$', issues)
  if (value.schemaVersion !== 1) issues.push({ path: '$.schemaVersion', message: 'must equal 1' })
  if (typeof value.id !== 'string' || !ID.test(value.id)) issues.push({ path: '$.id', message: 'must be a stable lowercase content id' })
  if (typeof value.slug !== 'string' || !SLUG.test(value.slug)) issues.push({ path: '$.slug', message: 'must be a stable lowercase hyphenated slug' })
  plainText(value.title, '$.title', issues, 1, 180)
  plainText(value.summary, '$.summary', issues, 1, 420)
  if (mode === 'runtime' && value.releasedAt !== undefined) isoDate(value.releasedAt, '$.releasedAt', issues)
  if (!(READING_CATEGORIES as readonly unknown[]).includes(value.category)) issues.push({ path: '$.category', message: 'is not a supported Reading category' })
  if (value.access !== 'free' && value.access !== 'plus') issues.push({ path: '$.access', message: 'must be free or plus' })

  if (!Array.isArray(value.tags) || value.tags.length > 12 || value.tags.some((tag) => typeof tag !== 'string' || !TAG.test(tag))) {
    issues.push({ path: '$.tags', message: 'must contain at most 12 lowercase hyphenated tags' })
  } else if (new Set(value.tags).size !== value.tags.length) issues.push({ path: '$.tags', message: 'must not contain duplicate tags' })

  if (!record(value.source)) issues.push({ path: '$.source', message: 'must be a user-facing source citation object' })
  else {
    onlyKeys(value.source, ['type', 'label', 'url', 'publishedAt'], '$.source', issues)
    if (!['original', 'news', 'company-ir', 'industry-report', 'government-report', 'business-document'].includes(String(value.source.type))) {
      issues.push({ path: '$.source.type', message: 'is not a supported source type' })
    }
    plainText(value.source.label, '$.source.label', issues, 1, 120)
    if (value.source.url !== undefined) safeHttpsUrl(value.source.url, '$.source.url', issues)
    if (value.source.publishedAt !== undefined) isoDate(value.source.publishedAt, '$.source.publishedAt', issues)
  }

  if (!record(value.japaneseMaterial)) issues.push({ path: '$.japaneseMaterial', message: 'must be Japanese material' })
  else {
    onlyKeys(value.japaneseMaterial, ['kind', 'text'], '$.japaneseMaterial', issues)
    if (!['original', 'authorized-excerpt', 'public-domain-excerpt'].includes(String(value.japaneseMaterial.kind))) {
      issues.push({ path: '$.japaneseMaterial.kind', message: 'is not a supported material kind' })
    }
    plainText(value.japaneseMaterial.text, '$.japaneseMaterial.text', issues, 1, 8000)
    if (value.japaneseMaterial.kind === 'authorized-excerpt' && typeof value.japaneseMaterial.text === 'string' && value.japaneseMaterial.text.length > 1200) {
      issues.push({ path: '$.japaneseMaterial.text', message: 'authorized excerpts are limited to 1200 characters' })
    }
  }

  plainText(value.explanationZhTW, '$.explanationZhTW', issues, 1, 12000)
  plainText(value.businessContextZhTW, '$.businessContextZhTW', issues, 1, 8000)
  if (value.davidCommentary !== undefined) plainText(value.davidCommentary, '$.davidCommentary', issues, 1, 8000)

  if (!Array.isArray(value.vocabulary) || value.vocabulary.length > 80) issues.push({ path: '$.vocabulary', message: 'must be an array with at most 80 entries' })
  else value.vocabulary.forEach((entry, index) => {
    const path = `$.vocabulary[${index}]`
    if (!record(entry)) { issues.push({ path, message: 'must be an object' }); return }
    onlyKeys(entry, ['term', 'reading', 'meaningZhTW', 'noteZhTW'], path, issues)
    plainText(entry.term, `${path}.term`, issues, 1, 120)
    if (entry.reading !== undefined) plainText(entry.reading, `${path}.reading`, issues, 1, 120)
    plainText(entry.meaningZhTW, `${path}.meaningZhTW`, issues, 1, 1000)
    if (entry.noteZhTW !== undefined) plainText(entry.noteZhTW, `${path}.noteZhTW`, issues, 1, 1000)
  })

  if (!Array.isArray(value.logicAnalysis) || value.logicAnalysis.length > 40) issues.push({ path: '$.logicAnalysis', message: 'must be an array with at most 40 entries' })
  else value.logicAnalysis.forEach((entry, index) => {
    const path = `$.logicAnalysis[${index}]`
    if (!record(entry)) { issues.push({ path, message: 'must be an object' }); return }
    onlyKeys(entry, ['label', 'japaneseText', 'explanationZhTW'], path, issues)
    plainText(entry.label, `${path}.label`, issues, 1, 120)
    if (entry.japaneseText !== undefined) plainText(entry.japaneseText, `${path}.japaneseText`, issues, 1, 2000)
    plainText(entry.explanationZhTW, `${path}.explanationZhTW`, issues, 1, 2000)
  })

  if (!Array.isArray(value.relatedLinks) || value.relatedLinks.length > 20) issues.push({ path: '$.relatedLinks', message: 'must be an array with at most 20 entries' })
  else value.relatedLinks.forEach((entry, index) => {
    const path = `$.relatedLinks[${index}]`
    if (!record(entry)) { issues.push({ path, message: 'must be an object' }); return }
    onlyKeys(entry, ['kind', 'label', 'targetId'], path, issues)
    if (!['read', 'learn', 'practice'].includes(String(entry.kind))) issues.push({ path: `${path}.kind`, message: 'must be read, learn, or practice' })
    plainText(entry.label, `${path}.label`, issues, 1, 100)
    if (typeof entry.targetId !== 'string' || !ID.test(entry.targetId)) issues.push({ path: `${path}.targetId`, message: 'must be a stable content id' })
  })

  if (!record(value.seo)) issues.push({ path: '$.seo', message: 'must be an SEO metadata object' })
  else {
    onlyKeys(value.seo, ['title', 'description'], '$.seo', issues)
    plainText(value.seo.title, '$.seo.title', issues, 1, 180)
    plainText(value.seo.description, '$.seo.description', issues, 1, 320)
  }
  if (value.sampleLabel !== undefined && value.sampleLabel !== 'non-proprietary-teaching-sample') {
    issues.push({ path: '$.sampleLabel', message: 'is not a supported sample marker' })
  }
}

/** Strictly validates private authoring data, including publication and rights state. */
export function validateReadingItem(raw: unknown, options: { requireReleased?: boolean } = {}): ReadingValidationResult {
  const issues: ReadingValidationIssue[] = []
  if (!record(raw)) return { ok: false, issues: [{ path: '$', message: 'must be an object' }] }
  validateRuntime(raw, issues, 'authoring')
  if (!record(raw.publication)) issues.push({ path: '$.publication', message: 'must declare draft or released status' })
  else {
    onlyKeys(raw.publication, ['status', 'releasedAt', 'releaseNotes'], '$.publication', issues)
    if (raw.publication.status !== 'draft' && raw.publication.status !== 'released') issues.push({ path: '$.publication.status', message: 'must be draft or released' })
    if (raw.publication.releasedAt !== undefined) isoDate(raw.publication.releasedAt, '$.publication.releasedAt', issues)
    if (raw.publication.releaseNotes !== undefined) plainText(raw.publication.releaseNotes, '$.publication.releaseNotes', issues, 1, 2000)
    if (raw.publication.status === 'released') {
      if (raw.publication.releasedAt === undefined) issues.push({ path: '$.publication.releasedAt', message: 'is required for released content' })
      if (raw.publication.releaseNotes === undefined) issues.push({ path: '$.publication.releaseNotes', message: 'are required for released content' })
    }
    if (options.requireReleased && raw.publication.status !== 'released') issues.push({ path: '$.publication.status', message: 'must be released for private import' })
  }
  if (raw.reviewer !== undefined) {
    if (!record(raw.reviewer)) issues.push({ path: '$.reviewer', message: 'must identify the reviewer' })
    else {
      onlyKeys(raw.reviewer, ['id', 'reviewedAt'], '$.reviewer', issues)
      if (typeof raw.reviewer.id !== 'string' || !ID.test(raw.reviewer.id)) issues.push({ path: '$.reviewer.id', message: 'must be a stable reviewer id' })
      isoDate(raw.reviewer.reviewedAt, '$.reviewer.reviewedAt', issues)
    }
  }
  if (raw.publication && record(raw.publication) && raw.publication.status === 'released' && raw.reviewer === undefined) {
    issues.push({ path: '$.reviewer', message: 'is required for released content' })
  }
  if (!record(raw.rights)) issues.push({ path: '$.rights', message: 'must declare rights status, basis, and attestation' })
  else {
    onlyKeys(raw.rights, ['status', 'basis', 'attestation'], '$.rights', issues)
    if (raw.rights.status !== 'pending' && raw.rights.status !== 'cleared') issues.push({ path: '$.rights.status', message: 'must be pending or cleared' })
    if (!['original', 'public-domain', 'permission', 'license', 'quotation'].includes(String(raw.rights.basis))) issues.push({ path: '$.rights.basis', message: 'is not an accepted rights basis' })
    plainText(raw.rights.attestation, '$.rights.attestation', issues, 1, 2000)
    if (raw.publication && record(raw.publication) && raw.publication.status === 'released' && raw.rights.status !== 'cleared') {
      issues.push({ path: '$.rights.status', message: 'must be cleared for released content' })
    }
    if (raw.publication && record(raw.publication) && raw.publication.status === 'released' && record(raw.japaneseMaterial)) {
      const kind = raw.japaneseMaterial.kind
      const basis = raw.rights.basis
      const compatible = (kind === 'original' && basis === 'original')
        || (kind === 'public-domain-excerpt' && basis === 'public-domain')
        || (kind === 'authorized-excerpt' && ['permission', 'license', 'quotation'].includes(String(basis)))
      if (!compatible) issues.push({ path: '$.rights.basis', message: 'must match the Japanese material rights category' })
    }
  }
  if (raw.sampleLabel === 'non-proprietary-teaching-sample'
    && (raw.access !== 'free' || !record(raw.source) || raw.source.type !== 'original'
      || !record(raw.japaneseMaterial) || raw.japaneseMaterial.kind !== 'original'
      || !record(raw.rights) || raw.rights.basis !== 'original')) {
    issues.push({ path: '$.sampleLabel', message: 'requires free, original, non-proprietary teaching material' })
  }
  if (issues.length) return { ok: false, issues }
  return { ok: true, value: raw as ReadingAuthoringItem }
}

/** Strict browser-side validation for data returned by the Reading delivery seam. */
export function validateReadingRuntimeItem(raw: unknown): ReadingRuntimeValidationResult {
  const issues: ReadingValidationIssue[] = []
  if (!record(raw)) return { ok: false, issues: [{ path: '$', message: 'must be an object' }] }
  validateRuntime(raw, issues, 'runtime')
  if (raw.sampleLabel === 'non-proprietary-teaching-sample'
    && (raw.access !== 'free' || !record(raw.source) || raw.source.type !== 'original'
      || !record(raw.japaneseMaterial) || raw.japaneseMaterial.kind !== 'original')) {
    issues.push({ path: '$.sampleLabel', message: 'requires free, original teaching material' })
  }
  if (issues.length) return { ok: false, issues }
  return { ok: true, value: raw as ReadingRuntimeItem }
}

/** Stable body-free card projection for a Read catalog or list. */
export function toReadingCatalogEntry(item: ReadingRuntimeItem, releaseReference?: ReadingReleaseReference): ReadingCatalogEntry {
  if (releaseReference !== undefined) {
    if (item.access !== 'plus' || releaseReference.contentId !== item.id || !/^[a-f0-9]{64}$/.test(releaseReference.revision)) {
      throw new Error('Reading release reference is invalid for this catalog entry')
    }
  }
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    summary: item.summary,
    ...(item.releasedAt === undefined ? {} : { releasedAt: item.releasedAt }),
    category: item.category,
    tags: [...item.tags],
    access: item.access,
    source: { ...item.source },
    seo: { ...item.seo },
    ...(releaseReference === undefined ? {} : { releaseReference: { ...releaseReference } }),
    ...(item.sampleLabel === undefined ? {} : { sampleLabel: item.sampleLabel }),
  }
}

/** Explicit allowlist projection prevents authoring/review fields reaching runtime payloads. */
export function projectReadingRuntimeItem(item: ReadingAuthoringItem): ReadingRuntimeItem {
  const runtime: ReadingRuntimeItem = {
    schemaVersion: 1,
    id: item.id,
    slug: item.slug,
    title: item.title,
    summary: item.summary,
    ...(item.publication.status === 'released' && item.publication.releasedAt !== undefined
      ? { releasedAt: item.publication.releasedAt }
      : {}),
    category: item.category,
    tags: [...item.tags],
    access: item.access,
    source: { ...item.source },
    japaneseMaterial: { ...item.japaneseMaterial },
    explanationZhTW: item.explanationZhTW,
    vocabulary: item.vocabulary.map((entry) => ({ ...entry })),
    logicAnalysis: item.logicAnalysis.map((entry) => ({ ...entry })),
    businessContextZhTW: item.businessContextZhTW,
    relatedLinks: item.relatedLinks.map((entry) => ({ ...entry })),
    seo: { ...item.seo },
    ...(item.davidCommentary === undefined ? {} : { davidCommentary: item.davidCommentary }),
    ...(item.sampleLabel === undefined ? {} : { sampleLabel: item.sampleLabel }),
  }
  return runtime
}
