/**
 * Legal-content public surface (issue #25, B1).
 *
 * Exposes the versioned legal documents and the merchant-of-record
 * (seller) disclosure placeholder to the rest of the app.
 */

export { SELLER_DISCLOSURE } from './model'
export type {
  LegalDocument,
  LegalDocumentStatus,
  LegalSection,
  SellerDisclosure,
} from './model'
export { LEGAL_DOCUMENTS } from './documents'
export {
  canonicalCheckoutEvidence,
  JP_CONSENT_VERSION_ID,
  JP_NOTICE_VERSION_ID,
  TW_CONSENT_VERSION_ID,
  TW_NOTICE_VERSION_ID,
} from './checkout-evidence'
export type { CanonicalCheckoutEvidence } from './checkout-evidence'

import { LEGAL_DOCUMENTS } from './documents'
import { SELLER_DISCLOSURE } from './model'
import type { LegalDocument, SellerDisclosure } from './model'

/** All legal documents, in display order. */
export function listLegalDocuments(): LegalDocument[] {
  return [...LEGAL_DOCUMENTS]
}

/** Look up a document by its route slug (e.g. "terms"); undefined when unknown. */
export function getLegalDocumentBySlug(slug: string): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((doc) => doc.slug === slug)
}

/**
 * Look up a legal document that is REQUIRED for a compliance/evidence path.
 * Missing legal content must fail closed rather than fabricating a version or
 * falling back to unrelated copy.
 */
export function requireLegalDocumentBySlug(slug: string): LegalDocument {
  const document = getLegalDocumentBySlug(slug)
  if (!document) {
    throw new Error(`Required legal document is unavailable: ${slug}`)
  }
  return document
}

/**
 * Code-side paid-launch legal gate. It can become true only after the exact
 * reviewed document versions and complete real seller disclosure are committed.
 * Provider credentials are checked separately at the server boundary.
 */
export function isPaidLaunchLegalReady(
  documents: readonly LegalDocument[] = LEGAL_DOCUMENTS,
  seller: SellerDisclosure = SELLER_DISCLOSURE,
): boolean {
  if (documents.some((document) => document.status !== 'live')) return false
  if (
    documents.some((document) =>
      Object.values(document.bodies).some((sections) =>
        sections.some((section) => section.id === 'legal-review-pending'),
      ),
    )
  ) {
    return false
  }
  if (seller.pending) return false
  const fields = [
    seller.name,
    seller.address,
    seller.phone,
    seller.responsiblePerson,
    seller.supportEmail,
  ]
  if (fields.some((value) => !value.trim())) return false
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(seller.supportEmail)) return false

  const tokushoho = documents.find((document) => document.slug === 'tokushoho')
  if (!tokushoho) return false
  const sellerFields = fields.map((value) => value.trim())
  if (
    Object.values(tokushoho.bodies).some((sections) => {
      const section = sections.find(
        (candidate) => candidate.id === 'jp-tokushoho-seller-disclosure',
      )
      const disclosure = section?.paragraphs.join('\n') ?? ''
      return sellerFields.some((field) => !disclosure.includes(field))
    })
  ) {
    return false
  }

  return documents.every((document) =>
    Object.values(document.bodies).every((sections) =>
      sections.some((section) => section.paragraphs.join('\n').includes(seller.supportEmail)),
    ),
  )
}
