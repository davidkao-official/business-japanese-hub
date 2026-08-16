/**
 * PurchaseResultPage — the browser-return UX at `/purchase/result?order=<id>`.
 *
 * Contract (decision-record §3.2): the ECPay browser-return POST only 303s the
 * browser here; this page NEVER treats browser-return query params as payment
 * evidence. The ONLY driver of the UI is `GET /functions/v1/orders-status/
 * :orderId/status` (server DB state), polled with bounded retries.
 *
 * Renders: pending (決済確認中…), succeeded (order confirmation + receipt via
 * OrderReceipt), failed, cancelled — plus a missing-order state when no `order`
 * query param is present and a "still processing" note when bounded polling
 * exhausts without a terminal state (or the Edge Functions gateway is
 * unconfigured).
 */
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useStrings } from '../i18n/strings'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { OrderReceipt } from './OrderReceipt'
import {
  ORDER_STATUS_MAX_ATTEMPTS,
  ORDER_STATUS_POLL_INTERVAL_MS,
  defaultFetchClient,
  pollOrderStatus,
  resolveFunctionsBaseUrl,
  resultStateFor,
} from '../lib/purchase/executor'
import type { OrderStatusResponse } from '../lib/payments/contract'

export function PurchaseResultPage() {
  const strings = useStrings()
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get('order')
  const [order, setOrder] = useState<OrderStatusResponse | null>(null)
  const [finished, setFinished] = useState(false)
  const [lastOrderId, setLastOrderId] = useState(orderId)

  // Reset the polling state when the order id changes — React-recommended
  // "adjust state during render" (never setState synchronously in the effect).
  if (lastOrderId !== orderId) {
    setLastOrderId(orderId)
    setOrder(null)
    setFinished(false)
  }

  useDocumentTitle(`${strings.purchaseResult.title} — ${strings.app.name}`)

  const baseUrl = resolveFunctionsBaseUrl()

  useEffect(() => {
    if (!orderId || !baseUrl) return
    let active = true

    // Bounded polling; the final server response is the only thing that
    // decides the view. Browser-return query params are never read here.
    pollOrderStatus(orderId, {
      functionsBaseUrl: baseUrl,
      fetchClient: defaultFetchClient,
      intervalMs: ORDER_STATUS_POLL_INTERVAL_MS,
      maxAttempts: ORDER_STATUS_MAX_ATTEMPTS,
    })
      .then((status) => {
        if (active) {
          setOrder(status)
          setFinished(true)
        }
      })
      .catch(() => {
        if (active) {
          setOrder(null)
          setFinished(true)
        }
      })

    return () => {
      active = false
    }
  }, [orderId, baseUrl])

  const headingId = 'purchase-result-title'

  if (!orderId) {
    return (
      <section className="page" aria-labelledby={headingId}>
        <h1 className="page__title" id={headingId}>
          {strings.purchaseResult.title}
        </h1>
        <p className="page__lead">{strings.purchaseResult.missingOrder}</p>
        <Link className="page__action" to="/library">
          {strings.purchaseResult.goToLibrary}
        </Link>
      </section>
    )
  }

  // Polling finished without a terminal state, or no gateway configured —
  // either way the order has not reached a result we can display.
  const showStillProcessing = finished || !baseUrl
  const view = order ? resultStateFor(order) : 'pending'

  if (view === 'pending') {
    return (
      <section className="page" aria-labelledby={headingId} role="status">
        <h1 className="page__title" id={headingId}>
          {strings.purchaseResult.title}
        </h1>
        <p className="page__lead">{strings.purchaseResult.pending}</p>
        {showStillProcessing && (
          <p className="purchase-result__note">{strings.purchaseResult.stillProcessing}</p>
        )}
        <Link className="page__action" to="/library">
          {strings.purchaseResult.goToLibrary}
        </Link>
      </section>
    )
  }

  if (view === 'succeeded' && order) {
    return (
      <section className="page" aria-labelledby={headingId}>
        <h1 className="page__title" id={headingId}>
          {strings.purchaseResult.succeededTitle}
        </h1>
        <p className="page__lead">{strings.purchaseResult.succeededMessage}</p>
        <OrderReceipt order={order} />
        <Link className="page__action" to="/library">
          {strings.purchaseResult.goToLibrary}
        </Link>
      </section>
    )
  }

  if (view === 'cancelled') {
    return (
      <section className="page" aria-labelledby={headingId}>
        <h1 className="page__title" id={headingId}>
          {strings.purchaseResult.cancelledTitle}
        </h1>
        <p className="page__lead">{strings.purchaseResult.cancelledMessage}</p>
        <Link className="page__action" to="/library">
          {strings.purchaseResult.goToLibrary}
        </Link>
      </section>
    )
  }

  // failed (payment failed) — terminal.
  return (
    <section className="page" aria-labelledby={headingId}>
      <h1 className="page__title" id={headingId}>
        {strings.purchaseResult.failedTitle}
      </h1>
      <p className="page__lead">{strings.purchaseResult.failedMessage}</p>
      <Link className="page__action" to="/library">
        {strings.purchaseResult.goToLibrary}
      </Link>
    </section>
  )
}
