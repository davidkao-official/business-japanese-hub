/**
 * Legal-content model — typed, versioned legal documents (issue #25, B1).
 *
 * Every legal document carries an id, a route slug, a version id, a review
 * status, and per-locale titles + body content. `Locale` is imported type-only
 * from `src/i18n/strings` so the supported-locale set stays in one place.
 *
 * Bodies are structured as sections (heading + paragraphs) so the legal pages
 * can render real document structure instead of a wall of text.
 */

import type { Locale } from '../i18n/locales'

/** Review lifecycle: draft → review → live. All documents are pre-launch drafts today. */
export type LegalDocumentStatus = 'draft' | 'review' | 'live'

export interface LegalSection {
  /** Stable machine id for sections referenced by compliance evidence. */
  id?: string
  heading: string
  paragraphs: string[]
}

export interface LegalDocument {
  /** Stable machine id (e.g. "terms"). */
  id: string
  /** Route slug (e.g. "terms"); the URL is `/legal/<slug>`. */
  slug: string
  /** Version id, e.g. "v1". */
  version: string
  status: LegalDocumentStatus
  /** ISO date this version was authored. */
  revisedAt: string
  /** Per-locale document titles. */
  titles: Record<Locale, string>
  /** Per-locale body content, structured as sections. */
  bodies: Record<Locale, LegalSection[]>
}

export interface SellerDisclosure {
  /** Registered merchant-of-record (legal seller) name. */
  name: string
  address: string
  phone: string
  responsiblePerson: string
  supportEmail: string
  /** True while the registered name is not yet confirmed. */
  pending: boolean
}

/**
 * Placeholder merchant-of-record disclosure.
 *
 * The registered seller name is an EXTERNAL pre-sale gate (docs/legal-tax-launch-brief.md
 * §4.1) that is not yet known, so this constant is the single source for the
 * public disclosure and receipt surfaces. Replace every field and set
 * `pending` false as part of the reviewed legal-content release; checkout also
 * requires every document live and every explicit review-pending note removed.
 */
export const SELLER_DISCLOSURE: SellerDisclosure = {
  name: 'Seller name pending confirmation',
  address: 'Seller address pending confirmation',
  phone: 'Seller phone pending confirmation',
  responsiblePerson: 'Responsible person pending confirmation',
  supportEmail: 'Support email pending confirmation',
  pending: true,
}
