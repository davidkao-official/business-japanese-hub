/**
 * Book data access — the single seam through which the platform resolves books.
 *
 * The reader and detail pages are book-agnostic: they consume the `Book` type
 * and never assume the topic of any title. For the vertical slice this registry
 * is backed by the sample fixture (`src/content/fixtures/sample-book.ts`) as
 * demo/dev data — the fixture is the one place that already exercises every
 * supported block type (#3), which is exactly what the reader must render.
 *
 * A real registry / backend (issue #6+ storefront + entitlement) can replace
 * this implementation without touching any reader or detail component.
 */

import { sampleBook } from '../content/fixtures/sample-book'
import type { Book } from '../content/types'

const books: Book[] = [sampleBook]

export function listBooks(): Book[] {
  return books
}

export function getBookBySlug(slug: string): Book | undefined {
  return books.find((book) => book.slug === slug)
}
