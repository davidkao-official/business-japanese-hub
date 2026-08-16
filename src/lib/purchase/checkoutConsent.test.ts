import { describe, expect, it } from 'vitest'
import {
  JP_CONSENT_VERSION_ID,
  JP_NOTICE_VERSION_ID,
  TW_CONSENT_VERSION_ID,
  TW_NOTICE_VERSION_ID,
  buildConsentSubmission,
  consentRequiredFor,
  isResolvedJurisdiction,
  jpConsentInfo,
  twConsentInfo,
} from './checkoutConsent'
import { REFUNDS_DOCUMENT, TOKUSHOHO_DOCUMENT } from '../../legal-content/documents'

function requireSection(
  sections: typeof REFUNDS_DOCUMENT.bodies.ja,
  id: string,
) {
  const section = sections.find((candidate) => candidate.id === id)
  expect(section, `missing legal section ${id}`).toBeDefined()
  return section!
}

describe('checkoutConsent — jurisdiction is an explicit declaration, never locale-derived', () => {
  it('treats TW/JP as resolved and anything else as unresolved (fail closed)', () => {
    expect(isResolvedJurisdiction('TW')).toBe(true)
    expect(isResolvedJurisdiction('JP')).toBe(true)
    expect(isResolvedJurisdiction('unresolved')).toBe(false)
  })

  it('requires explicit consent for TW, not for JP', () => {
    expect(consentRequiredFor('TW')).toBe(true)
    expect(consentRequiredFor('JP')).toBe(false)
  })
})

describe('checkoutConsent — legal evidence is backed by actual versioned content', () => {
  it('pins TW notice and consent to stable-id sections of the real refunds version', () => {
    const info = twConsentInfo()
    const noticeSection = requireSection(REFUNDS_DOCUMENT.bodies['zh-TW'], 'tw-withdrawal-notice')
    const consentSection = requireSection(
      REFUNDS_DOCUMENT.bodies['zh-TW'],
      'tw-immediate-delivery-consent',
    )

    expect(TW_NOTICE_VERSION_ID).toBe(`tw-7day-removal-notice-${REFUNDS_DOCUMENT.version}`)
    expect(TW_CONSENT_VERSION_ID).toBe(`tw-digital-content-consent-${REFUNDS_DOCUMENT.version}`)
    expect(info.noticeVersion).toBe(TW_NOTICE_VERSION_ID)
    expect(info.consentVersion).toBe(TW_CONSENT_VERSION_ID)
    expect(info.noticeText).toBe(noticeSection.paragraphs.join('\n'))
    expect(info.consentText).toBe(consentSection.paragraphs.join('\n'))
    expect(info.noticeText).toContain('立即提供')
    expect(info.consentText).toContain('同意立即提供')
  })

  it('pins JP evidence to stable-id sections of the real Tokushoho/refunds versions', () => {
    const info = jpConsentInfo()
    const noticeSection = requireSection(
      TOKUSHOHO_DOCUMENT.bodies.ja,
      'jp-tokushoho-seller-disclosure',
    )
    const consentSection = requireSection(
      REFUNDS_DOCUMENT.bodies.ja,
      'jp-refunds-acknowledgement',
    )

    expect(JP_NOTICE_VERSION_ID).toBe(`jp-tokushoho-disclosure-${TOKUSHOHO_DOCUMENT.version}`)
    expect(JP_CONSENT_VERSION_ID).toBe(`jp-refunds-consent-${REFUNDS_DOCUMENT.version}`)
    expect(info.noticeText).toBe(noticeSection.paragraphs.join('\n'))
    expect(info.consentText).toBe(consentSection.paragraphs.join('\n'))
  })
})

describe('checkoutConsent — ConsentSubmission building (explicit jurisdiction)', () => {
  it('builds a TW submission with legal-content-derived versions + text snapshots', () => {
    const submission = buildConsentSubmission({ consentGranted: true, locale: 'zh-TW', jurisdiction: 'TW' })
    const noticeSection = requireSection(REFUNDS_DOCUMENT.bodies['zh-TW'], 'tw-withdrawal-notice')
    const consentSection = requireSection(
      REFUNDS_DOCUMENT.bodies['zh-TW'],
      'tw-immediate-delivery-consent',
    )

    expect(submission.jurisdiction).toBe('TW')
    expect(submission.locale).toBe('zh-TW')
    expect(submission.consentGranted).toBe(true)
    expect(submission.noticeVersion).toBe(TW_NOTICE_VERSION_ID)
    expect(submission.consentVersion).toBe(TW_CONSENT_VERSION_ID)
    expect(submission.noticeVersion).toMatch(/^tw-7day-removal-notice-v\d+$/)
    expect(submission.consentVersion).toMatch(/^tw-digital-content-consent-v\d+$/)
    expect(submission.noticeTextSnapshot).toBe(noticeSection.paragraphs.join('\n'))
    expect(submission.consentTextSnapshot).toBe(consentSection.paragraphs.join('\n'))
  })

  it('carries consentGranted=false verbatim (the executor gates on it)', () => {
    const submission = buildConsentSubmission({ consentGranted: false, locale: 'zh-TW', jurisdiction: 'TW' })
    expect(submission.consentGranted).toBe(false)
  })

  it('ja locale + TW declaration is still TW (locale never determines jurisdiction)', () => {
    const submission = buildConsentSubmission({ consentGranted: true, locale: 'ja', jurisdiction: 'TW' })
    const consentSection = requireSection(
      REFUNDS_DOCUMENT.bodies['zh-TW'],
      'tw-immediate-delivery-consent',
    )

    expect(submission.jurisdiction).toBe('TW')
    // The TW evidence text is pinned to zh-TW regardless of the UI locale.
    expect(submission.locale).toBe('zh-TW')
    expect(submission.consentTextSnapshot).toBe(consentSection.paragraphs.join('\n'))
  })

  it('zh-TW locale + JP declaration stays JP (does not become TW)', () => {
    const submission = buildConsentSubmission({ consentGranted: true, locale: 'zh-TW', jurisdiction: 'JP' })
    const jpConsentSection = requireSection(
      REFUNDS_DOCUMENT.bodies.ja,
      'jp-refunds-acknowledgement',
    )

    expect(submission.jurisdiction).toBe('JP')
    // A JP declaration never switches to TW evidence even from a zh-TW UI.
    expect(submission.locale).toBe('zh-TW')
    expect(submission.consentTextSnapshot).toBe(jpConsentSection.paragraphs.join('\n'))
  })
})
