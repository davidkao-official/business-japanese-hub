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

import { LEGAL_DOCUMENTS } from './documents'
import type { LegalDocument } from './model'

/** All legal documents, in display order. */
export function listLegalDocuments(): LegalDocument[] {
  return [...LEGAL_DOCUMENTS]
}

/** Look up a document by its route slug (e.g. "terms"); undefined when unknown. */
export function getLegalDocumentBySlug(slug: string): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((doc) => doc.slug === slug)
}
