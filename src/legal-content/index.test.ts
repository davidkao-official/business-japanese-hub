import { describe, expect, it } from 'vitest'
import { LEGAL_CONTENT_LOCALES } from './model'
import {
  getLegalDocumentBySlug,
  listLegalDocuments,
  requireLegalDocumentBySlug,
  SELLER_DISCLOSURE,
  sellerDisclosureFor,
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

  it('keeps legal document locales separate from UI locales', () => {
    expect(LEGAL_CONTENT_LOCALES).toEqual(['ja', 'zh-TW', 'en'])
  })

  it('uses unique ids and slugs', () => {
    const ids = listLegalDocuments().map((doc) => doc.id)
    const slugs = listLegalDocuments().map((doc) => doc.slug)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('provides non-empty titles and structured bodies for every supported locale', () => {
    for (const doc of listLegalDocuments()) {
      for (const locale of LEGAL_CONTENT_LOCALES) {
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
      for (const locale of LEGAL_CONTENT_LOCALES) {
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
      for (const locale of LEGAL_CONTENT_LOCALES) {
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
    expect(SELLER_DISCLOSURE).toEqual({
      name: 'Seller name pending confirmation',
      address: 'Seller address pending confirmation',
      phone: 'Seller phone pending confirmation',
      responsiblePerson: 'Responsible person pending confirmation',
      supportEmail: 'Support email pending confirmation',
      pending: true,
    })
    expect(sellerDisclosureFor('ja')).toEqual({
      name: '販売者名確認中（確定後に掲載します）',
      address: '所在地確認中（確定後に掲載します）',
      phone: '電話番号確認中（確定後に掲載します）',
      responsiblePerson: '責任者確認中（確定後に掲載します）',
      supportEmail: '現在準備中です。確定後に掲載します',
      pending: true,
    })
    expect(isPaidLaunchLegalReady()).toBe(false)
  })

  it('keeps pending seller text isolated to each legal locale', () => {
    for (const document of LEGAL_DOCUMENTS) {
      for (const locale of LEGAL_CONTENT_LOCALES) {
        const body = document.bodies[locale].map((section) => section.paragraphs.join('\n')).join('\n')
        const ownDisclosure = sellerDisclosureFor(locale)
        expect(body).toContain(ownDisclosure.supportEmail)
        if (document.slug === 'tokushoho') {
          expect(body).toContain(ownDisclosure.name)
          expect(body).toContain(ownDisclosure.address)
          expect(body).toContain(ownDisclosure.phone)
          expect(body).toContain(ownDisclosure.responsiblePerson)
        }
        for (const otherLocale of LEGAL_CONTENT_LOCALES.filter((candidate) => candidate !== locale)) {
          const otherDisclosure = sellerDisclosureFor(otherLocale)
          expect(body).not.toContain(otherDisclosure.supportEmail)
          if (document.slug === 'tokushoho') {
            expect(body).not.toContain(otherDisclosure.name)
            expect(body).not.toContain(otherDisclosure.address)
            expect(body).not.toContain(otherDisclosure.phone)
            expect(body).not.toContain(otherDisclosure.responsiblePerson)
          }
        }
        expect(body).not.toMatch(/mailto:/i)
      }
    }
    expect(SELLER_DISCLOSURE.pending).toBe(true)
    expect(isPaidLaunchLegalReady()).toBe(false)
  })

  it('renders the canonical seller disclosure in every Tokushoho locale', () => {
    const document = requireLegalDocumentBySlug('tokushoho')
    for (const locale of LEGAL_CONTENT_LOCALES) {
      const sellerSection = document.bodies[locale].find(
        (section) => section.id === 'jp-tokushoho-seller-disclosure',
      )
      const disclosure = sellerSection?.paragraphs.join('\n') ?? ''
      const seller = sellerDisclosureFor(locale)
      expect(disclosure).toContain(seller.name)
      expect(disclosure).toContain(seller.address)
      expect(disclosure).toContain(seller.phone)
      expect(disclosure).toContain(seller.responsiblePerson)
      expect(disclosure).toContain(seller.supportEmail)
    }
  })

  it('returns real seller fields unchanged after confirmation', () => {
    const realSeller = {
      name: 'Example Seller LLC',
      address: '1 Example Street',
      phone: '+1-555-0100',
      responsiblePerson: 'Example Person',
      supportEmail: 'support@example.com',
      pending: false,
    }
    expect(sellerDisclosureFor('ja', realSeller)).toBe(realSeller)
    expect(sellerDisclosureFor('en', realSeller)).toBe(realSeller)
    expect(sellerDisclosureFor('zh-TW', realSeller)).toBe(realSeller)
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

    const reviewedDocuments = liveDocuments.map((document) => ({
      ...document,
      bodies: Object.fromEntries(
        LEGAL_CONTENT_LOCALES.map((locale) => [
          locale,
          document.bodies[locale]
            .filter((section) => section.id !== 'legal-review-pending')
            .map((section) => ({
              ...section,
              paragraphs: section.paragraphs.map((paragraph) =>
                [
                  [sellerDisclosureFor(locale).name, completeSeller.name],
                  [sellerDisclosureFor(locale).address, completeSeller.address],
                  [sellerDisclosureFor(locale).phone, completeSeller.phone],
                  [sellerDisclosureFor(locale).responsiblePerson, completeSeller.responsiblePerson],
                  [sellerDisclosureFor(locale).supportEmail, completeSeller.supportEmail],
                ].reduce(
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
