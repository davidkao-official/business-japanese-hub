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
 *   - JP → the exact versioned Tokushoho + refund disclosures are rendered
 *     before any executor call. Proceeding after viewing them records the same
 *     displayed snapshots in order_compliance; no TW-style checkbox is used.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Book } from '../content/types'
import { useLocale, useStrings } from '../i18n/strings'
import { isPaidLaunchLegalReady } from '../legal-content'
import { useAuth } from '../lib/auth/AuthContext'
import { formatPrice } from '../lib/price'
import { usePurchase } from '../lib/purchase/PurchaseContext'
import type { ConsentSubmission, ResolvedJurisdiction } from '../lib/payments/contract'
import {
  buildConsentSubmission,
  buildJpConsentSubmission,
  consentRequiredFor,
  jpConsentInfo,
  twConsentInfo,
} from '../lib/purchase/checkoutConsent'
import type { CheckoutExecutor } from '../lib/purchase/executor'
import { AuthPanel } from './AuthPanel'

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

type Phase =
  | 'idle'
  | 'auth'
  | 'jurisdiction'
  | 'consent'
  | 'jp-disclosure'
  | 'pending'
  | 'unavailable'
  | 'owned'

export function PurchaseCTA({
  book,
  className = '',
  jurisdiction: jurisdictionProp,
}: PurchaseCTAProps) {
  const strings = useStrings()
  const locale = useLocale()
  const { user, loading: authLoading } = useAuth()
  const { execute } = usePurchase()
  const [declared, setDeclared] = useState<ResolvedJurisdiction | 'unresolved'>('unresolved')
  const jurisdiction = jurisdictionProp ?? declared
  const consentRequired = consentRequiredFor(jurisdiction)
  const consentInfo = consentRequired ? twConsentInfo() : null
  const jpDisclosureInfo = jurisdiction === 'JP' ? jpConsentInfo() : null

  const [phase, setPhase] = useState<Phase>('idle')
  const [ownedForUserId, setOwnedForUserId] = useState<string | null>(null)
  const [consentChecked, setConsentChecked] = useState(false)
  const [attempted, setAttempted] = useState(false)
  // In-flight latch: React batches state updates, so a `phase` guard can observe
  // a stale value and double-submit a checkout (two orders for one purchase).
  const inFlight = useRef(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const stepRef = useRef<HTMLSpanElement>(null)
  const ownedLinkRef = useRef<HTMLAnchorElement>(null)
  const restoreTrigger = useRef(false)
  // If the Edge Function rejects an expired/missing session after the buyer has
  // already viewed the disclosures, retain the exact evidence object. A
  // successful inline reauthentication retries that same immutable snapshot;
  // it never silently rebuilds compliance evidence from potentially changed
  // copy or locale state.
  const pendingConsent = useRef<ConsentSubmission | null>(null)
  // Scope `already_owned` to the identity that received it. Deriving this
  // avoids an effect-driven reset (and renders the purchase action immediately
  // when auth changes) while preserving the recovery link for the same user.
  const ownedForCurrentUser = phase === 'owned' && ownedForUserId === (user?.id ?? null)

  useEffect(() => {
    if (phase === 'jurisdiction' || phase === 'consent' || phase === 'jp-disclosure') {
      stepRef.current?.focus()
    } else if (ownedForCurrentUser) {
      ownedLinkRef.current?.focus()
    } else if (phase === 'idle' && restoreTrigger.current) {
      restoreTrigger.current = false
      triggerRef.current?.focus()
    }
  }, [phase, ownedForCurrentUser])

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
      if (!result.ok && result.reason === 'signed_out') {
        pendingConsent.current = consent
        setPhase('auth')
        return
      }
      if (!result.ok && result.reason === 'already_owned') {
        pendingConsent.current = null
        setOwnedForUserId(user?.id ?? null)
        setPhase('owned')
        return
      }
      if (result.ok) pendingConsent.current = null
      setPhase(result.ok ? 'idle' : 'unavailable')
    } catch {
      // A future executor is allowed to reject; it must degrade to
      // "unavailable" and never leave the CTA stuck in pending.
      setPhase('unavailable')
    } finally {
      inFlight.current = false
    }
  }

  const advanceToCompliance = () => {
    // Fail closed: until the buyer declares TW or JP, jurisdiction is
    // `unresolved` and checkout is blocked (no payment handoff).
    if (jurisdiction === 'unresolved') {
      setPhase('jurisdiction')
      return
    }
    if (jurisdiction === 'TW') {
      setAttempted(false)
      setPhase('consent')
      return
    }
    // JP also gates payment handoff: show the exact evidence before proceeding.
    setPhase('jp-disclosure')
  }

  const onPrimaryClick = () => {
    if (authLoading) return
    // The committed legal documents and seller disclosure are a launch gate,
    // not optional presentation. Block before auth, jurisdiction collection,
    // or checkout whenever that static bundle is still draft/incomplete; the
    // server applies the same independent gate at the authoritative boundary.
    if (!isPaidLaunchLegalReady()) {
      setPhase('unavailable')
      return
    }
    if (!user) {
      pendingConsent.current = null
      setPhase('auth')
      return
    }
    advanceToCompliance()
  }

  const onAuthenticated = () => {
    const consent = pendingConsent.current
    pendingConsent.current = null
    if (consent) {
      void beginPurchase(consent)
      return
    }
    // A buyer who authenticated before seeing compliance disclosures resumes
    // at the declaration/disclosure step, never directly at payment handoff.
    advanceToCompliance()
  }

  const onCancelAuth = () => {
    pendingConsent.current = null
    setConsentChecked(false)
    setAttempted(false)
    restoreTrigger.current = true
    setPhase('idle')
  }

  const onDeclare = (declaredJurisdiction: ResolvedJurisdiction) => {
    setDeclared(declaredJurisdiction)
    if (declaredJurisdiction === 'TW') {
      setAttempted(false)
      setPhase('consent')
      return
    }
    // Do not submit yet. The versioned JP disclosures must actually be visible
    // before a proceeded-after-disclosure evidence record can be truthful.
    setPhase('jp-disclosure')
  }

  const onCancelJurisdiction = () => {
    restoreTrigger.current = true
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

  const onConfirmJp = () => {
    if (jurisdiction !== 'JP') return
    void beginPurchase(buildJpConsentSubmission(locale))
  }

  const onCancelConsent = () => {
    setConsentChecked(false)
    setAttempted(false)
    restoreTrigger.current = true
    setPhase('idle')
  }

  const onCancelJpDisclosure = () => {
    restoreTrigger.current = true
    setPhase('idle')
  }

  const priceLabel = book.price ? formatPrice(book.price) : null
  const label = priceLabel ? `${strings.book.purchase}（${priceLabel}）` : strings.book.purchase
  const showPrimaryButton =
    phase !== 'auth' &&
    phase !== 'jurisdiction' &&
    phase !== 'consent' &&
    phase !== 'jp-disclosure' &&
    !ownedForCurrentUser

  return (
    <div className={`purchase-cta${className ? ` ${className}` : ''}`}>
      {phase === 'auth' && (
        <AuthPanel
          onAuthenticated={onAuthenticated}
          onCancel={onCancelAuth}
          showPurchaseIntro
        />
      )}

      {phase === 'jurisdiction' && (
        <span
          ref={stepRef}
          className="purchase-cta__jurisdiction"
          role="region"
          aria-label={strings.checkout.jurisdictionTitle}
          tabIndex={-1}
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

      {phase === 'consent' && consentInfo && (
        <span
          ref={stepRef}
          className="purchase-cta__consent"
          role="region"
          aria-label={strings.checkout.consentTitle}
          tabIndex={-1}
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
      )}

      {phase === 'jp-disclosure' && jpDisclosureInfo && (
        <span
          ref={stepRef}
          className="purchase-cta__consent"
          role="region"
          aria-label={jpDisclosureInfo.noticeHeading}
          tabIndex={-1}
        >
          <span className="purchase-cta__notice" role="note">
            <strong>{jpDisclosureInfo.noticeHeading}</strong>
            <span className="purchase-cta__notice-text">{jpDisclosureInfo.noticeText}</span>
          </span>
          <span className="purchase-cta__notice" role="note">
            <strong>{jpDisclosureInfo.consentHeading}</strong>
            <span className="purchase-cta__notice-text">{jpDisclosureInfo.consentText}</span>
          </span>
          <span className="purchase-cta__actions">
            <button type="button" className="btn btn--primary" onClick={onConfirmJp}>
              {strings.checkout.confirmPurchase}
            </button>
            <button type="button" className="btn btn--ghost" onClick={onCancelJpDisclosure}>
              {strings.checkout.cancel}
            </button>
          </span>
        </span>
      )}

      {showPrimaryButton && (
        <button
          ref={triggerRef}
          type="button"
          className="btn btn--primary"
          onClick={onPrimaryClick}
          disabled={phase === 'pending' || authLoading}
        >
          {phase === 'pending' || authLoading ? strings.book.pending : label}
        </button>
      )}

      {phase === 'unavailable' && (
        <span className="purchase-cta__note" role="status">
          {strings.book.purchaseUnavailable}
        </span>
      )}

      {ownedForCurrentUser && (
        <span className="purchase-cta__note" role="status">
          {strings.book.ownedLabel}{' '}
          <Link ref={ownedLinkRef} to="/library">{strings.purchaseResult.goToLibrary}</Link>
        </span>
      )}
    </div>
  )
}
