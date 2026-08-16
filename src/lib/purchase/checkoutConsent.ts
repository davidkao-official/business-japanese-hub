/**
 * Checkout compliance consent (#25 consent flow, B2).
 *
 * Pure helpers for the consumer-jurisdiction declaration + consent step:
 * jurisdiction is an EXPLICIT consumer self-declaration (TW / JP), never derived
 * from the UI locale — locale is presentation-only. The fail-closed gates are
 * the TW pre-delivery consent requirement, and building the `ConsentSubmission`
 * that the checkout Edge Function persists server-side as `order_compliance`
 * evidence.
 *
 * Fail-closed by design (docs/legal-tax-launch-brief.md §4.1/§5): TW consumers
 * must give explicit prior consent to the immediate provision/download of
 * digital content, or the statutory 7-day right of withdrawal is NOT excluded.
 * An unresolved jurisdiction (no declaration) fails closed before any payment
 * handoff. The executor refuses checkout unless an explicit granted consent
 * accompanies a TW submission — the CTA checkbox is the UX gate, this gate is
 * the defense-in-depth guarantee.
 *
 * The notice/consent TEXT snapshots and VERSION ids are derived from the
 * versioned legal-content module (B1) so the persisted evidence always
 * references the exact text that was displayed.
 */
import type { Locale } from '../../i18n/strings';
import { requireLegalDocumentBySlug } from '../../legal-content';
import type { LegalDocument, LegalSection } from '../../legal-content';
import type { ConsentSubmission, Jurisdiction, ResolvedJurisdiction } from '../payments/contract';
import { isResolvedJurisdiction } from '../payments/contract';

/** The UI locale a TW buyer sees — the consent texts are fixed to zh-TW. */
const TW_LOCALE: Locale = 'zh-TW';

/** Stable machine ids on the versioned legal sections used as checkout evidence. */
const TW_WITHDRAWAL_NOTICE_SECTION_ID = 'tw-withdrawal-notice';
const TW_IMMEDIATE_DELIVERY_CONSENT_SECTION_ID = 'tw-immediate-delivery-consent';
const JP_TOKUSHOHO_NOTICE_SECTION_ID = 'jp-tokushoho-seller-disclosure';
const JP_REFUNDS_ACK_SECTION_ID = 'jp-refunds-acknowledgement';

function requireEvidenceSection(
  document: LegalDocument,
  locale: Locale,
  sectionId: string,
  evidenceName: string,
): LegalSection {
  const section = document.bodies[locale]?.find((candidate) => candidate.id === sectionId);
  const paragraphs = section?.paragraphs;
  if (
    !section ||
    !section.heading.trim() ||
    !paragraphs ||
    paragraphs.length === 0 ||
    paragraphs.some((paragraph) => !paragraph.trim())
  ) {
    throw new Error(
      `Required legal evidence is unavailable or malformed: ${document.slug}/${locale}/${evidenceName}`,
    );
  }
  return section;
}

/** Versioned legal documents carrying the jurisdiction-specific disclosures. */
const TW_NOTICE_DOCUMENT = requireLegalDocumentBySlug('refunds');
const JP_NOTICE_DOCUMENT = requireLegalDocumentBySlug('tokushoho');
const JP_CONSENT_DOCUMENT = requireLegalDocumentBySlug('refunds');

/** Required sections are selected by stable ids and validated. No text/index fallback exists. */
const TW_NOTICE_SECTION = requireEvidenceSection(
  TW_NOTICE_DOCUMENT,
  TW_LOCALE,
  TW_WITHDRAWAL_NOTICE_SECTION_ID,
  'tw-withdrawal-notice',
);
const TW_CONSENT_SECTION = requireEvidenceSection(
  TW_NOTICE_DOCUMENT,
  TW_LOCALE,
  TW_IMMEDIATE_DELIVERY_CONSENT_SECTION_ID,
  'tw-immediate-delivery-consent',
);
const JP_NOTICE_SECTION = requireEvidenceSection(
  JP_NOTICE_DOCUMENT,
  'ja',
  JP_TOKUSHOHO_NOTICE_SECTION_ID,
  'jp-tokushoho-notice',
);
const JP_CONSENT_SECTION = requireEvidenceSection(
  JP_CONSENT_DOCUMENT,
  'ja',
  JP_REFUNDS_ACK_SECTION_ID,
  'jp-refunds-acknowledgement',
);

/** Stable version ids persisted as `order_compliance` evidence (contract shape: "<jur>-...-vN"). */
export const TW_NOTICE_VERSION_ID = `tw-7day-removal-notice-${TW_NOTICE_DOCUMENT.version}`;
export const TW_CONSENT_VERSION_ID = `tw-digital-content-consent-${TW_NOTICE_DOCUMENT.version}`;
export const JP_NOTICE_VERSION_ID = `jp-tokushoho-disclosure-${JP_NOTICE_DOCUMENT.version}`;
export const JP_CONSENT_VERSION_ID = `jp-refunds-consent-${JP_CONSENT_DOCUMENT.version}`;

/**
 * Jurisdiction is NEVER derived from the UI locale (presentation-only) — it is
 * an explicit consumer self-declaration. `isResolvedJurisdiction` distinguishes
 * a declared TW/JP jurisdiction from `unresolved` (fail closed).
 */
export { isResolvedJurisdiction };

/** TW requires explicit prior consent; JP proceeds after disclosure. */
export function consentRequiredFor(jurisdiction: Jurisdiction): boolean {
  return jurisdiction === 'TW';
}

/** The notice/consent text + version pair actually shown at checkout (TW). */
export interface TwConsentInfo {
  noticeVersion: string;
  consentVersion: string;
  noticeText: string;
  consentText: string;
}

/**
 * The exact TW pre-delivery notice and consent statement shown by PurchaseCTA.
 * Both are stable-id sections of the same versioned refunds document, so the
 * stored version ids and text snapshots have one authoritative source.
 */
export function twConsentInfo(): TwConsentInfo {
  return {
    noticeVersion: TW_NOTICE_VERSION_ID,
    consentVersion: TW_CONSENT_VERSION_ID,
    noticeText: TW_NOTICE_SECTION.paragraphs.join('\n'),
    consentText: TW_CONSENT_SECTION.paragraphs.join('\n'),
  };
}

/**
 * The exact JP pre-sale disclosures: the 特定商取引法 disclosure (notice) and the
 * refund/returns policy (consent acknowledgment). JP has no 7-day waiver checkbox;
 * proceeding after viewing these disclosures is the consent (consentGranted: true).
 * Both snapshots come from stable-id, validated versioned legal sections.
 */
export interface JpConsentInfo {
  noticeVersion: string;
  consentVersion: string;
  noticeText: string;
  consentText: string;
}

export function jpConsentInfo(): JpConsentInfo {
  return {
    noticeVersion: JP_NOTICE_VERSION_ID,
    consentVersion: JP_CONSENT_VERSION_ID,
    noticeText: JP_NOTICE_SECTION.paragraphs.join('\n'),
    consentText: JP_CONSENT_SECTION.paragraphs.join('\n'),
  };
}

export interface BuildConsentSubmissionInput {
  /** True only when the user explicitly checked the prior-consent box. */
  consentGranted: boolean;
  /** The UI locale; presentation-only, never the jurisdiction source. */
  locale: Locale;
  /** The declared consumer jurisdiction — REQUIRED (never derived from locale). */
  jurisdiction: ResolvedJurisdiction;
}

/**
 * Build the `ConsentSubmission` the executor submits to checkout. The declared
 * jurisdiction is the only jurisdiction source (locale is presentation-only).
 * The notice/consent text snapshots and version ids come from legal-content so
 * the persisted evidence matches what was shown. `consentGranted` is carried
 * verbatim — the executor refuses when it is false (fail closed). JP uses the
 * JP disclosure set (consentGranted true = proceeded after viewing).
 */
export function buildConsentSubmission(input: BuildConsentSubmissionInput): ConsentSubmission {
  const { jurisdiction } = input;
  // A TW submission always corresponds to the zh-TW interface text.
  const submissionLocale: Locale = jurisdiction === 'TW' ? TW_LOCALE : input.locale;
  const info = jurisdiction === 'TW' ? twConsentInfo() : jpConsentInfo();
  return {
    jurisdiction,
    locale: submissionLocale,
    noticeVersion: info.noticeVersion,
    consentVersion: info.consentVersion,
    consentGranted: input.consentGranted,
    noticeTextSnapshot: info.noticeText,
    consentTextSnapshot: info.consentText,
  };
}

/**
 * The JP "proceeded" consent: no explicit checkbox exists, so proceeding after
 * viewing the JP disclosures constitutes consent. Always returned for a JP
 * jurisdiction so the checkout evidence is always persisted (order_compliance).
 */
export function buildJpConsentSubmission(locale: Locale): ConsentSubmission {
  const info = jpConsentInfo();
  return {
    jurisdiction: 'JP',
    locale,
    noticeVersion: info.noticeVersion,
    consentVersion: info.consentVersion,
    consentGranted: true,
    noticeTextSnapshot: info.noticeText,
    consentTextSnapshot: info.consentText,
  };
}
