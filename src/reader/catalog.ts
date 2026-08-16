/**
 * Book data access — the single seam through which the platform resolves books.
 *
 * The storefront, detail pages, library, and reader are book-agnostic: they
 * consume the `Book` type (and access metadata below) and never assume the
 * topic of any title. Adding a new book is a data-only change — register it
 * here — with no platform code changes (docs/product-contract.md §6).
 *
 * The registry is backed by the TS fixtures under src/content/fixtures. A real
 * registry / backend can replace this implementation without touching any
 * component.
 *
 * Access metadata: each entry may carry a gate-shaped preview boundary (the
 * shape consumed by `canRead` in src/lib/entitlement.ts). This is registry
 * metadata — the `Book` content model deliberately has no preview field (see
 * docs/ui-ux-research.md §4.2; the exact field shape is finalized by the
 * content-model lane). The authoring pipeline declares the same boundary in
 * books/<slug>/manifest.json; here the platform seam normalizes it to the
 * gate shape.
 */

import { sampleBook } from '../content/fixtures/sample-book'
import { secondBook } from '../content/fixtures/second-book'
import type { Book } from '../content/types'
import type { PreviewBoundary } from '../lib/entitlement'

/** One registered book plus its platform-level access metadata. */
export interface CatalogEntry {
  book: Book
  /**
   * Gate-shaped preview boundary: the ordered chapter prefix a non-owner may
   * read. Absent ⇒ no preview is offered (whole paid book is locked to
   * non-owners). Meaningless for `tier: 'free'` / `'preview'` books.
   */
  previewBoundary?: PreviewBoundary
}

/**
 * Registration order is the editorial order: the first entry is featured on
 * the storefront and the rest form the compact catalog. Both Prototype books
 * are `tier: 'free'` — publicly readable by everyone with no login / purchase
 * (docs/product-contract.md §15). Free books need no preview boundary; the
 * deny-by-default entitlement gate (src/lib/entitlement.ts) still protects any
 * future paid book regardless of this catalog.
 */
const entries: CatalogEntry[] = [
  { book: sampleBook },
  { book: secondBook },
]

export function listCatalogEntries(): CatalogEntry[] {
  return entries
}

export function getCatalogEntry(slug: string): CatalogEntry | undefined {
  return entries.find((entry) => entry.book.slug === slug)
}

export function listBooks(): Book[] {
  return entries.map((entry) => entry.book)
}

export function getBookBySlug(slug: string): Book | undefined {
  return getCatalogEntry(slug)?.book
}
