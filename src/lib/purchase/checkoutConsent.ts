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
import {
  canonicalCheckoutEvidence,
  JP_CONSENT_VERSION_ID,
  JP_NOTICE_VERSION_ID,
  TW_CONSENT_VERSION_ID,
  TW_NOTICE_VERSION_ID,
} from '../../legal-content';
import type { ConsentSubmission, Jurisdiction, ResolvedJurisdiction } from '../payments/contract';
import { isResolvedJurisdiction } from '../payments/contract';

export {
  JP_CONSENT_VERSION_ID,
  JP_NOTICE_VERSION_ID,
  TW_CONSENT_VERSION_ID,
  TW_NOTICE_VERSION_ID,
};

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
  const evidence = canonicalCheckoutEvidence('TW');
  return {
    noticeVersion: evidence.noticeVersion,
    consentVersion: evidence.consentVersion,
    noticeText: evidence.noticeTextSnapshot,
    consentText: evidence.consentTextSnapshot,
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
  noticeHeading: string;
  consentHeading: string;
  noticeText: string;
  consentText: string;
}

export function jpConsentInfo(): JpConsentInfo {
  const evidence = canonicalCheckoutEvidence('JP');
  return {
    noticeVersion: evidence.noticeVersion,
    consentVersion: evidence.consentVersion,
    noticeHeading: evidence.noticeHeading,
    consentHeading: evidence.consentHeading,
    noticeText: evidence.noticeTextSnapshot,
    consentText: evidence.consentTextSnapshot,
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
  const evidence = canonicalCheckoutEvidence(jurisdiction);
  return {
    jurisdiction,
    locale: evidence.locale,
    presentationLocale: input.locale,
    noticeVersion: evidence.noticeVersion,
    consentVersion: evidence.consentVersion,
    consentGranted: input.consentGranted,
    noticeTextSnapshot: evidence.noticeTextSnapshot,
    consentTextSnapshot: evidence.consentTextSnapshot,
  };
}

/**
 * The JP "proceeded" consent: no explicit checkbox exists, so proceeding after
 * viewing the JP disclosures constitutes consent. Always returned for a JP
 * jurisdiction so the checkout evidence is always persisted (order_compliance).
 */
export function buildJpConsentSubmission(locale: Locale): ConsentSubmission {
  return buildConsentSubmission({ jurisdiction: 'JP', locale, consentGranted: true });
}
