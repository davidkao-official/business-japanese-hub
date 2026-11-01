import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@business-japanese-hub/platform-auth'
import { AuthPanel } from '../components/AuthPanel'
import { PlusAccessBoundary } from '../components/PlusAccessBoundary'
import { useLocale, useStrings } from '../i18n/strings'
import { cancelPlusMembership, type PlusCancelResult } from '../lib/membership/cancel'
import {
  fetchPlusCheckoutOpen,
  startPlusCheckout,
  submitHostedCheckout,
} from '../lib/membership/checkout'
import { useMembershipAccess } from '../lib/membership/MembershipAccessContext'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { PRODUCT_MODES } from './productModes'

export function PlusPage() {
  const locale = useLocale()
  const strings = useStrings()
  const plus = strings.plus
  useDocumentTitle(`${strings.app.name} Plus`)

  return (
    <section className="page plus-page" aria-labelledby="plus-title">
      <div className="plus-hero">
        <p className="plus-page__eyebrow">{plus.eyebrow}</p>
        <h1 className="page__title" id="plus-title">
          Business Japanese Hub Plus
        </h1>
        <p className="page__lead">{plus.lead}</p>

        <div className="plus-price" aria-label={`${plus.priceLabel} ${plus.priceAmount} ${plus.pricePeriod}`}>
          <p className="plus-price__label">{plus.priceLabel}</p>
          <p className="plus-price__amount">
            <span className="price">{plus.priceAmount}</span>
            <span className="plus-price__period">{plus.pricePeriod}</span>
          </p>
          <p className="plus-price__disclosure">{plus.priceDisclosure}</p>
        </div>
      </div>

      <section className="plus-availability" aria-labelledby="plus-availability-title">
        <div>
          <p className="plus-page__eyebrow">{plus.priceLabel}</p>
          <h2 id="plus-availability-title">{plus.availabilityTitle}</h2>
        </div>
        <p>{plus.availabilityBody}</p>
        <PlusCheckoutPanel />
        <PlusCancelPanel />
      </section>

      <section className="plus-audience" aria-labelledby="plus-audience-title">
        <div>
          <h2 id="plus-audience-title">{plus.audienceTitle}</h2>
          <p>{plus.audienceBody}</p>
        </div>
        <div className="plus-journey">
          <h3>{plus.journeyTitle}</h3>
          <ol>
            {plus.journeySteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </section>

      <section className="plus-value" aria-labelledby="plus-value-title">
        <h2 id="plus-value-title">{plus.valueTitle}</h2>
        <div className="plus-value__grid">
          <article>
            <p className="plus-value__label" lang="en">
              {plus.freeTitle}
            </p>
            <p>{plus.freeBody}</p>
          </article>
          <article>
            <p className="plus-value__label" lang="en">
              {plus.plusTitle}
            </p>
            <p>{plus.plusBody}</p>
          </article>
        </div>
        <div className="plus-value__learning-system">
          <h3>{plus.learningSystemTitle}</h3>
          <p>{plus.learningSystemBody}</p>
        </div>
      </section>

      <PlusAccessBoundary access="public">
        <nav className="plus-free-links" aria-label={strings.learningModes.navigationLabel}>
          {PRODUCT_MODES.map((mode) => (
            <Link key={mode.id} to={mode.href}>
              <span lang={strings.learningModes.modes[mode.id].title === mode.label ? 'en' : locale}>{strings.learningModes.modes[mode.id].title}</span>
              <span>{strings.learningModes.modes[mode.id].summary}</span>
            </Link>
          ))}
        </nav>
      </PlusAccessBoundary>

      <section className="plus-membership" aria-labelledby="plus-membership-title">
        <div className="plus-membership__intro">
          <h2 id="plus-membership-title">{plus.accessTitle}</h2>
          <p>{plus.accessBody}</p>
        </div>
        <PlusAccessBoundary
          preview={<PlusSurfaceList title={plus.previewTitle} body={plus.previewBody} />}
        >
          <PlusSurfaceList title={plus.plusTitle} body={plus.plusBody} />
        </PlusAccessBoundary>
      </section>
    </section>
  )
}

/**
 * Plus checkout call to action. It stays absent unless the server reports the
 * checkout gate open, so production is unchanged while the gate is shut.
 */
const PAYMENT_RECHECK_LIMIT = 12
const PAYMENT_RECHECK_MS = 5000

function PlusCheckoutPanel() {
  const checkout = useStrings().plus.checkout
  const { state, retry } = useMembershipAccess()
  const { getAccessToken } = useAuth()
  const location = useLocation()
  const returned = new URLSearchParams(location.search).get('checkout') === 'returned'
  const [consentRevision, setConsentRevision] = useState<string | null>(null)
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [closed, setClosed] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchPlusCheckoutOpen().then((value) => {
      if (!cancelled) setConsentRevision(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // After ECPay, re-check access a bounded number of times. The next check is
  // scheduled only once the previous lookup has answered, so a slow lookup is
  // never cancelled by the following retry.
  const [recheckCount, setRecheckCount] = useState(0)
  const awaitingPaymentResult = returned && state.kind !== 'active-member' &&
    state.kind !== 'signed-out' && recheckCount < PAYMENT_RECHECK_LIMIT
  useEffect(() => {
    if (!awaitingPaymentResult || state.kind === 'checking') return
    const timer = setTimeout(() => {
      setRecheckCount((count) => count + 1)
      retry()
    }, PAYMENT_RECHECK_MS)
    return () => clearTimeout(timer)
  }, [awaitingPaymentResult, state.kind, retry])

  if (!consentRevision) return null

  if (state.kind === 'signed-out') {
    return (
      <div className="plus-checkout">
        <p>{checkout.signInPrompt}</p>
        <AuthPanel />
      </div>
    )
  }

  if (awaitingPaymentResult) {
    return (
      <div className="plus-checkout">
        <h3>{checkout.returnedTitle}</h3>
        <p>{checkout.returnedBody}</p>
      </div>
    )
  }

  if (state.kind === 'active-member') {
    return <p className="plus-checkout">{checkout.alreadyMember}</p>
  }

  if (state.kind !== 'non-member') return null

  const start = async () => {
    if (busy) return
    setBusy(true)
    setClosed(false)
    setFailed(false)
    const result = await startPlusCheckout(getAccessToken, consentRevision)
    if (result.kind === 'redirect') {
      submitHostedCheckout(result.action, result.fields)
    } else if (result.kind === 'already-member') {
      retry()
    } else if (result.kind === 'closed') {
      setClosed(true)
    } else {
      setFailed(true)
    }
    setBusy(false)
  }

  return (
    <div className="plus-checkout">
      <h3>{checkout.openTitle}</h3>
      <p>{checkout.openBody}</p>
      <label className="plus-checkout__consent">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
        />
        <span>{checkout.consent}</span>
      </label>
      {closed ? <p>{checkout.closed}</p> : null}
      {failed ? <p role="alert">{checkout.failed}</p> : null}
      <button
        type="button"
        className="btn btn--primary"
        disabled={!agreed || busy}
        onClick={() => void start()}
      >
        {busy ? checkout.starting : checkout.cta}
      </button>
    </div>
  )
}

/**
 * Cancellation is separate from the checkout gate: an active member needs it
 * even while subscriptions are closed. Access stays until the paid period ends,
 * so a successful cancellation does not re-check membership.
 */
function PlusCancelPanel() {
  const cancel = useStrings().plus.cancel
  const locale = useLocale()
  const { state } = useMembershipAccess()
  const { getAccessToken } = useAuth()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PlusCancelResult | null>(null)

  if (state.kind !== 'active-member') return null

  const confirm = async () => {
    if (busy) return
    setBusy(true)
    setResult(await cancelPlusMembership(getAccessToken))
    setConfirming(false)
    setBusy(false)
  }

  const accessDate = result?.kind === 'canceled' && result.accessUntil
    ? new Date(result.accessUntil)
    : null
  const doneText =
    result?.kind === 'canceled'
      ? accessDate && !Number.isNaN(accessDate.getTime())
        ? cancel.doneUntil.replace(
            '{date}',
            new Intl.DateTimeFormat(locale, {
              dateStyle: 'long',
              timeZone: 'Asia/Taipei',
            }).format(accessDate),
          )
        : cancel.done
      : null

  return (
    <div className="plus-checkout plus-cancel">
      <h3>{cancel.title}</h3>
      <p>{cancel.body}</p>
      {doneText ? (
        <p>{doneText}</p>
      ) : result?.kind === 'no-subscription' ? (
        <p>{cancel.noSubscription}</p>
      ) : confirming ? (
        <>
          <p>{cancel.confirm}</p>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? cancel.busy : cancel.confirmCta}
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            {cancel.back}
          </button>
        </>
      ) : (
        <>
          {result?.kind === 'failed' && <p role="alert">{cancel.failed}</p>}
          <button type="button" className="btn btn--secondary" onClick={() => setConfirming(true)}>
            {cancel.cta}
          </button>
        </>
      )}
    </div>
  )
}

function PlusSurfaceList({ title, body }: { title: string; body: string }) {
  const locale = useLocale()
  const plus = useStrings().plus

  return (
    <div className="plus-surfaces">
      <h3>{title}</h3>
      <p>{body}</p>
      <ul>
        {plus.surfaces.map((surface) => (
          <li key={surface.title}>
            <strong lang={locale}>{surface.title}</strong>
            <span>{surface.body}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
