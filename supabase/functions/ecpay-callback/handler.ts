/**
 * ECPay ReturnURL callback handler — `POST /functions/v1/ecpay-callback`
 * (verify_jwt=false; the handler self-verifies CheckMacValue + local invariants,
 * decision-record §3.5/§4.3/§4.4/§4.5).
 *
 * Authoritative payment processing. Body is `application/x-www-form-urlencoded`
 * (NEVER JSON). Flow per §4.5:
 *
 *   verify callback → durable `payment_events` receipt (UNIQUE(provider,
 *   event_fingerprint); replay → idempotent `1|OK`) → payment lookup by
 *   MerchantTradeNo → QueryTradeInfo confirmation → `ecpayPaymentVerified`
 *   success predicate → on verified: payment succeeded + order paid + entitlement
 *   granted exactly once, then `1|OK`.
 *
 * ACK semantics: `1|OK` is sent only AFTER durable persistence. A DB failure is
 * NOT acknowledged (ECPay retries). Provider timeout / ambiguity persists
 * `verification_pending` DURABLY first, then `1|OK`. A succeeded payment is never
 * downgraded (state.ts).
 */
import type {
  Money,
  PaymentProviderAdapter,
  ProviderPaymentSnapshot,
  VerifiedProviderEvent,
} from '../../../src/lib/payments/contract.ts';
import { ecpayPaymentVerified, parseFormUrlEncoded } from '../../../src/lib/payments/ecpay/adapter.ts';
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
import { buildPaymentEventRow, sanitizedCallbackPayload } from '../_shared/events.ts';
import { isEcpayConfigured } from '../_shared/ecpay.ts';
import {
  applyPaymentEvent,
  applyVerifiedSuccess,
  loadPaymentByMerchantRef,
  type PaymentRow,
} from '../_shared/flow.ts';

export interface EcpayCallbackHandlerDeps {
  env: Env;
  db: DbClient;
  adapter: PaymentProviderAdapter;
  log: Logger;
  now?: () => Date;
}

export async function handleEcpayCallback(
  req: HandlerRequest,
  deps: EcpayCallbackHandlerDeps,
): Promise<HandlerResult> {
  if (req.method !== 'POST') return methodNotAllowed('POST');
  if (!isEcpayConfigured(deps.env)) {
    return jsonResult(503, {
      error: 'ecpay is not configured',
      reason: 'provider_configuration_unavailable',
    });
  }
  const form = parseFormUrlEncoded(req.bodyText);
  const now = deps.now ?? (() => new Date());

  // 1. Signature + merchant verification (throws on invalid → 4xx, no ack).
  let event: VerifiedProviderEvent;
  try {
    event = await deps.adapter.verifyCallback({ form, provider: 'ecpay' });
  } catch (err) {
    deps.log.warn(
      { provider: 'ecpay', error: err instanceof Error ? err.message : String(err) },
      'callback rejected: invalid signature or merchant',
    );
    return badRequest('invalid callback signature or merchant');
  }
  deps.log.info(
    {
      provider: 'ecpay',
      merchantReference: event.providerMerchantRef,
      eventFingerprint: event.eventFingerprint,
      status: event.status,
      rtnCode: event.rawStatusCode,
    },
    'verified ecpay callback',
  );

  // 2. Durable receipt. UNIQUE(provider, event_fingerprint); replay → no-op.
  const eventInsert = await deps.db
    .from('payment_events')
    .upsert(buildPaymentEventRow(event, sanitizedCallbackPayload(form)), {
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
      'duplicate callback (replay) — re-applying idempotently',
    );
  }
  // Continue processing REGARDLESS of fresh/replay (§21/B2): the verified path
  // is idempotent (state.ts + grant upsert + grant-first ordering), so a replay
  // after a partially-failed first delivery self-heals the missing work instead
  // of being silently acked with a bare `1|OK` and never granting. Normal ACK
  // behavior and exactly-one entitlement are preserved.

  // 3. Local payment lookup by MerchantTradeNo (unknown ref → no entitlement).
  let payment: PaymentRow;
  try {
    const found = await loadPaymentByMerchantRef(deps.db, 'ecpay', event.providerMerchantRef);
    if (!found) {
      deps.log.warn(
        { merchantReference: event.providerMerchantRef },
        'callback for unknown MerchantTradeNo; no entitlement, not acknowledged as processed',
      );
      return notFound('unknown merchant trade no');
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

  // 4. Dispatch on the normalized callback status.
  if (event.status === 'failed') {
    // Terminal provider failure (RtnCode != 1) → persist failed → stop ECPay retry.
    return persistAndAck(
      deps,
      payment,
      { type: 'payment_failed', merchantReference: event.providerMerchantRef, rawStatusCode: event.rawStatusCode },
      now,
      'payment failed per callback',
    );
  }
  if (event.status === 'unknown') {
    // SimulatePaid=1 (RtnCode=1) → NOT a real payment → durable non-granting state.
    return persistAndAck(
      deps,
      payment,
      { type: 'verification_pending', merchantReference: event.providerMerchantRef },
      now,
      'simulated payment (SimulatePaid=1); not a real charge',
    );
  }

  // event.status === 'succeeded' → QueryTradeInfo confirmation (§4.4/§6).
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
    // Timeout / ambiguous / not-yet-paid → durable verification_pending → 1|OK.
    return persistAndAck(
      deps,
      payment,
      { type: 'verification_pending', merchantReference: event.providerMerchantRef },
      now,
      `provider confirmation ambiguous (${snapshot.rawStatusCode ?? snapshot.status})`,
    );
  }

  // 5. Final success predicate (§4.4) — all eleven conditions must hold. The
  // query side uses the QUERY RESPONSE's own fields (merchantTradeNo / tradeNo /
  // tradeAmt / tradeStatus from QueryTradeInfo), never callback-derived values.
  const verified = ecpayPaymentVerified({
    callbackCheckMacValid: true,
    queryCheckMacValid: true,
    configuredMerchantId: deps.env.ecpayMerchantId,
    merchantTradeNoExistsLocally: true,
    localAmount,
    callback: {
      merchantId: form.MerchantID ?? '',
      merchantTradeNo: form.MerchantTradeNo ?? '',
      tradeNo: form.TradeNo ?? '',
      tradeAmt: form.TradeAmt ?? '',
      rtnCode: form.RtnCode ?? '',
      simulatePaid: form.SimulatePaid ?? '',
    },
    query: {
      merchantTradeNo: snapshot.queryResponse?.merchantTradeNo ?? '',
      tradeNo: snapshot.queryResponse?.tradeNo ?? '',
      tradeAmt: snapshot.queryResponse?.tradeAmt ?? '',
      tradeStatus: snapshot.queryResponse?.tradeStatus ?? '',
    },
  });
  if (!verified) {
    // Anomaly (amount/ref mismatch etc.) — do NOT grant, do NOT mark failed.
    deps.log.warn(
      { paymentId: payment.id, merchantReference: event.providerMerchantRef },
      'ECPayPaymentVerified predicate failed; no entitlement; durable verification_pending',
    );
    return persistAndAck(
      deps,
      payment,
      { type: 'verification_pending', merchantReference: event.providerMerchantRef },
      now,
      'success predicate failed',
    );
  }

  // 6. Verified success → payment succeeded + order paid + grant exactly once.
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
    return textResult(200, '1|OK');
  } catch (err) {
    return persistenceFailure(deps, err);
  }
}

/** Persist a normalized state transition, then ack `1|OK` (or 5xx on failure). */
async function persistAndAck(
  deps: EcpayCallbackHandlerDeps,
  payment: PaymentRow,
  event: PaymentDomainEvent,
  now: () => Date,
  note: string,
): Promise<HandlerResult> {
  try {
    const status = await applyPaymentEvent({ db: deps.db, log: deps.log, now }, payment, event);
    deps.log.info(
      { paymentId: payment.id, merchantReference: event.merchantReference, status, note },
      'callback normalized state persisted',
    );
    return textResult(200, '1|OK');
  } catch (err) {
    return persistenceFailure(deps, err);
  }
}

function persistenceFailure(deps: EcpayCallbackHandlerDeps, err: unknown): HandlerResult {
  if (err instanceof IllegalStateTransitionError) {
    deps.log.error(
      { domain: err.domain, current: err.current, eventType: err.eventType },
      'illegal state transition; NOT acknowledging',
    );
    return jsonResult(500, { error: 'illegal state transition' });
  }
  deps.log.error(
    { error: err instanceof Error ? err.message : String(err) },
    'callback persistence failed; NOT acknowledging',
  );
  return jsonResult(500, { error: 'persistence failed' });
}
