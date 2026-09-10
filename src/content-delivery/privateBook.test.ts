import { describe, expect, it } from 'vitest'
import type { Book } from '../content/types'
import { paidKeigoBook } from '../content/fixtures/paid-test-books'
import { MAX_PRIVATE_BOOK_PAYLOAD_BYTES, preparePrivateBookRelease } from './privateBook'

function withoutAssets(book: Book): Book {
  const withoutCover: Book = { ...book }
  delete withoutCover.cover
  return {
    ...withoutCover,
    chapters: book.chapters.map((chapter) => ({
      ...chapter,
      blocks: chapter.blocks.filter((block) => block.type !== 'image'),
    })),
  }
}

describe('private Book release preparation', () => {
  it('validates a member Book without creating a public release or bundle input', () => {
    const published = {
      ...withoutAssets(paidKeigoBook),
      publication: { status: 'published' as const, releasedAt: '2026-09-10' },
    }
    const result = preparePrivateBookRelease(published, {
      preview: { boundary: { kind: 'chapter', chapterId: 'ch-1' } },
    })

    expect(result).toMatchObject({
      ok: true,
      value: {
        schemaVersion: 1,
        contentId: published.id,
        contentKind: 'book',
        accessScope: 'member',
      },
    })
    if (!result.ok) return
    expect(result.value.revision).toMatch(/^[a-f0-9]{64}$/)
    expect(result.value.payload.preview.isPartial).toBe(true)
  })

  it('fails closed when a private Book has no explicit partial preview', () => {
    const published = {
      ...withoutAssets(paidKeigoBook),
      publication: { status: 'published' as const, releasedAt: '2026-09-10' },
    }
    expect(preparePrivateBookRelease(published, {})).toEqual({
      ok: false,
      reason: 'private Book requires an explicit valid preview boundary',
    })
  })

  it('does not import a draft merely because it is structurally valid', () => {
    expect(preparePrivateBookRelease(withoutAssets(paidKeigoBook), {
      preview: { boundary: { kind: 'chapter', chapterId: 'ch-1' } },
    })).toEqual({ ok: false, reason: 'private Book must be explicitly published before server import' })
  })

  it('rejects a structurally valid Book id that cannot be addressed by server delivery', () => {
    const published = {
      ...withoutAssets(paidKeigoBook),
      id: 'book/private',
      publication: { status: 'published' as const, releasedAt: '2026-09-10' },
    }

    expect(preparePrivateBookRelease(published, {
      preview: { boundary: { kind: 'chapter', chapterId: 'ch-1' } },
    })).toEqual({
      ok: false,
      reason: 'private Book id is not compatible with the server delivery reference contract',
    })
  })

  it('fails closed on covers and image blocks until immutable server asset delivery exists', () => {
    const published = {
      ...paidKeigoBook,
      publication: { status: 'published' as const, releasedAt: '2026-09-10' },
    }

    expect(preparePrivateBookRelease(published, {
      preview: { boundary: { kind: 'chapter', chapterId: 'ch-1' } },
    })).toEqual({
      ok: false,
      reason: 'private Book assets require a server-authorized immutable asset adapter before import',
    })
  })

  it('rejects a payload that cannot fit safely within the server release store limit', () => {
    const assetFree = withoutAssets(paidKeigoBook)
    const published = {
      ...assetFree,
      publication: { status: 'published' as const, releasedAt: '2026-09-10' },
      chapters: [
        {
          ...assetFree.chapters[0]!,
          blocks: [{ id: 'private-size-test', type: 'paragraph' as const, text: 'x'.repeat(MAX_PRIVATE_BOOK_PAYLOAD_BYTES) }],
        },
        ...assetFree.chapters.slice(1),
      ],
    }

    expect(preparePrivateBookRelease(published, {
      preview: { boundary: { kind: 'chapter', chapterId: 'ch-1' } },
    })).toEqual({ ok: false, reason: 'private Book payload exceeds the server delivery size limit' })
  })

  it('rejects exponent-form numbers that PostgreSQL jsonb would expand beyond the measured wire size', () => {
    const published = {
      ...withoutAssets(paidKeigoBook),
      publication: { status: 'published' as const, releasedAt: '2026-09-10' },
      forwardCompatibleNumericMetadata: [1e308],
    }

    expect(preparePrivateBookRelease(published, {
      preview: { boundary: { kind: 'chapter', chapterId: 'ch-1' } },
    })).toEqual({
      ok: false,
      reason: 'private Book cannot contain exponent-form numbers in server-delivered payloads',
    })
  })

  it('rejects NUL and unpaired-surrogate strings that PostgreSQL jsonb cannot store', () => {
    for (const value of ['\u0000', '\ud800']) {
      const published = {
        ...withoutAssets(paidKeigoBook),
        publication: { status: 'published' as const, releasedAt: '2026-09-10' },
        forwardCompatibleTextMetadata: value,
      }
      expect(preparePrivateBookRelease(published, {
        preview: { boundary: { kind: 'chapter', chapterId: 'ch-1' } },
      })).toEqual({ ok: false, reason: 'private Book contains strings incompatible with PostgreSQL jsonb' })
    }
  })

  it('rejects PostgreSQL-incompatible forward-compatible object keys', () => {
    const published = {
      ...withoutAssets(paidKeigoBook),
      publication: { status: 'published' as const, releasedAt: '2026-09-10' },
      ['\u0000']: 'forward-compatible key',
    }
    expect(preparePrivateBookRelease(published, {
      preview: { boundary: { kind: 'chapter', chapterId: 'ch-1' } },
    })).toEqual({ ok: false, reason: 'private Book contains strings incompatible with PostgreSQL jsonb' })
  })
})
