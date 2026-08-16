import { describe, expect, it } from 'vitest'
import { SUPPORTED_LOCALES } from '../i18n/strings'
import { getLegalDocumentBySlug, listLegalDocuments, SELLER_DISCLOSURE } from './index'
import { LEGAL_DOCUMENTS } from './documents'

describe('legal content', () => {
  it('has exactly the four required documents in display order', () => {
    expect(LEGAL_DOCUMENTS.map((doc) => doc.slug)).toEqual([
      'terms',
      'privacy',
      'tokushoho',
      'refunds',
    ])
  })

  it('uses unique ids and slugs', () => {
    const ids = listLegalDocuments().map((doc) => doc.id)
    const slugs = listLegalDocuments().map((doc) => doc.slug)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('provides non-empty titles and structured bodies for every supported locale', () => {
    for (const doc of listLegalDocuments()) {
      for (const locale of SUPPORTED_LOCALES) {
        expect(doc.titles[locale].trim()).not.toBe('')
        expect(doc.bodies[locale].length).toBeGreaterThanOrEqual(2)
        for (const section of doc.bodies[locale]) {
          expect(section.heading.trim()).not.toBe('')
          expect(section.paragraphs.length).toBeGreaterThan(0)
          for (const paragraph of section.paragraphs) {
            expect(paragraph.trim()).not.toBe('')
          }
        }
      }
    }
  })

  it('is versioned and currently in draft status', () => {
    for (const doc of listLegalDocuments()) {
      expect(doc.version).toMatch(/^v\d+$/)
      expect(doc.status).toBe('draft')
      expect(doc.revisedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('ends every body with a localized draft-status note', () => {
    for (const doc of listLegalDocuments()) {
      for (const locale of SUPPORTED_LOCALES) {
        const last = doc.bodies[locale][doc.bodies[locale].length - 1]
        const keyword = locale === 'ja' ? 'ドラフト' : locale === 'en' ? 'draft' : '草稿'
        expect(last.heading.toLowerCase()).toContain(keyword.toLowerCase())
      }
    }
  })

  it('looks documents up by slug and returns undefined for unknown slugs', () => {
    expect(getLegalDocumentBySlug('terms')?.id).toBe('terms')
    expect(getLegalDocumentBySlug('tokushoho')?.id).toBe('tokushoho')
    expect(getLegalDocumentBySlug('nope')).toBeUndefined()
  })

  it('exports the pending seller disclosure placeholder (pre-sale gate)', () => {
    expect(SELLER_DISCLOSURE.pending).toBe(true)
    expect(SELLER_DISCLOSURE.name.trim()).not.toBe('')
  })
})
