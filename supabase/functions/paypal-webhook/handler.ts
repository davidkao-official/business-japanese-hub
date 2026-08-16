/**
 * PayPal webhook handler — POST, verify_jwt=false, self-authenticating.
 *
 * Flow:
 * 1. Verify PayPal transmission headers + raw JSON via the adapter.
 * 2. Persist a sanitized payment_events receipt (unique provider+event id).
 * 3. Look up the local payment by server-generated custom_id/merchant ref.
 * 4. For ORDER.APPROVED capture server-side; for capture webhooks query the
 *    authoritative capture. A verified completed capture must exactly match the
 *    local USD amount before state mutation.
 * 5. Reuse the shared payment/order/entitlement state machine. Duplicate webhook
 *    deliveries are safe: we deliberately continue processing after a duplicate
 *    receipt so a transient capture/query failure can be retried with the same
 *    provider idempotency key.
 */
import type {
  PaymentProviderAdapter,
  ProviderPaymentSnapshot,
  VerifiedProviderEvent,
} from '../../../src/lib/payments/contract.ts';
import type { PaymentDomainEvent } from '../../../src/lib/payments/state.ts';
import { IllegalStateTransitionError } from '../../../src/lib/payments/state.ts';
import type { DbClient } from '../_shared/db.ts';
import type { Logger } from '../_shared/log.ts';
import {
  applyPaymentEvent,
  applyVerifiedSuccess,
  loadOrder,
  loadPaymentByMerchantRef,
  type PaymentRow,
} from '../_shared/flow.ts';
import {
  badRequest,
  jsonResult,
  methodNotAllowed,
  notFound,
  textResult,
  type HandlerRequest,
  type HandlerResult,
} from '../_shared/http.ts';

export interface PaypalWebhookHandlerDeps {
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
  const now = deps.now ?? (() => new Date());

  let event: VerifiedProviderEvent;
  try {
    event = await deps.adapter.verifyCallback({
      provider: 'paypal',
      form: {},
      bodyText: req.bodyText,
      headers: req.headers,
    });
  } catch (err) {
    deps.log.warn(
      { provider: 'paypal', error: err instanceof Error ? err.message : String(err) },
      'PayPal webhook rejected: verification failed',
    );
    return badRequest('invalid PayPal webhook signature or payload');
  }

  if (event.provider !== 'paypal') {
    return badRequest('verified webhook provider mismatch');
  }

  // Durable, PII-minimal receipt. Never persist the raw PayPal webhook payload.
  const eventInsert = await deps.db
    .from('payment_events')
    .insert(
      {
        provider: 'paypal',
        payment_id: null,
        provider_merchant_ref: event.providerMerchantRef,
        event_fingerprint: event.eventFingerprint,
        event_type: event.rawStatusCode ?? 'paypal.webhook',
        signature_valid: true,
        sanitized_payload_json: sanitizedPaypalEvent(event),
        processed_at: null,
        processing_result: null,
      },
      { onConflict: 'provider,event_fingerprint', ignoreDuplicates: true },
    )
    .select('id')
    .maybeSingle();
  if (eventInsert.error) {
    deps.log.error({ error: eventInsert.error.message }, 'payment_events insert failed; NOT acknowledging');
    return jsonResult(500, { error: 'event persist failed' });
  }

  let payment: PaymentRow;
  try {
    const found = await loadPaymentByMerchantRef(deps.db, 'paypal', event.providerMerchantRef);
    if (!found) {
      deps.log.warn(
        { merchantReference: event.providerMerchantRef, eventFingerprint: event.eventFingerprint },
        'PayPal webhook for unknown local payment',
      );
      return notFound('unknown PayPal merchant reference');
    }
    payment = found;
  } catch (err) {
    deps.log.error({ error: err instanceof Error ? err.message : String(err) }, 'payment lookup failed');
    return jsonResult(500, { error: 'payment lookup failed' });
  }

  // A verified terminal failure can never grant entitlement.
  if (event.status === 'failed') {
    return persistPaymentEvent(
      deps,
      payment,
      event,
      {
        type: 'payment_failed',
        merchantReference: event.providerMerchantRef,
        rawStatusCode: event.rawStatusCode,
      },
      now,
      'paypal_failed',
    );
  }

  let snapshot: ProviderPaymentSnapshot;
  try {
    snapshot = await deps.adapter.confirmPayment(event);
  } catch (err) {
    // Persist ambiguity so local state never implies success, then return 5xx.
    // A PayPal retry can safely re-run capture/query because adapter POSTs use a
    // stable PayPal-Request-Id and duplicate event receipts do NOT short-circuit.
    try {
      await applyPaymentEvent(
        { db: deps.db, log: deps.log, now },
        payment,
        { type: 'verification_pending', merchantReference: event.providerMerchantRef },
      );
    } catch (persistError) {
      return persistenceFailure(deps, persistError);
    }
    deps.log.error(
      { error: err instanceof Error ? err.message : String(err), paymentId: payment.id },
      'PayPal confirmation failed; requesting webhook retry',
    );
    return jsonResult(500, { error: 'provider confirmation failed' });
  }

  // An authoritative provider query/capture can itself report a terminal failure.
  if (snapshot.status === 'failed') {
    return persistPaymentEvent(
      deps,
      payment,
      event,
      {
        type: 'payment_failed',
        merchantReference: event.providerMerchantRef,
        rawStatusCode: snapshot.rawStatusCode ?? event.rawStatusCode,
      },
      now,
      'paypal_failed',
    );
  }

  if (snapshot.status !== 'succeeded') {
    return persistPaymentEvent(
      deps,
      payment,
      event,
      { type: 'verification_pending', merchantReference: event.providerMerchantRef },
      now,
      `paypal_${snapshot.status}`,
    );
  }

  // Success is authoritative only if the queried/captured provider state matches
  // this exact local payment. No amount/currency mismatch can grant access.
  if (!paypalSnapshotMatchesLocal(snapshot, payment, event.providerMerchantRef)) {
    deps.log.warn(
      {
        paymentId: payment.id,
        merchantReference: event.providerMerchantRef,
        providerPaymentReference: snapshot.providerPaymentReference ?? null,
      },
      'PayPal success snapshot failed local amount/currency/reference invariants',
    );
    return persistPaymentEvent(
      deps,
      payment,
      event,
      { type: 'verification_pending', merchantReference: event.providerMerchantRef },
      now,
      'paypal_success_invariant_mismatch',
    );
  }

  // Preserve provider status evidence without polluting the domain contract.
  const { error: evidenceError } = await deps.db
    .from('payments')
    .update({
      provider_payment_ref: snapshot.providerPaymentReference ?? payment.provider_payment_ref,
      provider_status_code: snapshot.rawStatusCode ?? event.rawStatusCode ?? null,
      provider_status_message: 'payment confirmed by authoritative PayPal capture',
      last_verified_at: now().toISOString(),
    })
    .eq('id', payment.id);
  if (evidenceError) {
    deps.log.error({ error: evidenceError.message }, 'PayPal provider evidence update failed');
    return jsonResult(500, { error: 'provider evidence persist failed' });
  }

  try {
    const orderRow = await loadOrder(deps.db, payment.order_id);
    if (!orderRow) throw new Error(`order ${payment.order_id} not found for payment ${payment.id}`);
    const result = await applyVerifiedSuccess({
      db: deps.db,
      log: deps.log,
      now,
      orderRow,
      paymentRow: {
        ...payment,
        provider_payment_ref: snapshot.providerPaymentReference ?? payment.provider_payment_ref,
        provider_status_code: snapshot.rawStatusCode ?? event.rawStatusCode ?? payment.provider_status_code,
      },
      merchantReference: event.providerMerchantRef,
      providerPaymentReference: snapshot.providerPaymentReference ?? event.providerPaymentRef,
      paidAt: snapshot.paidAt ?? event.paidAt,
    });
    await markEventProcessed(deps.db, event, now, result.granted ? 'success_granted' : 'success_idempotent');
    deps.log.info(
      {
        paymentId: payment.id,
        orderId: payment.order_id,
        paymentStatus: result.paymentStatus,
        orderStatus: result.orderStatus,
        granted: result.granted,
      },
      'verified PayPal payment success',
    );
    return textResult(200, 'OK');
  } catch (err) {
    return persistenceFailure(deps, err);
  }
}

export function paypalSnapshotMatchesLocal(
  snapshot: ProviderPaymentSnapshot,
  payment: PaymentRow,
  merchantReference: string,
): boolean {
  return (
    snapshot.provider === 'paypal' &&
    snapshot.merchantReference === merchantReference &&
    payment.provider === 'paypal' &&
    payment.provider_merchant_ref === merchantReference &&
    payment.currency === 'USD' &&
    snapshot.amount.currency === 'USD' &&
    Number(payment.amount_minor) === snapshot.amount.amount &&
    Boolean(snapshot.providerPaymentReference)
  );
}

function sanitizedPaypalEvent(event: VerifiedProviderEvent): Record<string, unknown> {
  return {
    providerPaymentReference: event.providerPaymentRef ?? null,
    status: event.status,
    amountMinor: event.amount?.amount ?? null,
    currency: event.amount?.currency ?? null,
    paidAt: event.paidAt ?? null,
    providerStatusCode: event.rawStatusCode ?? null,
  };
}

async function persistPaymentEvent(
  deps: PaypalWebhookHandlerDeps,
  payment: PaymentRow,
  verifiedEvent: VerifiedProviderEvent,
  domainEvent: PaymentDomainEvent,
  now: () => Date,
  processingResult: string,
): Promise<HandlerResult> {
  try {
    await applyPaymentEvent({ db: deps.db, log: deps.log, now }, payment, domainEvent);
    await markEventProcessed(deps.db, verifiedEvent, now, processingResult);
    return textResult(200, 'OK');
  } catch (err) {
    return persistenceFailure(deps, err);
  }
}

async function markEventProcessed(
  db: DbClient,
  event: Pick<VerifiedProviderEvent, 'eventFingerprint' | 'provider'>,
  now: () => Date,
  processingResult: string,
): Promise<void> {
  const { error } = await db
    .from('payment_events')
    .update({ processed_at: now().toISOString(), processing_result: processingResult })
    .eq('provider', event.provider)
    .eq('event_fingerprint', event.eventFingerprint);
  if (error) throw new Error(`payment event completion update failed: ${error.message}`);
}

function persistenceFailure(deps: PaypalWebhookHandlerDeps, err: unknown): HandlerResult {
  if (err instanceof IllegalStateTransitionError) {
    deps.log.error(
      { domain: err.domain, current: err.current, eventType: err.eventType },
      'illegal payment state transition; NOT acknowledging PayPal webhook',
    );
    return jsonResult(500, { error: 'illegal state transition' });
  }
  deps.log.error(
    { error: err instanceof Error ? err.message : String(err) },
    'PayPal webhook persistence failed; NOT acknowledging',
  );
  return jsonResult(500, { error: 'persistence failed' });
}
