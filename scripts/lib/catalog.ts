import { isSafeMoney } from '../../src/lib/payments/contract'
import type { Money } from '../../src/lib/payments/contract'

export interface SnapshotDescriptor {
  id?: string
  slug?: string
  createdAt?: string
  releasedAt?: string
  contentHash?: string
}

export interface SnapshotBook {
  id?: string
  slug?: string
  price?: { tier?: string; amount?: number; currency?: string }
  publication?: { status?: string; releasedAt?: string }
}

export interface SnapshotFile {
  schema?: string
  descriptor?: SnapshotDescriptor
  book?: SnapshotBook
}

export interface CatalogRow {
  book_id: string
  slug: string
  currency: string
  amount_minor: number
  published_revision: string
  released_at: string
  updated_at: string
}

export type BuildResult =
  | { kind: 'row'; row: CatalogRow }
  | { kind: 'retire'; bookId: string; reason: string }
  | { kind: 'error'; reason: string }

/** Checkout activation is the later of publish creation and authored release date. */
export function releaseTimestamp(snapshot: SnapshotFile): string | null {
  const createdAt = snapshot.descriptor?.createdAt
  const authoredDate = snapshot.book?.publication?.releasedAt ?? snapshot.descriptor?.releasedAt
  const candidates = [createdAt, authoredDate ? `${authoredDate}T00:00:00Z` : undefined]
    .filter((value): value is string => value !== undefined)
    .map((value) => Date.parse(value))
  if (candidates.length === 0 || candidates.some((value) => !Number.isFinite(value))) return null
  return new Date(Math.max(...candidates)).toISOString()
}

/** Decide which server rows must be removed before applying desired paid rows. */
export function catalogRetirements(
  existingBookIds: string[],
  desiredRows: CatalogRow[],
  explicitRetirements: string[],
  fullSync: boolean,
): string[] {
  const desired = new Set(desiredRows.map((row) => row.book_id))
  const retired = new Set(explicitRetirements)
  if (fullSync) {
    for (const bookId of existingBookIds) {
      if (!desired.has(bookId)) retired.add(bookId)
    }
  }
  for (const bookId of desired) retired.delete(bookId)
  return [...retired].sort()
}

/** Convert the supported major-unit display amount into exact integer minor units. */
export function toAmountMinor(price: { amount?: number; currency?: string }): number | null {
  if (price.amount === undefined || price.currency === undefined) return null
  if (!Number.isFinite(price.amount) || price.amount < 0) return null
  const exponent =
    price.currency === 'JPY' ? 1 : price.currency === 'TWD' || price.currency === 'USD' ? 100 : null
  if (exponent === null) return null

  const raw = price.amount * exponent
  const rounded = Math.round(raw)
  return Math.abs(raw - rounded) <= Number.EPSILON * Math.max(1, Math.abs(raw)) * 4
    ? rounded
    : null
}

/** Build one fail-closed authoritative catalog row from a released snapshot. */
export function buildCatalogRow(
  slug: string,
  snapshot: SnapshotFile,
  updatedAt: string = new Date().toISOString(),
): BuildResult {
  const book = snapshot.book
  const releasedAt = releaseTimestamp(snapshot)
  const publishedRevision = snapshot.descriptor?.id
  const contentHash = snapshot.descriptor?.contentHash
  const bookId = book?.id
  const tier = book?.price?.tier

  if (snapshot.descriptor?.slug !== slug) {
    return { kind: 'error', reason: 'snapshot descriptor.slug does not match target slug' }
  }
  if (book?.slug !== slug) {
    return { kind: 'error', reason: 'snapshot book.slug does not match target slug' }
  }
  if (!publishedRevision) return { kind: 'error', reason: 'snapshot has no descriptor.id' }
  if (!bookId) return { kind: 'error', reason: 'snapshot has no book.id' }
  if (
    !contentHash ||
    !/^[a-f0-9]{64}$/.test(contentHash) ||
    !publishedRevision.endsWith(`-${contentHash.slice(0, 12)}`)
  ) {
    return { kind: 'error', reason: 'snapshot has invalid content-addressed revision identity' }
  }

  if (book.publication?.status !== 'published') {
    return {
      kind: 'retire',
      bookId,
      reason: `publication.status=${String(book.publication?.status)} (not for sale)`,
    }
  }
  if (releasedAt === null) return { kind: 'error', reason: 'no valid release timestamp on the snapshot' }

  if (tier !== 'paid') {
    return { kind: 'retire', bookId, reason: `tier=${String(tier)} (not sold via the price seam)` }
  }

  const amountMinor = toAmountMinor(book.price ?? {})
  const currency = book.price?.currency
  if (amountMinor === null || !currency) {
    return { kind: 'error', reason: 'paid book is missing amount/currency or has an unlocked currency' }
  }
  if (amountMinor <= 0 || !isSafeMoney({ amount: amountMinor, currency } as Money)) {
    return { kind: 'error', reason: `converted amount_minor=${amountMinor} is not a safe, non-negative integer` }
  }

  return {
    kind: 'row',
    row: {
      book_id: bookId,
      slug,
      currency,
      amount_minor: amountMinor,
      published_revision: publishedRevision,
      released_at: releasedAt,
      updated_at: updatedAt,
    },
  }
}
