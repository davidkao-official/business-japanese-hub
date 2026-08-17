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
import { buildPaymentEventRow } from '../_shared/events.ts';
import { isPaypalConfigured } from '../_shared/paypal.ts';
import {
  applyPaymentEvent,
  applyVerifiedSuccess,
  loadOrder,
  loadPaymentByMerchantRef,
  type PaymentRow,
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
    .insert(buildPaymentEventRow(event, sanitized), {
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
  // Continue processing below REGARDLESS of fresh/replay: the verified-success
  // path is idempotent (state.ts + grant upsert), so a replay after a
  // partially-failed first delivery self-heals (grant-first ordering in
  // applyVerifiedSuccess keeps the order pending until the grant lands) instead
  // of being silently acked without ever granting (reviewer finding, #21).

  // 3. Local payment lookup by custom_id (unknown ref → no entitlement).
  let payment: PaymentRow;
  try {
    const found = await loadPaymentByMerchantRef(deps.db, 'paypal', event.providerMerchantRef);
    if (!found) {
      deps.log.warn(
        { merchantReference: event.providerMerchantRef },
        'webhook for unknown custom_id; no entitlement, not acknowledged as processed',
      );
      return notFound('unknown custom id');
    }
    payment = found;
  } catch (err) {
    deps.log.error(
      { error: err instanceof Error ? err.message : String(err) },
      'payment lookup failed; NOT acknowledging',
    );
    return jsonResult(500, { error: 'payment lookup failed' });
  }

  const localAmount: Money = { amount: Number(payment.amount_minor), currency: payment.currency };

  // 4. Dispatch on the normalized event status.
  if (event.status === 'failed') {
    // Terminal provider failure (PAYMENT.CAPTURE.DENIED/DECLINED) → failed.
    return persistAndAck(
      deps,
      payment,
      { type: 'payment_failed', merchantReference: event.providerMerchantRef, rawStatusCode: event.rawStatusCode },
      now,
      'payment failed per webhook',
    );
  }

  // 5. succeeded (CAPTURE.COMPLETED) or unknown (APPROVED / PENDING / REFUNDED) →
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
    return jsonResult(500, { error: 'provider confirmation failed' });
  }

  if (snapshot.status !== 'succeeded') {
    // Timeout / not-yet-captured / refunded / ambiguous → durable
    // verification_pending → 200 (repair loop resolves; never grants).
    return persistAndAck(
      deps,
      payment,
      { type: 'verification_pending', merchantReference: event.providerMerchantRef },
      now,
      `provider confirmation ambiguous (${snapshot.rawStatusCode ?? snapshot.status})`,
    );
  }

  // 6. Success predicate: the provider-confirmed amount/currency must equal the
  // immutable local payment amount (amount/currency mismatch → no entitlement).
  if (!isVerifiedSuccessSnapshot(snapshot, localAmount.amount, localAmount.currency)) {
    deps.log.warn(
      { paymentId: payment.id, merchantReference: event.providerMerchantRef },
      'PayPal success predicate failed (amount/currency mismatch); no entitlement; verification_pending',
    );
    return persistAndAck(
      deps,
      payment,
      { type: 'verification_pending', merchantReference: event.providerMerchantRef },
      now,
      'success predicate failed',
    );
  }

  // 7. Verified success → payment succeeded + order paid + grant exactly once.
  try {
    const orderRow = await loadOrder(deps.db, payment.order_id);
    if (!orderRow) throw new Error(`order ${payment.order_id} not found for payment ${payment.id}`);
    const result = await applyVerifiedSuccess({
      db: deps.db,
      log: deps.log,
      now,
      orderRow,
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
    return textResult(200, 'OK');
  } catch (err) {
    return persistenceFailure(deps, err);
  }
}

/** Persist a normalized state transition, then ack 200 (or 5xx on failure). */
async function persistAndAck(
  deps: PaypalWebhookHandlerDeps,
  payment: PaymentRow,
  event: PaymentDomainEvent,
  now: () => Date,
  note: string,
): Promise<HandlerResult> {
  try {
    const status = await applyPaymentEvent({ db: deps.db, log: deps.log, now }, payment, event);
    deps.log.info(
      { paymentId: payment.id, merchantReference: event.merchantReference, status, note },
      'webhook normalized state persisted',
    );
    return textResult(200, 'OK');
  } catch (err) {
    return persistenceFailure(deps, err);
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
