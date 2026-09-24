import { WORKPLACE_LEARN_CATEGORIES, type WorkplaceLearnCatalogEntry, type WorkplaceLearnCategory, type WorkplaceLearnRuntimeItem } from './types'
import { toWorkplaceLearnCatalogEntry, validateWorkplaceLearnRuntimeItem } from './validate'
import { sampleWorkplaceLearnItem, sampleWorkplaceVocabularyItem } from './sample'

const CONTENT_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const REVISION = /^[a-f0-9]{64}$/

/** Current public inventory is an explicitly non-proprietary Free lesson and vocabulary pair. */
export const workplaceLearnCatalog: readonly WorkplaceLearnCatalogEntry[] = buildWorkplaceLearnCatalog([
  sampleWorkplaceLearnItem,
  sampleWorkplaceVocabularyItem,
])

/** Validate catalog identity and all lesson/vocabulary references before projecting metadata. */
export function buildWorkplaceLearnCatalog(
  items: readonly WorkplaceLearnRuntimeItem[],
): readonly WorkplaceLearnCatalogEntry[] {
  return projectFreeCatalogItems(items)
}

/**
 * Combines public Free fixtures with strict, body-free Plus metadata.
 * Plus entries must come from the controlled publication lane; this function
 * intentionally accepts unknown input and rejects runtime/member bodies.
 */
export function buildWorkplaceLearnCatalogWithPlusMetadata(
  freeItems: readonly WorkplaceLearnRuntimeItem[],
  plusMetadata: readonly unknown[],
): readonly WorkplaceLearnCatalogEntry[] {
  const plusEntries = plusMetadata.map(validatePlusCatalogEntry)
  const plusLessonIds = plusEntries.filter((entry) => entry.kind === 'lesson').map((entry) => entry.id)
  const plusVocabularyIds = plusEntries.filter((entry) => entry.kind === 'vocabulary').map((entry) => entry.id)
  const freeEntries = projectFreeCatalogItems(freeItems, plusVocabularyIds, plusLessonIds)
  const identities = new Set<string>()
  const slugs = new Set<string>()
  for (const entry of [...freeEntries, ...plusEntries]) {
    if (identities.has(entry.id)) throw new Error(`Duplicate Workplace Learn id: ${entry.id}`)
    if (slugs.has(entry.slug)) throw new Error(`Duplicate Workplace Learn slug: ${entry.slug}`)
    identities.add(entry.id)
    slugs.add(entry.slug)
  }
  return Object.freeze([...freeEntries, ...plusEntries.map(freezeEntry)])
}

function projectFreeCatalogItems(
  items: readonly WorkplaceLearnRuntimeItem[],
  extraVocabularyIds: readonly string[] = [],
  extraLessonIds: readonly string[] = [],
): readonly WorkplaceLearnCatalogEntry[] {
  const ids = new Set<string>()
  const slugs = new Set<string>()
  const vocabularyIds = [...items.filter((item) => item.kind === 'vocabulary').map((item) => item.id), ...extraVocabularyIds]
  const lessonIds = [...items.filter((item) => item.kind === 'lesson').map((item) => item.id), ...extraLessonIds]
  for (const item of items) {
    if (item.access !== 'free') {
      throw new Error(`Plus Workplace Learn bodies are not accepted in the public catalog; provide body-free metadata: ${item.id}`)
    }
    if (item.sampleLabel !== 'non-proprietary-teaching-sample') {
      throw new Error(`Public Free Workplace Learn items require an explicitly non-proprietary sample label: ${item.id}`)
    }
    if (ids.has(item.id)) throw new Error(`Duplicate Workplace Learn id: ${item.id}`)
    if (slugs.has(item.slug)) throw new Error(`Duplicate Workplace Learn slug: ${item.slug}`)
    ids.add(item.id)
    slugs.add(item.slug)
  }
  for (const item of items) {
    const validated = validateWorkplaceLearnRuntimeItem(item, { vocabularyIds, contentIds: lessonIds })
    if (!validated.ok) throw new Error(`Invalid Workplace Learn item ${item.id}: ${validated.issues[0]?.path ?? 'unknown field'}`)
  }
  return Object.freeze(items.map((item) => freezeEntry(toWorkplaceLearnCatalogEntry(item))))
}

function validatePlusCatalogEntry(raw: unknown): WorkplaceLearnCatalogEntry {
  if (!isRecord(raw)) throw new Error('Plus Workplace Learn catalog entry must be an object')
  const allowed = ['schemaVersion', 'kind', 'id', 'slug', 'title', 'lead', 'category', 'tags', 'access', 'releaseReference']
  if (!hasExactKeys(raw, allowed)) throw new Error('Plus Workplace Learn catalog entry has missing or unknown fields')
  if (raw.schemaVersion !== 1 || (raw.kind !== 'lesson' && raw.kind !== 'vocabulary')) throw new Error('Invalid Plus Workplace Learn catalog kind or version')
  if (typeof raw.id !== 'string' || !CONTENT_ID.test(raw.id)) throw new Error('Invalid Plus Workplace Learn catalog id')
  if (typeof raw.slug !== 'string' || raw.slug.length > 80 || !SLUG.test(raw.slug)) throw new Error('Invalid Plus Workplace Learn catalog slug')
  if (typeof raw.title !== 'string' || raw.title.trim().length < 1 || raw.title.length > 180) throw new Error('Invalid Plus Workplace Learn catalog title')
  if (typeof raw.lead !== 'string' || raw.lead.trim().length < 1 || raw.lead.length > 360) throw new Error('Invalid Plus Workplace Learn catalog lead')
  if (!(WORKPLACE_LEARN_CATEGORIES as readonly unknown[]).includes(raw.category)) throw new Error('Invalid Plus Workplace Learn catalog category')
  if (!Array.isArray(raw.tags) || raw.tags.length > 12 || raw.tags.some((tag) => typeof tag !== 'string' || tag.length > 48 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag)) || new Set(raw.tags).size !== raw.tags.length) {
    throw new Error('Invalid Plus Workplace Learn catalog tags')
  }
  if (raw.access !== 'plus') throw new Error('Plus Workplace Learn catalog access must be plus')
  if (!isRecord(raw.releaseReference) || !hasExactKeys(raw.releaseReference, ['contentId', 'revision'])) throw new Error('Invalid Plus Workplace Learn release reference')
  if (raw.releaseReference.contentId !== raw.id || typeof raw.releaseReference.revision !== 'string' || !REVISION.test(raw.releaseReference.revision)) {
    throw new Error('Invalid Plus Workplace Learn release reference')
  }
  return freezeEntry({
    schemaVersion: 1,
    kind: raw.kind,
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    lead: raw.lead,
    category: raw.category as WorkplaceLearnCategory,
    tags: raw.tags as string[],
    access: 'plus',
    releaseReference: { contentId: raw.releaseReference.contentId as string, revision: raw.releaseReference.revision },
  })
}

function freezeEntry(entry: WorkplaceLearnCatalogEntry): WorkplaceLearnCatalogEntry {
  return Object.freeze({
    ...entry,
    tags: Object.freeze([...entry.tags]) as unknown as string[],
    ...(entry.releaseReference ? { releaseReference: Object.freeze({ ...entry.releaseReference }) } : {}),
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const keys = [...expected].sort()
  return actual.length === keys.length && actual.every((key, index) => key === keys[index])
}

export function getWorkplaceLearnCatalogEntryBySlug(slug: string): WorkplaceLearnCatalogEntry | undefined {
  return workplaceLearnCatalog.find((entry) => entry.slug === slug)
}

export function listWorkplaceLearnCatalogEntries(category?: WorkplaceLearnCategory): readonly WorkplaceLearnCatalogEntry[] {
  return category
    ? workplaceLearnCatalog.filter((entry) => entry.category === category)
    : workplaceLearnCatalog
}

export { WORKPLACE_LEARN_CATEGORIES }
