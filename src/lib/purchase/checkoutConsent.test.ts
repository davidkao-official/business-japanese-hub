import { describe, expect, it } from 'vitest'
import {
  TW_CONSENT_VERSION_ID,
  TW_NOTICE_VERSION_ID,
  buildConsentSubmission,
  consentRequiredFor,
  jurisdictionForLocale,
  twConsentInfo,
} from './checkoutConsent'
import { getStrings } from '../../i18n/strings'

describe('checkoutConsent — jurisdiction mapping', () => {
  it('maps zh-TW → TW and every other locale → JP', () => {
    expect(jurisdictionForLocale('zh-TW')).toBe('TW')
    expect(jurisdictionForLocale('ja')).toBe('JP')
    expect(jurisdictionForLocale('en')).toBe('JP')
  })
})

describe('checkoutConsent — consent-required gate', () => {
  it('requires explicit consent for TW, not for JP', () => {
    expect(consentRequiredFor('TW')).toBe(true)
    expect(consentRequiredFor('JP')).toBe(false)
  })
})

describe('checkoutConsent — ConsentSubmission building', () => {
  it('builds a TW submission with legal-content-derived versions + text snapshots', () => {
    const submission = buildConsentSubmission({ consentGranted: true, locale: 'zh-TW' })
    expect(submission.jurisdiction).toBe('TW')
    expect(submission.locale).toBe('zh-TW')
    expect(submission.consentGranted).toBe(true)
    expect(submission.noticeVersion).toBe(TW_NOTICE_VERSION_ID)
    expect(submission.consentVersion).toBe(TW_CONSENT_VERSION_ID)
    expect(submission.noticeVersion).toMatch(/^tw-7day-removal-notice-v\d+$/)
    expect(submission.consentVersion).toMatch(/^tw-digital-content-consent-v\d+$/)
    expect(submission.noticeTextSnapshot.length).toBeGreaterThan(0)
    expect(submission.consentTextSnapshot).toBe(getStrings('zh-TW').checkout.consentLabel)
  })

  it('carries consentGranted=false verbatim (the executor gates on it)', () => {
    const submission = buildConsentSubmission({ consentGranted: false, locale: 'zh-TW' })
    expect(submission.consentGranted).toBe(false)
  })

  it('honors an explicit jurisdiction override and pins the zh-TW text for TW', () => {
    const submission = buildConsentSubmission({
      consentGranted: true,
      locale: 'ja',
      jurisdiction: 'TW',
    })
    expect(submission.jurisdiction).toBe('TW')
    expect(submission.locale).toBe('zh-TW')
    expect(submission.consentTextSnapshot).toBe(getStrings('zh-TW').checkout.consentLabel)
  })

  it('derives the notice/consent text from the versioned legal content', () => {
    const info = twConsentInfo()
    expect(info.noticeText).toContain('7 日解除權')
    expect(info.noticeText).toContain('立即提供')
    expect(info.consentText).toBe(getStrings('zh-TW').checkout.consentLabel)
  })
})
