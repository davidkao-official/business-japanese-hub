/**
 * Book data access: the single seam through which every product surface
 * resolves authored Books and their access metadata.
 *
 * Vite discovers committed `content-dist/books/<slug>/current.json` release
 * snapshots and their snapshotted assets at build time. The browser and the
 * server-authoritative catalog seeder therefore consume the same immutable
 * Book, price, release revision, and preview boundary.
 */

import { validateReleaseSnapshot } from '../authoring/release'
import type { ReleaseSnapshot } from '../authoring/release'
import type { Book, ContentBlock } from '../content/types'
import type { PreviewBoundary } from '../lib/entitlement'

/** One registered Book plus its platform-level access metadata. */
export interface CatalogEntry {
  book: Book
  /** Ordered public prefix for an unowned paid Book. Absent means fully locked. */
  previewBoundary?: PreviewBoundary
}

interface DiscoveredEntry extends CatalogEntry {
  order: number
}

const releaseSnapshotModules = import.meta.glob('../../content-dist/books/*/current.json', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

const releasedAssetModules = import.meta.glob('../../content-dist/assets/books/**/*', {
  eager: true,
  import: 'default',
  query: '?url',
}) as Record<string, string>

function parseJson(path: string, raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`catalog: invalid JSON in ${path}: ${reason}`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function slugFromSnapshotPath(path: string): string {
  const match = /\/content-dist\/books\/([^/]+)\/current\.json$/.exec(path)
  if (!match?.[1]) throw new Error(`catalog: unexpected release snapshot path ${path}`)
  return match[1]
}

function readSnapshot(path: string, raw: string): ReleaseSnapshot {
  const parsed = parseJson(path, raw)
  if (!isRecord(parsed)) throw new Error(`catalog: ${path} must contain a JSON object`)
  return parsed as ReleaseSnapshot
}

function resolveAsset(slug: string, source: string): string {
  const prefix = `/assets/books/${slug}/`
  if (!source.startsWith(prefix)) return source
  const relative = source.slice(prefix.length)
  const modulePath = `../../content-dist/assets/books/${slug}/${relative}`
  const resolved = releasedAssetModules[modulePath]
  if (!resolved) throw new Error(`catalog: missing released asset ${modulePath}`)
  return resolved
}

function resolveBlockAssets(slug: string, block: ContentBlock): ContentBlock {
  return block.type === 'image' ? { ...block, src: resolveAsset(slug, block.src) } : block
}

function resolveBookAssets(book: Book): Book {
  return {
    ...book,
    cover: book.cover ? { ...book.cover, src: resolveAsset(book.slug, book.cover.src) } : undefined,
    chapters: book.chapters.map((chapter) => ({
      ...chapter,
      blocks: chapter.blocks.map((block) => resolveBlockAssets(book.slug, block)),
    })),
  }
}

function discoverEntries(): CatalogEntry[] {
  const discovered: DiscoveredEntry[] = Object.entries(releaseSnapshotModules).map(([path, raw]) => {
    const folderSlug = slugFromSnapshotPath(path)
    const snapshot = readSnapshot(path, raw)
    const result = validateReleaseSnapshot(snapshot, folderSlug)
    if (!result.ok) throw new Error(`catalog: invalid release ${folderSlug}: ${result.reason}`)
    return {
      book: resolveBookAssets(result.book),
      previewBoundary: result.previewBoundary,
      order: result.order,
    }
  })

  const published = discovered.filter(({ book }) => book.publication?.status === 'published')
  const ids = new Set<string>()
  const slugs = new Set<string>()
  for (const { book } of published) {
    if (ids.has(book.id)) throw new Error(`catalog: duplicate published Book id ${book.id}`)
    if (slugs.has(book.slug)) throw new Error(`catalog: duplicate published Book slug ${book.slug}`)
    ids.add(book.id)
    slugs.add(book.slug)
  }

  return published
    .sort((left, right) => left.order - right.order || left.book.slug.localeCompare(right.book.slug))
    .map(({ book, previewBoundary }) => ({ book, previewBoundary }))
}

const entries = discoverEntries()

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
