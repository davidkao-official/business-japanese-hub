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
import { getStrings } from '../../i18n/strings';
import { getLegalDocumentBySlug } from '../../legal-content';
import type { ConsentSubmission, Jurisdiction, ResolvedJurisdiction } from '../payments/contract';
import { isResolvedJurisdiction } from '../payments/contract';

/** The UI locale a TW buyer sees — the consent texts are fixed to zh-TW. */
const TW_LOCALE: Locale = 'zh-TW';

/** Versioned legal documents carrying the jurisdiction-specific disclosures. */
const TW_NOTICE_DOCUMENT = getLegalDocumentBySlug('refunds');
const JP_NOTICE_DOCUMENT = getLegalDocumentBySlug('tokushoho');
const JP_CONSENT_DOCUMENT = getLegalDocumentBySlug('refunds');

/** Stable version ids persisted as `order_compliance` evidence (contract shape: "<jur>-...-v1"). */
export const TW_NOTICE_VERSION_ID = `tw-7day-removal-notice-${TW_NOTICE_DOCUMENT?.version ?? 'v1'}`;
export const TW_CONSENT_VERSION_ID = `tw-digital-content-consent-${TW_NOTICE_DOCUMENT?.version ?? 'v1'}`;
export const JP_NOTICE_VERSION_ID = `jp-tokushoho-disclosure-${JP_NOTICE_DOCUMENT?.version ?? 'v1'}`;
export const JP_CONSENT_VERSION_ID = `jp-refunds-consent-${JP_CONSENT_DOCUMENT?.version ?? 'v1'}`;

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
 * The exact TW pre-delivery notice text (the 7-day right-of-withdrawal
 * exclusion) and the consent label, both derived from the versioned legal
 * content. `noticeText` is taken from the refunds document's zh-TW
 * "7 日解除權" section; `consentText` is the localized consent checkbox label.
 */
export function twConsentInfo(): TwConsentInfo {
  const body = TW_NOTICE_DOCUMENT?.bodies[TW_LOCALE] ?? [];
  const noticeSection = body.find((section) => section.heading.includes('7 日解除權'));
  const noticeText =
    noticeSection?.paragraphs.join('\n') ??
    body[0]?.paragraphs[0] ??
    'デジタルコンテンツの即時提供により、7日間のクーリング・オフが適用されない場合があります。';
  return {
    noticeVersion: TW_NOTICE_VERSION_ID,
    consentVersion: TW_CONSENT_VERSION_ID,
    noticeText,
    consentText: getStrings(TW_LOCALE).checkout.consentLabel,
  };
}

/**
 * The exact JP pre-sale disclosures: the 特定商取引法 disclosure (notice) and the
 * refund/returns policy (consent acknowledgment). JP has no 7-day waiver checkbox;
 * proceeding after viewing these disclosures is the consent (consentGranted: true).
 * Both text snapshots come from the versioned legal content so the persisted
 * evidence references the exact displayed text.
 */
export interface JpConsentInfo {
  noticeVersion: string;
  consentVersion: string;
  noticeText: string;
  consentText: string;
}

export function jpConsentInfo(): JpConsentInfo {
  const notice = JP_NOTICE_DOCUMENT?.bodies['ja'] ?? [];
  const consent = JP_CONSENT_DOCUMENT?.bodies['ja'] ?? [];
  return {
    noticeVersion: JP_NOTICE_VERSION_ID,
    consentVersion: JP_CONSENT_VERSION_ID,
    noticeText: notice[0]?.paragraphs.join('\n') ?? '特定商取引法に基づく表示',
    consentText: consent[0]?.paragraphs.join('\n') ?? '返品・返金ポリシー',
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
