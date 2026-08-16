/**
 * PurchaseCTA — the 購入する button, isolated behind the provider-neutral
 * purchase seam (src/lib/purchase). #9 wires the real checkout executor; this
 * component owns the consumer-jurisdiction declaration + consent steps (#25,
 * legal-tax-launch-brief §4.1/§5).
 *
 * Jurisdiction is an EXPLICIT consumer self-declaration (TW / JP) — it is NEVER
 * derived from the UI locale (presentation-only). The first click asks the buyer
 * to declare their consumer location; until a declaration is made the
 * jurisdiction is `unresolved` and checkout is blocked (fail closed). After
 * declaration:
 *   - TW → the 7-day right-of-withdrawal exclusion notice + a mandatory prior
 *     consent checkbox before the executor is called — unchecked submission is
 *     blocked (the executor's `consent_required` gate is defense in depth);
 *   - JP → proceeds after viewing the JP disclosures (the executor receives a
 *     JP proceeded-after-disclosure ConsentSubmission so the server persists
 *     order_compliance evidence). The server additionally applies the
 *     authoritative Japan tax-status gate.
 */
import { useRef, useState } from 'react'
import type { Book } from '../content/types'
import { useLocale, useStrings } from '../i18n/strings'
import { formatPrice } from '../lib/price'
import { usePurchase } from '../lib/purchase/PurchaseContext'
import type { ConsentSubmission, ResolvedJurisdiction } from '../lib/payments/contract'
import {
  buildConsentSubmission,
  buildJpConsentSubmission,
  consentRequiredFor,
  twConsentInfo,
} from '../lib/purchase/checkoutConsent'
import type { CheckoutExecutor } from '../lib/purchase/executor'

export interface PurchaseCTAProps {
  book: Book
  className?: string
  /**
   * Declared consumer jurisdiction; when provided, the declaration step is
   * skipped (tests / callers that already resolved jurisdiction). Never derived
   * from locale.
   */
  jurisdiction?: ResolvedJurisdiction
}

type Phase = 'idle' | 'jurisdiction' | 'consent' | 'pending' | 'unavailable'

export function PurchaseCTA({
  book,
  className = '',
  jurisdiction: jurisdictionProp,
}: PurchaseCTAProps) {
  const strings = useStrings()
  const locale = useLocale()
  const { execute } = usePurchase()
  const [declared, setDeclared] = useState<ResolvedJurisdiction | 'unresolved'>('unresolved')
  const jurisdiction = jurisdictionProp ?? declared
  const consentRequired = consentRequiredFor(jurisdiction)
  const consentInfo = consentRequired ? twConsentInfo() : null

  const [phase, setPhase] = useState<Phase>('idle')
  const [consentChecked, setConsentChecked] = useState(false)
  const [attempted, setAttempted] = useState(false)
  // In-flight latch: React batches state updates, so a `phase` guard can observe
  // a stale value and double-submit a checkout (two orders for one purchase).
  const inFlight = useRef(false)

  const beginPurchase = async (consent: ConsentSubmission | null) => {
    if (inFlight.current) return
    inFlight.current = true
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
    } finally {
      inFlight.current = false
    }
  }

  const onPrimaryClick = () => {
    // Fail closed: until the buyer declares TW or JP, jurisdiction is
    // `unresolved` and checkout is blocked (no payment handoff).
    if (jurisdiction === 'unresolved') {
      setPhase('jurisdiction')
      return
    }
    if (consentRequiredFor(jurisdiction)) {
      setAttempted(false)
      setPhase('consent')
      return
    }
    // JP has no consent checkbox; proceeding after viewing the JP disclosures
    // is the consent (buildJpConsentSubmission carries consentGranted: true).
    void beginPurchase(buildJpConsentSubmission(locale))
  }

  const onDeclare = (declaredJurisdiction: ResolvedJurisdiction) => {
    setDeclared(declaredJurisdiction)
    if (declaredJurisdiction === 'TW') {
      setAttempted(false)
      setPhase('consent')
      return
    }
    // JP proceeds after disclosure (server enforces the authoritative tax gate).
    void beginPurchase(buildJpConsentSubmission(locale))
  }

  const onCancelJurisdiction = () => {
    setPhase('idle')
  }

  const onConfirm = () => {
    // Fail closed: submission is blocked until the checkbox is explicitly checked.
    if (!consentChecked) {
      setAttempted(true)
      return
    }
    // The consent step only renders for a TW declaration; narrow the union so
    // the evidence is always built for the declared TW jurisdiction.
    if (jurisdiction !== 'TW') return
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
      {phase === 'jurisdiction' && (
        <span
          className="purchase-cta__jurisdiction"
          role="region"
          aria-label={strings.checkout.jurisdictionTitle}
        >
          <strong>{strings.checkout.jurisdictionTitle}</strong>
          <span className="purchase-cta__notice-text">{strings.checkout.jurisdictionNote}</span>
          <span className="purchase-cta__actions">
            <button type="button" className="btn" onClick={() => onDeclare('TW')}>
              {strings.checkout.jurisdictionTW}
            </button>
            <button type="button" className="btn" onClick={() => onDeclare('JP')}>
              {strings.checkout.jurisdictionJP}
            </button>
            <button type="button" className="btn btn--ghost" onClick={onCancelJurisdiction}>
              {strings.checkout.cancel}
            </button>
          </span>
        </span>
      )}
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
            {/* The consent UI is unmounted once phase becomes pending, so the
                in-flight ref latch is the duplicate-submit guard. */}
            <button type="button" className="btn btn--primary" onClick={onConfirm}>
              {strings.checkout.confirmPurchase}
            </button>
            <button type="button" className="btn btn--ghost" onClick={onCancelConsent}>
              {strings.checkout.cancel}
            </button>
          </span>
        </span>
      ) : (
        phase !== 'jurisdiction' && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={onPrimaryClick}
            disabled={phase === 'pending'}
          >
            {phase === 'pending' ? strings.book.pending : label}
          </button>
        )
      )}
      {phase === 'unavailable' && (
        <span className="purchase-cta__note" role="status">
          {strings.book.purchaseUnavailable}
        </span>
      )}
    </span>
  )
}
