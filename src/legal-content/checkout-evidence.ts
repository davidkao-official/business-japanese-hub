/**
 * Canonical checkout evidence shared by the browser and the checkout Edge
 * Function. The client may transport this snapshot, but it never defines it:
 * the server compares every field to this module before persisting anything.
 */
import type { Locale } from '../i18n/locales'
import type { ResolvedJurisdiction } from '../lib/payments/contract'
import { LEGAL_DOCUMENTS } from './documents'
import type { LegalDocument, LegalSection } from './model'

const TW_WITHDRAWAL_NOTICE_SECTION_ID = 'tw-withdrawal-notice'
const TW_IMMEDIATE_DELIVERY_CONSENT_SECTION_ID = 'tw-immediate-delivery-consent'
const JP_TOKUSHOHO_NOTICE_SECTION_ID = 'jp-tokushoho-seller-disclosure'
const JP_REFUNDS_ACK_SECTION_ID = 'jp-refunds-acknowledgement'

function requireLegalDocumentBySlug(slug: string): LegalDocument {
  const document = LEGAL_DOCUMENTS.find((candidate) => candidate.slug === slug)
  if (!document) throw new Error(`Required legal document is unavailable: ${slug}`)
  return document
}

function requireEvidenceSection(
  document: LegalDocument,
  locale: Locale,
  sectionId: string,
  evidenceName: string,
): LegalSection {
  const matches = document.bodies[locale]?.filter((candidate) => candidate.id === sectionId) ?? []
  const section = matches.length === 1 ? matches[0] : undefined
  if (
    !section ||
    !section.heading.trim() ||
    section.paragraphs.length === 0 ||
    section.paragraphs.some((paragraph) => !paragraph.trim())
  ) {
    throw new Error(
      `Required legal evidence is unavailable or malformed: ${document.slug}/${locale}/${evidenceName}`,
    )
  }
  return section
}

const TW_NOTICE_DOCUMENT = requireLegalDocumentBySlug('refunds')
const JP_NOTICE_DOCUMENT = requireLegalDocumentBySlug('tokushoho')
const JP_CONSENT_DOCUMENT = requireLegalDocumentBySlug('refunds')

const TW_NOTICE_SECTION = requireEvidenceSection(
  TW_NOTICE_DOCUMENT,
  'zh-TW',
  TW_WITHDRAWAL_NOTICE_SECTION_ID,
  'tw-withdrawal-notice',
)
const TW_CONSENT_SECTION = requireEvidenceSection(
  TW_NOTICE_DOCUMENT,
  'zh-TW',
  TW_IMMEDIATE_DELIVERY_CONSENT_SECTION_ID,
  'tw-immediate-delivery-consent',
)
const JP_NOTICE_SECTION = requireEvidenceSection(
  JP_NOTICE_DOCUMENT,
  'ja',
  JP_TOKUSHOHO_NOTICE_SECTION_ID,
  'jp-tokushoho-notice',
)
const JP_CONSENT_SECTION = requireEvidenceSection(
  JP_CONSENT_DOCUMENT,
  'ja',
  JP_REFUNDS_ACK_SECTION_ID,
  'jp-refunds-acknowledgement',
)

export const TW_NOTICE_VERSION_ID = `tw-7day-removal-notice-${TW_NOTICE_DOCUMENT.version}`
export const TW_CONSENT_VERSION_ID = `tw-digital-content-consent-${TW_NOTICE_DOCUMENT.version}`
export const JP_NOTICE_VERSION_ID = `jp-tokushoho-disclosure-${JP_NOTICE_DOCUMENT.version}`
export const JP_CONSENT_VERSION_ID = `jp-refunds-consent-${JP_CONSENT_DOCUMENT.version}`

export interface CanonicalCheckoutEvidence {
  jurisdiction: ResolvedJurisdiction
  /** Locale of the exact legal copy below, not the surrounding site chrome. */
  locale: Locale
  noticeVersion: string
  consentVersion: string
  noticeHeading: string
  consentHeading: string
  noticeTextSnapshot: string
  consentTextSnapshot: string
}

/**
 * Paid-launch evidence is deliberately fixed to the reviewed jurisdiction copy:
 * Traditional Chinese for TW and Japanese for JP. This keeps locale and the
 * persisted text inseparable and prevents a caller from relabeling evidence.
 */
export function canonicalCheckoutEvidence(
  jurisdiction: ResolvedJurisdiction,
): CanonicalCheckoutEvidence {
  if (jurisdiction === 'TW') {
    return {
      jurisdiction,
      locale: 'zh-TW',
      noticeVersion: TW_NOTICE_VERSION_ID,
      consentVersion: TW_CONSENT_VERSION_ID,
      noticeHeading: TW_NOTICE_SECTION.heading,
      consentHeading: TW_CONSENT_SECTION.heading,
      noticeTextSnapshot: TW_NOTICE_SECTION.paragraphs.join('\n'),
      consentTextSnapshot: TW_CONSENT_SECTION.paragraphs.join('\n'),
    }
  }
  return {
    jurisdiction,
    locale: 'ja',
    noticeVersion: JP_NOTICE_VERSION_ID,
    consentVersion: JP_CONSENT_VERSION_ID,
    noticeHeading: JP_NOTICE_SECTION.heading,
    consentHeading: JP_CONSENT_SECTION.heading,
    noticeTextSnapshot: JP_NOTICE_SECTION.paragraphs.join('\n'),
    consentTextSnapshot: JP_CONSENT_SECTION.paragraphs.join('\n'),
  }
}
