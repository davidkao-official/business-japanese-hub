/**
 * PurchaseCTA — the 購入する button, isolated behind the provider-neutral
 * purchase seam (src/lib/purchase). #9 wires the real checkout executor; this
 * component adds the TW pre-delivery consent step (#25, legal-tax-launch-brief
 * §4.1/§5): for a TW jurisdiction the buyer sees the 7-day right-of-withdrawal
 * exclusion notice and must explicitly check the prior-consent box before the
 * executor is called — unchecked submission is blocked (fail closed; the
 * executor's `consent_required` gate is the defense-in-depth guarantee).
 */

import { useState } from 'react'
import type { Book } from '../content/types'
import { useLocale, useStrings } from '../i18n/strings'
import { formatPrice } from '../lib/price'
import { usePurchase } from '../lib/purchase/PurchaseContext'
import type { ConsentSubmission, Jurisdiction } from '../lib/payments/contract'
import {
  buildConsentSubmission,
  buildJpConsentSubmission,
  consentRequiredFor,
  jurisdictionForLocale,
  twConsentInfo,
} from '../lib/purchase/checkoutConsent'
import type { CheckoutExecutor } from '../lib/purchase/executor'

export interface PurchaseCTAProps {
  book: Book
  className?: string
  /** Effective jurisdiction; defaults to `jurisdictionForLocale(useLocale())`. */
  jurisdiction?: Jurisdiction
}

type Phase = 'idle' | 'consent' | 'pending' | 'unavailable'

export function PurchaseCTA({
  book,
  className = '',
  jurisdiction: jurisdictionProp,
}: PurchaseCTAProps) {
  const strings = useStrings()
  const locale = useLocale()
  const { execute } = usePurchase()
  const jurisdiction = jurisdictionProp ?? jurisdictionForLocale(locale)
  const consentRequired = consentRequiredFor(jurisdiction)
  const consentInfo = consentRequired ? twConsentInfo() : null

  const [phase, setPhase] = useState<Phase>('idle')
  const [consentChecked, setConsentChecked] = useState(false)
  const [attempted, setAttempted] = useState(false)

  const beginPurchase = async (consent: ConsentSubmission | null) => {
    if (phase === 'pending') return
    setPhase('pending')
    try {
      // The #9 executor accepts an optional consent as its second argument.
      // The locked `PurchaseExecutor` seam only types the intent, so widen the
      // injected `execute` to the checkout signature here. Client sends only
      // bookId + consent — amount/currency are never client-supplied.
      const submit: CheckoutExecutor = execute
      const result = await submit({ bookId: book.id }, consent)
      setPhase(result.ok ? 'idle' : 'unavailable')
    } catch {
      // A future executor is allowed to reject; it must degrade to
      // "unavailable" and never leave the CTA stuck in pending.
      setPhase('unavailable')
    }
  }

  const onPrimaryClick = () => {
    if (consentRequired) {
      setAttempted(false)
      setPhase('consent')
      return
    }
    // JP has no consent checkbox; proceeding after viewing the JP disclosures
    // is the consent (buildJpConsentSubmission carries consentGranted: true).
    void beginPurchase(buildJpConsentSubmission(locale))
  }

  const onConfirm = () => {
    // Fail closed: submission is blocked until the checkbox is explicitly checked.
    if (!consentChecked) {
      setAttempted(true)
      return
    }
    setAttempted(false)
    const consent = buildConsentSubmission({ consentGranted: true, locale, jurisdiction })
    void beginPurchase(consent)
  }

  const onCancelConsent = () => {
    setConsentChecked(false)
    setAttempted(false)
    setPhase('idle')
  }

  const priceLabel = book.price ? formatPrice(book.price) : null
  const label = priceLabel ? `${strings.book.purchase}（${priceLabel}）` : strings.book.purchase

  return (
    <span className={`purchase-cta${className ? ` ${className}` : ''}`}>
      {phase === 'consent' && consentInfo ? (
        <span
          className="purchase-cta__consent"
          role="region"
          aria-label={strings.checkout.consentTitle}
        >
          <span className="purchase-cta__notice" role="note">
            <strong>{strings.checkout.waiverNoticeLabel}</strong>
            <span className="purchase-cta__notice-text">{consentInfo.noticeText}</span>
          </span>
          <label className="purchase-cta__consent-label">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(event) => setConsentChecked(event.target.checked)}
            />
            {consentInfo.consentText}
          </label>
          {attempted && !consentChecked && (
            <span className="purchase-cta__note" role="alert">
              {strings.checkout.consentRequiredHint}
            </span>
          )}
          <span className="purchase-cta__actions">
            <button type="button" className="btn btn--primary" onClick={onConfirm}>
              {strings.checkout.confirmPurchase}
            </button>
            <button type="button" className="btn btn--ghost" onClick={onCancelConsent}>
              {strings.checkout.cancel}
            </button>
          </span>
        </span>
      ) : (
        <button
          type="button"
          className="btn btn--primary"
          onClick={onPrimaryClick}
          disabled={phase === 'pending'}
        >
          {phase === 'pending' ? strings.book.pending : label}
        </button>
      )}
      {phase === 'unavailable' && (
        <span className="purchase-cta__note" role="status">
          {strings.book.purchaseUnavailable}
        </span>
      )}
    </span>
  )
}
