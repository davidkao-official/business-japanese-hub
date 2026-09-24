import { READING_CATEGORIES, type ReadingCatalogEntry, type ReadingCategory } from './types.ts'
import { sampleReadingItem } from './fixtures/sample-reading.ts'
import { toReadingCatalogEntry } from './validate.ts'

/** Current public inventory is the sample; any future catalog entries stay body-free. */
export const readingCatalog: readonly ReadingCatalogEntry[] = Object.freeze([
  Object.freeze(toReadingCatalogEntry(sampleReadingItem)),
])

export function getReadingCatalogEntryBySlug(slug: string): ReadingCatalogEntry | undefined {
  return readingCatalog.find((entry) => entry.slug === slug)
}

export function listReadingCatalogEntries(category?: ReadingCategory): readonly ReadingCatalogEntry[] {
  return category
    ? readingCatalog.filter((entry) => entry.category === category)
    : readingCatalog
}

export { READING_CATEGORIES }
