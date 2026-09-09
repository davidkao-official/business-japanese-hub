import { describe, expect, it } from 'vitest'
import { paidKeigoBook } from '../content/fixtures/paid-test-books'
import { preparePrivateBookRelease } from './privateBook'

describe('private Book release preparation', () => {
  it('validates a member Book without creating a public release or bundle input', () => {
    const published = {
      ...paidKeigoBook,
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
      ...paidKeigoBook,
      publication: { status: 'published' as const, releasedAt: '2026-09-10' },
    }
    expect(preparePrivateBookRelease(published, {})).toEqual({
      ok: false,
      reason: 'private Book requires an explicit valid preview boundary',
    })
  })

  it('does not import a draft merely because it is structurally valid', () => {
    expect(preparePrivateBookRelease(paidKeigoBook, {
      preview: { boundary: { kind: 'chapter', chapterId: 'ch-1' } },
    })).toEqual({ ok: false, reason: 'private Book must be explicitly published before server import' })
  })
})
