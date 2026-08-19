/**
 * PayPal-specific types (Orders v2 / captures / webhooks, decision-record §21).
 *
 * These types are PROVIDER-SPECIFIC and live ONLY here — they must never leak
 * into the provider-neutral `src/lib/payments/contract.ts`. The provider-neutral
 * layer sees only normalized `VerifiedProviderEvent` / `ProviderPaymentSnapshot`
 * values produced by the adapter.
 */

/** A PayPal Order v2 response/object (`GET /v2/checkout/orders/{id}`). */
export interface PaypalOrder {
  id?: string;
  status?: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED';
  purchase_units?: Array<{
    reference_id?: string;
    custom_id?: string;
    amount?: { currency_code: string; value: string };
    payments?: {
      captures?: PaypalCapture[];
      refunds?: unknown[];
    };
  }>;
  links?: Array<{ href: string; rel: string; method?: string }>;
  create_time?: string;
}

/** A PayPal capture object (`purchase_units[].payments.captures[]`). */
export interface PaypalCapture {
  id?: string;
  status?: 'COMPLETED' | 'DECLINED' | 'PARTIALLY_REFUNDED' | 'PENDING' | 'REFUNDED' | 'FAILED';
  status_details?: unknown;
  amount?: { currency_code: string; value: string };
  final_capture?: boolean;
  custom_id?: string;
  create_time?: string;
  update_time?: string;
  /** HATEOAS links (self / up → order / refund). */
  links?: Array<{ href: string; rel: string; method?: string }>;
  supplementary_data?: {
    related_ids?: { order_id?: string };
  };
}

/** A PayPal webhook event object (the parsed raw body). */
export interface PaypalWebhookEvent {
  id?: string;
  event_version?: string;
  create_time?: string;
  resource_type?: string;
  resource_version?: string;
  event_type?: string;
  summary?: string;
  resource?: {
    id?: string;
    status?: string;
    amount?: { currency_code: string; value: string };
    custom_id?: string;
    create_time?: string;
    /** HATEOAS links (capture/refund/order); used to resolve parent objects (§21/B6). */
    links?: Array<{ href: string; rel: string; method?: string }>;
    purchase_units?: Array<{
      custom_id?: string;
      amount?: { currency_code: string; value: string };
    }>;
    supplementary_data?: {
      related_ids?: { order_id?: string };
    };
  };
}

/** Event types the adapter recognizes; unknown types map to `unknown`. */
export const PAYPAL_CAPTURE_EVENT_STATUS: Record<string, 'succeeded' | 'failed' | 'refunded' | 'unknown'> = {
  'PAYMENT.CAPTURE.COMPLETED': 'succeeded',
  'PAYMENT.CAPTURE.DENIED': 'failed',
  'PAYMENT.CAPTURE.DECLINED': 'failed',
  'PAYMENT.CAPTURE.PENDING': 'unknown',
  'PAYMENT.CAPTURE.REFUNDED': 'refunded',
  'PAYMENT.CAPTURE.REVERSED': 'refunded',
  'PAYMENT.REFUND.COMPLETED': 'refunded',
  'PAYMENT.REFUND.PENDING': 'unknown',
  'PAYMENT.REFUND.FAILED': 'unknown',
  'PAYMENT.REFUND.CANCELLED': 'unknown',
  'CHECKOUT.ORDER.APPROVED': 'unknown',
};

/** Provider-normalized PayPal Transaction Search row used by Layer C. */
export interface PaypalReconciliationEntry {
  kind: 'payment' | 'refund';
  /** Transaction Search row id (capture for payment; refund/reversal event for refund). */
  transactionId: string;
  /** Originating capture id for a refund/reversal. */
  referenceTransactionId?: string;
  eventCode: string;
  /** PayPal transaction_status (S completed, V reversed, P pending, etc.). */
  status: string;
  /** Absolute canonical USD amount. Direction is represented by `kind`. */
  amount: { amount: number; currency: 'USD' };
  occurredAt?: string;
}
