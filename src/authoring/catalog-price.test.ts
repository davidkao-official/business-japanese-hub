import { describe, expect, it } from 'vitest'
import {
  buildCatalogRow,
  catalogRetirements,
  releaseTimestamp,
  toAmountMinor,
  type SnapshotFile,
} from '../../scripts/lib/catalog'
import { releaseContentHash, verifyReleaseContent } from '../../scripts/lib/releases'
import { sampleBook } from '../content/fixtures/sample-book'
import { derivePreview } from './preview'

const CONTENT_HASH = 'a'.repeat(64)

function paidSnapshot(overrides: Partial<SnapshotFile> = {}): SnapshotFile {
  return {
    schema: 'publish-snapshot-v1',
    descriptor: {
      id: 'meeting-japanese@e1-r1-aaaaaaaaaaaa',
      slug: 'meeting-japanese',
      createdAt: '2026-08-20T00:00:00.000Z',
      contentHash: CONTENT_HASH,
    },
    book: {
      id: 'book-meeting-japanese',
      slug: 'meeting-japanese',
      price: { tier: 'paid', amount: 12, currency: 'USD' },
      publication: { status: 'published', releasedAt: '2026-08-20' },
    },
    ...overrides,
  }
}

describe('authoritative catalog pricing', () => {
  it('builds the exact USD 12.00 server catalog row for the commercial Book', () => {
    expect(buildCatalogRow('meeting-japanese', paidSnapshot(), '2026-08-20T01:00:00.000Z')).toEqual({
      kind: 'row',
      row: {
        book_id: 'book-meeting-japanese',
        slug: 'meeting-japanese',
        currency: 'USD',
        amount_minor: 1200,
        published_revision: 'meeting-japanese@e1-r1-aaaaaaaaaaaa',
        released_at: '2026-08-20T00:00:00.000Z',
        updated_at: '2026-08-20T01:00:00.000Z',
      },
    })
  })

  it('converts decimal USD without floating-point drift and rejects sub-cent prices', () => {
    expect(toAmountMinor({ amount: 12.99, currency: 'USD' })).toBe(1299)
    expect(toAmountMinor({ amount: 12.999, currency: 'USD' })).toBeNull()
  })

  it('skips free Books and rejects inconsistent snapshot identity', () => {
    const free = paidSnapshot({
      descriptor: {
        id: 'free-book@e1-r1-aaaaaaaaaaaa',
        slug: 'free-book',
        createdAt: '2026-08-20T00:00:00.000Z',
        contentHash: CONTENT_HASH,
      },
      book: {
        id: 'book-free',
        slug: 'free-book',
        price: { tier: 'free' },
        publication: { status: 'published', releasedAt: '2026-08-20' },
      },
    })
    expect(buildCatalogRow('free-book', free, '2026-08-20T01:00:00.000Z')).toEqual({
      kind: 'retire',
      bookId: 'book-free',
      reason: 'tier=free (not sold via the price seam)',
    })
    expect(buildCatalogRow('wrong-slug', free, '2026-08-20T01:00:00.000Z')).toEqual({
      kind: 'error',
      reason: 'snapshot descriptor.slug does not match target slug',
    })
  })

  it('uses the later publish or authored release instant and gates future releases', () => {
    const future = paidSnapshot({
      descriptor: {
        id: 'meeting-japanese@e1-r1-aaaaaaaaaaaa',
        slug: 'meeting-japanese',
        createdAt: '2026-08-20T09:00:00.000Z',
        contentHash: CONTENT_HASH,
      },
      book: {
        id: 'book-meeting-japanese',
        slug: 'meeting-japanese',
        price: { tier: 'paid', amount: 12, currency: 'USD' },
        publication: { status: 'published', releasedAt: '2026-09-01' },
      },
    })
    expect(releaseTimestamp(future)).toBe('2026-09-01T00:00:00.000Z')
  })

  it('retires free, unpublished, and removed Books without deleting desired paid rows', () => {
    const desired = buildCatalogRow('meeting-japanese', paidSnapshot(), '2026-08-20T01:00:00.000Z')
    if (desired.kind !== 'row') throw new Error('expected a paid catalog row')

    expect(
      catalogRetirements(
        ['book-meeting-japanese', 'book-became-free', 'book-removed'],
        [desired.row],
        ['book-became-free', 'book-unpublished'],
        true,
      ),
    ).toEqual(['book-became-free', 'book-removed', 'book-unpublished'])
    expect(catalogRetirements([], [desired.row], ['book-meeting-japanese'], false)).toEqual([])
  })

  it('detects a committed release changed after its content-addressed id was minted', () => {
    const assets = '/definitely-missing-business-japanese-hub-assets'
    const preview = derivePreview(sampleBook, { kind: 'chapter', chapterId: sampleBook.chapters.at(-1)!.id })
    if (!preview.ok) throw new Error('expected valid full-book preview')
    const snapshot = {
      schema: 'publish-snapshot-v1',
      descriptor: { id: '', slug: sampleBook.slug, contentHash: '' },
      catalog: { order: 1 },
      preview: preview.value,
      book: structuredClone(sampleBook),
    }
    const contentHash = releaseContentHash(
      { book: snapshot.book, preview: snapshot.preview, catalog: snapshot.catalog },
      assets,
    )
    snapshot.descriptor.contentHash = contentHash
    snapshot.descriptor.id = `${sampleBook.slug}@e1-r1-${contentHash.slice(0, 12)}`
    expect(verifyReleaseContent(sampleBook.slug, snapshot, assets)).toBeNull()

    snapshot.book.title = 'Changed after release'
    expect(verifyReleaseContent(sampleBook.slug, snapshot, assets)).toMatch(/content hash mismatch/)
  })
})
