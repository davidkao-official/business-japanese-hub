/**
 * PayPal webhook handler — `POST /functions/v1/paypal-webhook`
 * (verify_jwt=false; the handler self-verifies the transmission signature via
 * the official verify-webhook-signature API, decision-record §21 / §3.5).
 *
 * Authoritative payment processing for PayPal USD. Body is JSON (NEVER
 * form-encoded). Flow per §21 (mirrors §4.5):
 *
 *   verify webhook signature → durable `payment_events` receipt
 *   (UNIQUE(provider, event_fingerprint); replay → idempotent 200) → payment
 *   lookup by custom_id (provider_merchant_ref) → confirm via the authoritative
 *   order state (server capture when APPROVED) → success predicate (amount /
 *   currency match) → on verified: payment succeeded + order paid + entitlement
 *   granted exactly once → 200.
 *
 * ACK semantics: a 2xx is returned only AFTER durable persistence; a DB failure
 * is NOT acknowledged (PayPal retries up to 25×/3 days). A forged / unverified
 * webhook is rejected with 4xx and never grants. A succeeded payment is never
 * downgraded (state.ts).
 */
import type {
  Money,
  PaymentProviderAdapter,
  ProviderPaymentSnapshot,
  VerifiedProviderEvent,
} from '../../../src/lib/payments/contract.ts';
import { isVerifiedSuccessSnapshot } from '../../../src/lib/payments/domain.ts';
import { sanitizePaypalEvent } from '../../../src/lib/payments/paypal/adapter.ts';
import type { PaymentDomainEvent } from '../../../src/lib/payments/state.ts';
import { IllegalStateTransitionError } from '../../../src/lib/payments/state.ts';
import type { Env } from '../_shared/env.ts';
import type { DbClient } from '../_shared/db.ts';
import type { Logger } from '../_shared/log.ts';
import {
  badRequest,
  jsonResult,
  methodNotAllowed,
  notFound,
  textResult,
  type HandlerRequest,
  type HandlerResult,
} from '../_shared/http.ts';
import {
  buildPaymentEventRow,
  completePaymentEvent,
  type PaymentEventProcessingResult,
} from '../_shared/events.ts';
import { isPaypalConfigured } from '../_shared/paypal.ts';
import {
  applyPaymentEvent,
  applyVerifiedSuccess,
  confirmProviderRefund,
  loadRefundForPayment,
  loadPaymentByMerchantRef,
  type PaymentRow,
  type RefundRow,
} from '../_shared/flow.ts';

export interface PaypalWebhookHandlerDeps {
  env: Env;
  db: DbClient;
  adapter: PaymentProviderAdapter;
  log: Logger;
  now?: () => Date;
}

export async function handlePaypalWebhook(
  req: HandlerRequest,
  deps: PaypalWebhookHandlerDeps,
): Promise<HandlerResult> {
  if (req.method !== 'POST') return methodNotAllowed('POST');
  // Fail closed when PayPal server-side config is absent: an ECPay-only
  // deployment must not process (or ack) PayPal webhooks, and this endpoint
  // must never grant without a verified signature (§21).
  if (!isPaypalConfigured(deps.env)) {
    return jsonResult(503, {
      error: 'paypal is not configured',
      reason: 'provider_configuration_unavailable',
    });
  }
  const now = deps.now ?? (() => new Date());

  // 1. Signature + payload verification (throws on invalid → 4xx, no ack). The
  // adapter keeps the exact raw body for signature verification (§21).
  let event: VerifiedProviderEvent;
  try {
    event = await deps.adapter.verifyCallback({
      provider: 'paypal',
      body: req.bodyText,
      headers: req.headers,
    });
  } catch (err) {
    deps.log.warn(
      { provider: 'paypal', error: err instanceof Error ? err.message : String(err) },
      'webhook rejected: invalid signature or payload',
    );
    return badRequest('invalid webhook signature or payload');
  }
  deps.log.info(
    {
      provider: 'paypal',
      merchantReference: event.providerMerchantRef,
      eventFingerprint: event.eventFingerprint,
      status: event.status,
      eventType: event.rawStatusCode,
    },
    'verified paypal webhook',
  );

  // 2. Durable receipt. UNIQUE(provider, event_fingerprint); replay → no-op.
  let sanitized: Record<string, unknown>;
  try {
    sanitized = sanitizePaypalEvent(JSON.parse(req.bodyText));
  } catch {
    sanitized = { id: event.eventFingerprint };
  }
  const eventInsert = await deps.db
    .from('payment_events')
    .upsert(buildPaymentEventRow(event, sanitized), {
      onConflict: 'provider,event_fingerprint',
      ignoreDuplicates: true,
    })
    .select('id')
    .maybeSingle();
  if (eventInsert.error) {
    deps.log.error({ error: eventInsert.error.message }, 'payment_events insert failed; NOT acknowledging');
    return jsonResult(500, { error: 'event persist failed' });
  }
  const isReplay = !eventInsert.data;
  if (isReplay) {
    deps.log.info(
      { eventFingerprint: event.eventFingerprint },
      'duplicate webhook (replay) — re-applying idempotently',
    );
  }
  // Continue processing below REGARDLESS of fresh/replay: payment/refund
  // finalization is idempotent and transactional, so a replay after a failed
  // first delivery completes the missing work instead of being silently acked.

  // 3. Local payment lookup by custom_id (unknown ref → no entitlement).
  let payment: PaymentRow;
  try {
    const found = await loadPaymentByMerchantRef(deps.db, 'paypal', event.providerMerchantRef);
    if (!found) {
      deps.log.warn(
        { merchantReference: event.providerMerchantRef },
        'webhook for unknown custom_id; no entitlement, not acknowledged as processed',
      );
      return finishEvent(deps, event, null, 'unknown_reference', notFound('unknown custom id'), now);
    }
    payment = found;
  } catch (err) {
    deps.log.error(
      { error: err instanceof Error ? err.message : String(err) },
      'payment lookup failed; NOT acknowledging',
    );
    return finishEvent(
      deps,
      event,
      null,
      'processing_error',
      jsonResult(500, { error: 'payment lookup failed' }),
      now,
    );
  }

  const localAmount: Money = { amount: Number(payment.amount_minor), currency: payment.currency };

  // Asynchronous PayPal refund lifecycle events are not payment-status events.
  // Correlate them to the one existing full-refund fact, persist the provider
  // identity/status with a single CAS, and never revoke access unless a later
  // authoritative COMPLETED event reaches the finalizer below.
  if (event.refundStatus === 'pending' || event.refundStatus === 'failed') {
    let refund: RefundRow | null;
    try {
      refund = await loadRefundForPayment(deps.db, payment.id);
    } catch (err) {
      return finishEvent(
        deps,
        event,
        payment.id,
        'processing_error',
        persistenceFailure(deps, err),
        now,
      );
    }
    const eventAmountMatches = event.amount === undefined ||
      (event.amount.amount === localAmount.amount && event.amount.currency === localAmount.currency);
    const checkoutReferenceMatches =
      !payment.provider_checkout_ref || event.providerPaymentRef === payment.provider_checkout_ref;
    if (
      !eventAmountMatches ||
      !checkoutReferenceMatches ||
      refund === null ||
      refund.provider !== 'paypal' ||
      Number(refund.amount_minor) !== localAmount.amount ||
      refund.currency !== localAmount.currency ||
      !event.providerRefundRef ||
      (!!refund.provider_refund_ref && refund.provider_refund_ref !== event.providerRefundRef)
    ) {
      deps.log.warn(
        {
          paymentId: payment.id,
          merchantReference: event.providerMerchantRef,
          eventAmountMatches,
          checkoutReferenceMatches,
          refundMatches: refund !== null &&
            refund.provider === 'paypal' &&
            Number(refund.amount_minor) === localAmount.amount &&
            refund.currency === localAmount.currency &&
            !!event.providerRefundRef &&
            (!refund.provider_refund_ref || refund.provider_refund_ref === event.providerRefundRef),
        },
        'asynchronous refund evidence does not match a local full-refund request',
      );
      const { error } = await deps.db
        .from('payments')
        .update({
          reconciliation_status: 'mismatch',
          provider_status_code: event.rawStatusCode ?? null,
          provider_status_message: 'refund lifecycle evidence mismatch; finance review required',
          last_verified_at: now().toISOString(),
        })
        .eq('id', payment.id);
      if (error) {
        return finishEvent(
          deps,
          event,
          payment.id,
          'processing_error',
          persistenceFailure(deps, new Error(`refund lifecycle mismatch persist failed: ${error.message}`)),
          now,
        );
      }
      return finishEvent(deps, event, payment.id, 'refund_mismatch', textResult(200, 'OK'), now);
    }

    // A terminal local result is strongest. Late/out-of-order lifecycle events
    // never downgrade succeeded or failed Refund facts.
    if (refund.status === 'succeeded') {
      return finishEvent(deps, event, payment.id, 'refund_succeeded', textResult(200, 'OK'), now);
    }
    if (refund.status === 'failed') {
      return finishEvent(deps, event, payment.id, 'refund_failed', textResult(200, 'OK'), now);
    }

    const targetStatus = event.refundStatus === 'failed' ? 'failed' : 'processing';
    const transition = await deps.db
      .from('refunds')
      .update({
        status: targetStatus,
        provider_refund_ref: event.providerRefundRef,
        provider_status_code: event.rawStatusCode ?? null,
      })
      .eq('id', refund.id)
      .in('status', ['requested', 'processing'])
      .select('id')
      .maybeSingle();
    if (transition.error || !transition.data) {
      return finishEvent(
        deps,
        event,
        payment.id,
        'processing_error',
        persistenceFailure(
          deps,
          new Error(`refund lifecycle transition failed: ${transition.error?.message ?? 'concurrent update'}`),
        ),
        now,
      );
    }
    return finishEvent(
      deps,
      event,
      payment.id,
      event.refundStatus === 'failed' ? 'refund_failed' : 'refund_pending',
      textResult(200, 'OK'),
      now,
    );
  }

  // 4. A verified provider refund/reversal is authoritative refund evidence.
  // Record the refund fact and derived payment/order/entitlement transitions in
  // one locked DB transaction; never route it through payment confirmation.
  if (event.status === 'refunded') {
    const fullAmountMatches =
      event.amount?.amount === localAmount.amount && event.amount.currency === localAmount.currency;
    const checkoutReferenceMatches =
      !payment.provider_checkout_ref || event.providerPaymentRef === payment.provider_checkout_ref;
    const captureEvidenceMatches = event.refundEvidence === 'capture' &&
      !!event.providerCaptureRef &&
      !!payment.provider_payment_ref &&
      event.providerCaptureRef === payment.provider_payment_ref;
    const refundResourceMatches = event.refundEvidence !== 'capture' && !!event.providerRefundRef;
    const providerEvidenceMatches = captureEvidenceMatches || refundResourceMatches;
    if (!providerEvidenceMatches || !fullAmountMatches || !checkoutReferenceMatches) {
      deps.log.warn(
        {
          paymentId: payment.id,
          merchantReference: event.providerMerchantRef,
          fullAmountMatches,
          checkoutReferenceMatches,
          providerEvidenceMatches,
        },
        'provider refund evidence does not match the full local payment; finance review required',
      );
      const { error } = await deps.db
        .from('payments')
        .update({
          reconciliation_status: 'mismatch',
          provider_status_code: event.rawStatusCode ?? null,
          provider_status_message: 'refund evidence mismatch; finance review required',
          last_verified_at: now().toISOString(),
        })
        .eq('id', payment.id);
      if (error) {
        return finishEvent(
          deps,
          event,
          payment.id,
          'processing_error',
          persistenceFailure(deps, new Error(`refund mismatch persist failed: ${error.message}`)),
          now,
        );
      }
      return finishEvent(deps, event, payment.id, 'refund_mismatch', textResult(200, 'OK'), now);
    }
    try {
      const result = await confirmProviderRefund(
        { db: deps.db, log: deps.log, now },
        payment.id,
        event.refundEvidence === 'capture' ? undefined : event.providerRefundRef,
        event.rawStatusCode,
      );
      deps.log.info(
        {
          paymentId: payment.id,
          refundId: result.refundId,
          entitlementRevoked: result.entitlementRevoked,
          alreadyConfirmed: result.alreadyConfirmed,
        },
        'provider-confirmed refund applied from webhook',
      );
      return finishEvent(deps, event, payment.id, 'refund_succeeded', textResult(200, 'OK'), now);
    } catch (err) {
      return finishEvent(
        deps,
        event,
        payment.id,
        'processing_error',
        persistenceFailure(deps, err),
        now,
      );
    }
  }

  // 5. Dispatch on the remaining normalized event statuses.
  if (event.status === 'failed') {
    // Terminal provider failure (PAYMENT.CAPTURE.DENIED/DECLINED) → failed.
    return persistAndAck(
      deps,
      payment,
      event,
      { type: 'payment_failed', merchantReference: event.providerMerchantRef, rawStatusCode: event.rawStatusCode },
      'failed',
      now,
      'payment failed per webhook',
    );
  }

  // 6. succeeded (CAPTURE.COMPLETED) or unknown (APPROVED / PENDING) →
  // confirm against the authoritative order state; confirmPayment issues the
  // server capture when the order is APPROVED (§21).
  let snapshot: ProviderPaymentSnapshot;
  try {
    snapshot = await deps.adapter.confirmPayment(event);
  } catch (err) {
    deps.log.error(
      { error: err instanceof Error ? err.message : String(err) },
      'confirmPayment failed; NOT acknowledging',
    );
    return finishEvent(
      deps,
      event,
      payment.id,
      'processing_error',
      jsonResult(500, { error: 'provider confirmation failed' }),
      now,
    );
  }

  if (snapshot.status !== 'succeeded') {
    // Timeout / not-yet-captured / refunded / ambiguous → durable
    // verification_pending → 200 (repair loop resolves; never grants).
    return persistAndAck(
      deps,
      payment,
      event,
      { type: 'verification_pending', merchantReference: event.providerMerchantRef },
      'verification_pending',
      now,
      `provider confirmation ambiguous (${snapshot.rawStatusCode ?? snapshot.status})`,
    );
  }

  // 7. Success predicate: the provider-confirmed amount/currency must equal the
  // immutable local payment amount (amount/currency mismatch → no entitlement).
  if (!isVerifiedSuccessSnapshot(snapshot, localAmount.amount, localAmount.currency)) {
    deps.log.warn(
      { paymentId: payment.id, merchantReference: event.providerMerchantRef },
      'PayPal success predicate failed (amount/currency mismatch); no entitlement; verification_pending',
    );
    return persistAndAck(
      deps,
      payment,
      event,
      { type: 'verification_pending', merchantReference: event.providerMerchantRef },
      'verification_pending',
      now,
      'success predicate failed',
    );
  }

  // 8. Verified success → payment succeeded + order paid + grant exactly once.
  try {
    const result = await applyVerifiedSuccess({
      db: deps.db,
      log: deps.log,
      now,
      paymentRow: payment,
      merchantReference: event.providerMerchantRef,
      providerPaymentReference: snapshot.providerPaymentReference ?? event.providerPaymentRef,
      paidAt: event.paidAt,
      rawStatusCode: snapshot.rawStatusCode,
    });
    deps.log.info(
      {
        paymentId: payment.id,
        orderId: payment.order_id,
        paymentStatus: result.paymentStatus,
        orderStatus: result.orderStatus,
        granted: result.granted,
      },
      'verified payment success',
    );
    return finishEvent(deps, event, payment.id, 'succeeded', textResult(200, 'OK'), now);
  } catch (err) {
    return finishEvent(
      deps,
      event,
      payment.id,
      'processing_error',
      persistenceFailure(deps, err),
      now,
    );
  }
}

/** Persist a normalized state transition, then ack 200 (or 5xx on failure). */
async function persistAndAck(
  deps: PaypalWebhookHandlerDeps,
  payment: PaymentRow,
  providerEvent: VerifiedProviderEvent,
  domainEvent: PaymentDomainEvent,
  result: PaymentEventProcessingResult,
  now: () => Date,
  note: string,
): Promise<HandlerResult> {
  try {
    const status = await applyPaymentEvent({ db: deps.db, log: deps.log, now }, payment, domainEvent);
    deps.log.info(
      { paymentId: payment.id, merchantReference: domainEvent.merchantReference, status, note },
      'webhook normalized state persisted',
    );
    return finishEvent(deps, providerEvent, payment.id, result, textResult(200, 'OK'), now);
  } catch (err) {
    return finishEvent(
      deps,
      providerEvent,
      payment.id,
      'processing_error',
      persistenceFailure(deps, err),
      now,
    );
  }
}

/** Persist the receipt's correlated outcome before returning any provider ACK. */
async function finishEvent(
  deps: PaypalWebhookHandlerDeps,
  event: VerifiedProviderEvent,
  paymentId: string | null,
  result: PaymentEventProcessingResult,
  response: HandlerResult,
  now: () => Date,
): Promise<HandlerResult> {
  try {
    await completePaymentEvent(deps.db, event, paymentId, result, now().toISOString());
    return response;
  } catch (err) {
    deps.log.error(
      { error: err instanceof Error ? err.message : String(err), paymentId, result },
      'payment event outcome persist failed; NOT acknowledging',
    );
    return jsonResult(500, { error: 'event outcome persist failed' });
  }
}

function persistenceFailure(deps: PaypalWebhookHandlerDeps, err: unknown): HandlerResult {
  if (err instanceof IllegalStateTransitionError) {
    deps.log.error(
      { domain: err.domain, current: err.current, eventType: err.eventType },
      'illegal state transition; NOT acknowledging',
    );
    return jsonResult(500, { error: 'illegal state transition' });
  }
  deps.log.error(
    { error: err instanceof Error ? err.message : String(err) },
    'webhook persistence failed; NOT acknowledging',
  );
  return jsonResult(500, { error: 'persistence failed' });
}
