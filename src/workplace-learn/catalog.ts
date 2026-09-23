import { WORKPLACE_LEARN_CATEGORIES, type WorkplaceLearnCatalogEntry, type WorkplaceLearnCategory, type WorkplaceLearnRuntimeItem } from './types'
import { toWorkplaceLearnCatalogEntry, validateWorkplaceLearnRuntimeItem } from './validate'
import { sampleWorkplaceLearnItem, sampleWorkplaceVocabularyItem } from './sample'

/** Current public inventory is an explicitly non-proprietary Free lesson and vocabulary pair. */
export const workplaceLearnCatalog: readonly WorkplaceLearnCatalogEntry[] = buildWorkplaceLearnCatalog([
  sampleWorkplaceLearnItem,
  sampleWorkplaceVocabularyItem,
])

/** Validate catalog identity and all lesson/vocabulary references before projecting metadata. */
export function buildWorkplaceLearnCatalog(
  items: readonly WorkplaceLearnRuntimeItem[],
  releaseReferences: Readonly<Record<string, { contentId: string; revision: string }>> = {},
): readonly WorkplaceLearnCatalogEntry[] {
  const ids = new Set<string>()
  const slugs = new Set<string>()
  const vocabularyIds = items.filter((item) => item.kind === 'vocabulary').map((item) => item.id)
  const lessonIds = items.filter((item) => item.kind === 'lesson').map((item) => item.id)
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`Duplicate Workplace Learn id: ${item.id}`)
    if (slugs.has(item.slug)) throw new Error(`Duplicate Workplace Learn slug: ${item.slug}`)
    ids.add(item.id)
    slugs.add(item.slug)
  }
  for (const item of items) {
    const validated = validateWorkplaceLearnRuntimeItem(item, { vocabularyIds, contentIds: lessonIds })
    if (!validated.ok) throw new Error(`Invalid Workplace Learn item ${item.id}: ${validated.issues[0]?.path ?? 'unknown field'}`)
    if (item.access === 'plus' && releaseReferences[item.id] === undefined) {
      throw new Error(`Plus Workplace Learn catalog item requires a release reference: ${item.id}`)
    }
  }
  for (const [id, reference] of Object.entries(releaseReferences)) {
    if (!ids.has(id)) throw new Error(`Workplace Learn release reference has no catalog item: ${id}`)
    const item = items.find((candidate) => candidate.id === id)!
    if (item.access !== 'plus') throw new Error(`Workplace Learn release reference requires Plus access: ${id}`)
    if (reference.contentId !== id || !/^[a-f0-9]{64}$/.test(reference.revision)) throw new Error(`Invalid Workplace Learn release reference: ${id}`)
  }
  return Object.freeze(items.map((item) => Object.freeze(toWorkplaceLearnCatalogEntry(item, releaseReferences[item.id]))))
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
