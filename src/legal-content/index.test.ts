import { describe, expect, it } from 'vitest'
import { SUPPORTED_LOCALES } from '../i18n/strings'
import {
  getLegalDocumentBySlug,
  listLegalDocuments,
  requireLegalDocumentBySlug,
  SELLER_DISCLOSURE,
  isPaidLaunchLegalReady,
} from './index'
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

  it('keeps defined legal-section ids unique within each document locale', () => {
    for (const doc of listLegalDocuments()) {
      for (const locale of SUPPORTED_LOCALES) {
        const ids = doc.bodies[locale]
          .map((section) => section.id)
          .filter((id): id is string => id !== undefined)
        expect(new Set(ids).size, `${doc.slug}/${locale} has duplicate section ids`).toBe(ids.length)
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

  it('keeps optional route lookup separate from fail-closed compliance lookup', () => {
    expect(getLegalDocumentBySlug('terms')?.id).toBe('terms')
    expect(getLegalDocumentBySlug('tokushoho')?.id).toBe('tokushoho')
    expect(getLegalDocumentBySlug('nope')).toBeUndefined()

    expect(requireLegalDocumentBySlug('refunds').id).toBe('refunds')
    expect(() => requireLegalDocumentBySlug('nope')).toThrow(
      'Required legal document is unavailable: nope',
    )
  })

  it('exports the pending seller disclosure placeholder (pre-sale gate)', () => {
    expect(SELLER_DISCLOSURE.pending).toBe(true)
    expect(SELLER_DISCLOSURE.name.trim()).not.toBe('')
    expect(SELLER_DISCLOSURE.address.trim()).not.toBe('')
    expect(SELLER_DISCLOSURE.phone.trim()).not.toBe('')
    expect(SELLER_DISCLOSURE.responsiblePerson.trim()).not.toBe('')
    expect(SELLER_DISCLOSURE.supportEmail.trim()).not.toBe('')
    expect(isPaidLaunchLegalReady()).toBe(false)
  })

  it('renders the canonical seller disclosure in every Tokushoho locale', () => {
    const document = requireLegalDocumentBySlug('tokushoho')
    for (const locale of SUPPORTED_LOCALES) {
      const sellerSection = document.bodies[locale].find(
        (section) => section.id === 'jp-tokushoho-seller-disclosure',
      )
      const disclosure = sellerSection?.paragraphs.join('\n') ?? ''
      expect(disclosure).toContain(SELLER_DISCLOSURE.name)
      expect(disclosure).toContain(SELLER_DISCLOSURE.address)
      expect(disclosure).toContain(SELLER_DISCLOSURE.phone)
      expect(disclosure).toContain(SELLER_DISCLOSURE.responsiblePerson)
      expect(disclosure).toContain(SELLER_DISCLOSURE.supportEmail)
    }
  })

  it('cannot become launch-ready while reviewed-document placeholder notes remain', () => {
    const liveDocuments = LEGAL_DOCUMENTS.map((document) => ({
      ...document,
      status: 'live' as const,
    }))
    const completeSeller = {
      name: 'Example Seller LLC',
      address: '1 Example Street',
      phone: '+1-555-0100',
      responsiblePerson: 'Example Person',
      supportEmail: 'support@example.com',
      pending: false,
    }

    expect(isPaidLaunchLegalReady(liveDocuments, completeSeller)).toBe(false)

    const replacements = [
      [SELLER_DISCLOSURE.name, completeSeller.name],
      [SELLER_DISCLOSURE.address, completeSeller.address],
      [SELLER_DISCLOSURE.phone, completeSeller.phone],
      [SELLER_DISCLOSURE.responsiblePerson, completeSeller.responsiblePerson],
      [SELLER_DISCLOSURE.supportEmail, completeSeller.supportEmail],
    ] as const
    const reviewedDocuments = liveDocuments.map((document) => ({
      ...document,
      bodies: Object.fromEntries(
        SUPPORTED_LOCALES.map((locale) => [
          locale,
          document.bodies[locale]
            .filter((section) => section.id !== 'legal-review-pending')
            .map((section) => ({
              ...section,
              paragraphs: section.paragraphs.map((paragraph) =>
                replacements.reduce(
                  (result, [before, after]) => result.replaceAll(before, after),
                  paragraph,
                ),
              ),
            })),
        ]),
      ) as typeof document.bodies,
    }))
    expect(isPaidLaunchLegalReady(reviewedDocuments, completeSeller)).toBe(true)
  })
})
