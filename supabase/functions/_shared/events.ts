/**
 * Payment-event reliability ledger helpers (decision-record §12).
 *
 * `payment_events` rows are the idempotent callback-receipt record:
 * `UNIQUE(provider, event_fingerprint)`. `sanitized_payload_json` persists ONLY
 * the allowlisted financial/status fields — never a raw provider payload dump.
 */
import type { VerifiedProviderEvent } from '../../../src/lib/payments/contract.ts';

/** Allowlisted callback evidence fields (mirrors the adapter's canonicalization set). */
const CALLBACK_ALLOWLIST = [
  'MerchantID',
  'MerchantTradeNo',
  'TradeNo',
  'TradeAmt',
  'PaymentDate',
  'PaymentType',
  'RtnCode',
  'RtnMsg',
  'SimulatePaid',
] as const;

/** Persist only the allowlisted financial/status fields. */
export function sanitizedCallbackPayload(form: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of CALLBACK_ALLOWLIST) {
    const value = form[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export interface PaymentEventRow {
  provider: string;
  payment_id: string | null;
  provider_merchant_ref: string;
  event_fingerprint: string;
  event_type: string;
  signature_valid: boolean;
  sanitized_payload_json: Record<string, unknown>;
  processed_at: string | null;
  processing_result: string | null;
}

/**
 * Build the durable `payment_events` row for a verified callback. `payment_id`
 * is null at insert time (the payment lookup happens after the durable receipt,
 * §4.5); it is nullable in the schema.
 *
 * `sanitizedPayload` is the provider-specific allowlisted evidence (ECPay fields
 * via `sanitizedCallbackPayload`, PayPal event fields via the adapter) — never a
 * raw provider payload dump.
 */
export function buildPaymentEventRow(
  event: VerifiedProviderEvent,
  sanitizedPayload: Record<string, unknown>,
): PaymentEventRow {
  return {
    provider: event.provider,
    payment_id: null,
    provider_merchant_ref: event.providerMerchantRef,
    event_fingerprint: event.eventFingerprint,
    event_type: 'callback.received',
    signature_valid: true,
    sanitized_payload_json: sanitizedPayload,
    processed_at: null,
    processing_result: null,
  };
}
