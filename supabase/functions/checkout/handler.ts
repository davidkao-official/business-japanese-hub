/**
 * Checkout Edge Function handler — `POST /functions/v1/checkout/books/:bookId`
 * (verify_jwt=true; decision-record §3.4/§3.5, §8.3).
 *
 * The browser sends ONLY `bookId` + the collected compliance `ConsentSubmission`
 * (never a price/amount). The handler reads the authoritative `catalog` price
 * seam, creates Order + `order_compliance` evidence, then the Payment attempt
 * (server-generated `MerchantTradeNo` with collision retry), builds the signed
 * ECPay checkout instruction, transitions the payment to `pending`, and returns
 * `CheckoutResponse`. Any client-supplied price/status field is ignored.
 *
 * Pure handler: `Env` / `DbClient` / adapter / logger are injected; the Deno
 * entry (`index.ts`) wires the real implementations. No top-level `Deno.serve`.
 */
import {
  UnsupportedCurrencyForProvider,
  type CheckoutResponse,
  type ConsentSubmission,
  type CreateCheckoutInput,
  type JapanConsumptionTaxStatus,
  type Jurisdiction,
  type PaymentProvider,
  type ResolvedJurisdiction,
  isResolvedJurisdiction,
} from '../../../src/lib/payments/contract.ts';
import { NoProviderForCurrencyError, resolveProviderForCurrency } from '../../../src/lib/payments/domain.ts';
import {
  badRequest,
  jsonResult,
  methodNotAllowed,
  notFound,
  pathnameOf,
  unauthorized,
  headerValue,
  type HandlerRequest,
  type HandlerResult,
} from '../_shared/http.ts';
import type { Env } from '../_shared/env.ts';
import { edgeFunctionUrl } from '../_shared/env.ts';
import type { DbClient } from '../_shared/db.ts';
import type { Logger } from '../_shared/log.ts';
import { authenticateBearer } from '../_shared/auth.ts';
import { mapLocaleToEcpayLanguage } from '../_shared/ecpay.ts';
import { isPaypalConfigured } from '../_shared/paypal.ts';
import { generateMerchantReference, isMerchantRefCollision } from '../_shared/merchant-ref.ts';
import { applyPaymentEvent, type PaymentRow } from '../_shared/flow.ts';
import type { ProviderAdapters } from '../_shared/provider.ts';

export type { ProviderAdapters };

export interface CheckoutHandlerDeps {
  env: Env;
  db: DbClient;
  adapters: ProviderAdapters;
  log: Logger;
  now?: () => Date;
  random?: () => number;
}

/** Collision-retry budget for the UNIQUE(provider, provider_merchant_ref) constraint. */
export const MAX_MERCHANT_REF_RETRIES = 3;

/** Sentinels so `handleCheckout` maps distinct failures to distinct HTTP codes. */
class BookNotFoundError extends Error {}
class CatalogUnavailableError extends Error {}

const CHECKOUT_PATH = /\/checkout\/books\/([^/]+)$/;

/** Parse a `ConsentSubmission` defensively; a malformed submission is treated as absent. */
export function parseConsent(value: unknown): ConsentSubmission | null {
  if (value === null || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (obj.jurisdiction !== 'TW' && obj.jurisdiction !== 'JP') return null;
  const jurisdiction = obj.jurisdiction as ResolvedJurisdiction;
  const locale = typeof obj.locale === 'string' ? obj.locale : '';
  const noticeVersion = typeof obj.noticeVersion === 'string' ? obj.noticeVersion : '';
  const consentVersion = typeof obj.consentVersion === 'string' ? obj.consentVersion : '';
  const consentGranted = obj.consentGranted === true;
  const noticeTextSnapshot = typeof obj.noticeTextSnapshot === 'string' ? obj.noticeTextSnapshot : '';
  const consentTextSnapshot = typeof obj.consentTextSnapshot === 'string' ? obj.consentTextSnapshot : '';
  if (!locale || !noticeVersion || !consentVersion || !noticeTextSnapshot || !consentTextSnapshot) {
    return null;
  }
  return {
    jurisdiction,
    locale,
    noticeVersion,
    consentVersion,
    consentGranted,
    noticeTextSnapshot,
    consentTextSnapshot,
  };
}

export async function handleCheckout(
  req: HandlerRequest,
  deps: CheckoutHandlerDeps,
): Promise<HandlerResult> {
  if (req.method !== 'POST') return methodNotAllowed('POST');

  const pathMatch = CHECKOUT_PATH.exec(pathnameOf(req.url));
  const pathBookId = pathMatch ? decodeURIComponent(pathMatch[1]) : null;
  if (!pathBookId) return notFound('book id missing in path');

  const uid = await authenticateBearer(deps.db, headerValue(req.headers, 'authorization'));
  if (!uid) return unauthorized();

  let body: unknown;
  try {
    body = JSON.parse(req.bodyText);
  } catch {
    return badRequest('invalid JSON body');
  }
  const raw = (body ?? {}) as Record<string, unknown>;
  const bodyBookId = typeof raw.bookId === 'string' ? raw.bookId : null;
  if (bodyBookId !== null && bodyBookId !== pathBookId) {
    return badRequest('bookId in body does not match the path');
  }
  const consent = parseConsent(raw.consent);

  // Fail-closed jurisdiction gate (§25 remediation): jurisdiction is an explicit
  // consumer self-declaration, NEVER derived from the UI locale or currency.
  // An unknown/absent/malformed declaration is `unresolved` and blocks checkout
  // BEFORE any order/payment/provider handoff.
  const jurisdiction: Jurisdiction = consent?.jurisdiction ?? 'unresolved';
  if (!isResolvedJurisdiction(jurisdiction)) {
    return jsonResult(422, {
      error: 'consumer jurisdiction is required before checkout',
      reason: 'jurisdiction_required',
    });
  }

  // TW requires explicit prior consent to immediate digital delivery (§4.1/§5).
  if (jurisdiction === 'TW' && (consent === null || consent.consentGranted !== true)) {
    return jsonResult(422, {
      error: 'explicit prior consent to immediate digital delivery is required',
      reason: 'consent_required',
    });
  }

  // JP reads the server-authoritative Japan consumption-tax status (fail closed):
  // an unresolved status blocks paid checkout. The client can never supply or
  // override it — the authoritative value comes from platform_tax_config here.
  const japanTaxStatus: JapanConsumptionTaxStatus =
    jurisdiction === 'JP' ? await readJapanTaxStatus(deps.db) : 'unresolved';
  if (jurisdiction === 'JP' && japanTaxStatus === 'unresolved') {
    return jsonResult(422, {
      error: 'japan consumption-tax status is unresolved; paid checkout is blocked',
      reason: 'tax_status_unresolved',
    });
  }

  const now = deps.now ?? (() => new Date());
  const random = deps.random ?? Math.random;

  try {
    return await createCheckoutOrder({
      uid,
      bookId: pathBookId,
      consent,
      jurisdiction,
      japanTaxStatus,
      deps,
      now,
      random,
    });
  } catch (err) {
    if (err instanceof BookNotFoundError) {
      return notFound('book is not available for purchase');
    }
    if (err instanceof CatalogUnavailableError) {
      return jsonResult(502, { error: 'catalog unavailable' });
    }
    if (err instanceof NoProviderForCurrencyError || err instanceof UnsupportedCurrencyForProvider) {
      return jsonResult(422, {
        error: 'checkout refused: provider does not support this currency',
        reason: 'unsupported_currency',
      });
    }
    deps.log.error({ error: err instanceof Error ? err.message : String(err) }, 'checkout failed');
    return jsonResult(502, { error: 'checkout failed' });
  }
}

interface CheckoutFlowInput {
  uid: string;
  bookId: string;
  consent: ConsentSubmission | null;
  jurisdiction: ResolvedJurisdiction;
  japanTaxStatus: JapanConsumptionTaxStatus;
  deps: CheckoutHandlerDeps;
  now: () => Date;
  random: () => number;
}

async function createCheckoutOrder(input: CheckoutFlowInput): Promise<HandlerResult> {
  const { uid, bookId, consent, jurisdiction, japanTaxStatus, deps, now, random } = input;

  // Authoritative server-side price seam (§8.3): released-only catalog row.
  const catalog = await readCatalog(deps.db, bookId, now);
  const currency = String(catalog.currency);
  const amountMinor = Number(catalog.amount_minor);
  // Server-authoritative routing (§21): TWD → ecpay, USD → paypal; any other
  // currency (e.g. JPY) is unsupported and refuses BEFORE any insert (#20 stays
  // untouched). The client never decides the provider.
  const provider = resolveProviderForCurrency(currency);
  // USD → PayPal requires PayPal server-side config. Refuse BEFORE creating any
  // Order / Payment row when it is absent (never silently fall USD back to
  // another provider) — an ECPay-only deployment keeps serving TWD (§21).
  if (provider === 'paypal' && !isPaypalConfigured(deps.env)) {
    return jsonResult(422, {
      error: 'checkout refused: paypal provider is not configured',
      reason: 'provider_configuration_unavailable',
    });
  }
  const adapter = deps.adapters[provider];

  let orderId: string | null = null;
  let paymentId: string | null = null;

  try {
    // Order snapshot (amount/currency/revision/compliance immutable after creation).
    const orderInsert = await deps.db
      .from('orders')
      .insert({
        user_id: uid,
        book_id: String(catalog.book_id ?? bookId),
        item_name_snapshot: String(catalog.slug ?? ''),
        published_revision: String(catalog.published_revision),
        amount_minor: amountMinor,
        currency,
        jurisdiction,
        japan_tax_status_snapshot: japanTaxStatus,
        status: 'pending',
      })
      .select('id')
      .single();
    if (orderInsert.error || !orderInsert.data) {
      throw new Error(`order insert failed: ${orderInsert.error?.message ?? 'no row returned'}`);
    }
    orderId = String(orderInsert.data.id);
    if (!orderId) throw new Error('order insert returned no id');

    // Compliance evidence — required for TW; persisted whenever provided (§8.3/#25).
    if (consent) {
      const complianceInsert = await deps.db.from('order_compliance').insert({
        order_id: orderId,
        jurisdiction: consent.jurisdiction,
        locale: consent.locale,
        notice_version: consent.noticeVersion,
        consent_version: consent.consentVersion,
        consent_granted: consent.consentGranted,
        notice_text_snapshot: consent.noticeTextSnapshot,
        consent_text_snapshot: consent.consentTextSnapshot,
        consent_timestamp: now().toISOString(),
      });
      if (complianceInsert.error) {
        throw new Error(`order_compliance insert failed: ${complianceInsert.error.message}`);
      }
    }

    // Payment attempt with a NEW server-generated merchant ref + collision retry.
    const paymentRow = await insertPaymentWithCollisionRetry(
      deps,
      orderId,
      provider,
      amountMinor,
      currency,
      now,
      random,
    );
    paymentId = paymentRow.id;

    // Build the provider-appropriate checkout input (§4.2 / §21): ECPay needs
    // its server callback + browser-return + Language; PayPal needs the browser
    // approval return/cancel URLs (its webhook is server-configured).
    const checkoutInput = buildCheckoutInput(deps, provider, {
      orderId,
      paymentId,
      merchantReference: paymentRow.provider_merchant_ref,
      amount: { amount: amountMinor, currency },
      itemNameSnapshot: String(catalog.slug ?? ''),
      locale: consent?.locale,
    });
    const instruction = await adapter.createCheckout(checkoutInput);

    // Persist a provider payment reference known at checkout time (PayPal order
    // id) so the browser-return / repair flows can map it back to this payment.
    if (instruction.providerPaymentReference) {
      const { error: refUpdateError } = await deps.db
        .from('payments')
        .update({ provider_payment_ref: instruction.providerPaymentReference })
        .eq('id', paymentId);
      if (refUpdateError) {
        throw new Error(`provider payment ref update failed: ${refUpdateError.message}`);
      }
    }

    // created → pending (payment_initiated).
    await applyPaymentEvent(
      { db: deps.db, log: deps.log, now },
      paymentRow,
      { type: 'payment_initiated', merchantReference: paymentRow.provider_merchant_ref },
    );

    const response: CheckoutResponse = { orderId, paymentId, instruction };
    deps.log.info(
      { orderId, paymentId, bookId, provider, merchantReference: paymentRow.provider_merchant_ref, amountMinor, currency },
      'checkout created',
    );
    return jsonResult(200, response);
  } catch (err) {
    // All-or-nothing at the handler level: roll back rows created by this call.
    await compensateCreatedRows(deps, orderId, paymentId);
    throw err;
  }
}

/** Build the provider-appropriate `CreateCheckoutInput` (§21 transport seam). */
function buildCheckoutInput(
  deps: CheckoutHandlerDeps,
  provider: PaymentProvider,
  params: {
    orderId: string;
    paymentId: string;
    merchantReference: string;
    amount: { amount: number; currency: string };
    itemNameSnapshot: string;
    locale: string | undefined;
  },
): CreateCheckoutInput {
  const base = {
    orderId: params.orderId,
    paymentId: params.paymentId,
    merchantReference: params.merchantReference,
    amount: params.amount,
    itemNameSnapshot: params.itemNameSnapshot,
  };
  if (provider === 'ecpay') {
    return {
      ...base,
      returnUrl: edgeFunctionUrl(deps.env, 'ecpay-callback'),
      orderResultUrl: edgeFunctionUrl(deps.env, 'ecpay-browser-return'),
      locale: mapLocaleToEcpayLanguage(params.locale),
    };
  }
  return {
    ...base,
    orderResultUrl: edgeFunctionUrl(deps.env, 'paypal-browser-return'),
    cancelUrl: edgeFunctionUrl(deps.env, 'paypal-browser-return'),
  };
}

async function readCatalog(
  db: DbClient,
  bookId: string,
  now: () => Date,
): Promise<Record<string, unknown>> {
  const { data, error } = await db
    .from('catalog')
    .select('*')
    .eq('book_id', bookId)
    .lte('released_at', now().toISOString())
    .maybeSingle();
  if (error) throw new CatalogUnavailableError(`catalog read failed: ${error.message}`);
  if (!data) throw new BookNotFoundError();
  return data;
}

/**
 * Read the server-authoritative Japan consumption-tax status (pre-sale gate,
 * legal-tax-launch-brief §4.1). Fail-closed: any read failure or unknown value
 * resolves to `unresolved`, which the handler treats as "paid checkout blocked".
 * The client can never supply or override this value.
 */
export async function readJapanTaxStatus(db: DbClient): Promise<JapanConsumptionTaxStatus> {
  try {
    const { data, error } = await db
      .from('platform_tax_config')
      .select('value')
      .eq('key', 'japan_consumption_tax_status')
      .maybeSingle();
    if (error || !data) return 'unresolved';
    const value = String(data.value);
    return value === 'taxable' || value === 'exempt' ? value : 'unresolved';
  } catch {
    // A rejected query (transport/abort) also fails closed — never lets the
    // unresolved gate escape as a 5xx.
    return 'unresolved';
  }
}

async function insertPaymentWithCollisionRetry(
  deps: CheckoutHandlerDeps,
  orderId: string,
  provider: PaymentProvider,
  amountMinor: number,
  currency: string,
  now: () => Date,
  random: () => number,
): Promise<PaymentRow> {
  for (let attempt = 0; attempt < MAX_MERCHANT_REF_RETRIES; attempt += 1) {
    const merchantRef = generateMerchantReference(now, random);
    const { data, error } = await deps.db
      .from('payments')
      .insert({
        order_id: orderId,
        provider,
        provider_merchant_ref: merchantRef,
        amount_minor: amountMinor,
        currency,
        method: 'credit',
        status: 'created',
      })
      .select('*')
      .single();
    if (!error && data) {
      return data as unknown as PaymentRow;
    }
    if (error && !isMerchantRefCollision(error.message)) {
      throw new Error(`payment insert failed: ${error.message}`);
    }
    deps.log.warn({ merchantReference: merchantRef }, 'merchant reference collision; regenerating');
  }
  throw new Error('could not allocate a unique merchant reference');
}

/** Best-effort rollback of rows created by a failed checkout call (FK order matters). */
async function compensateCreatedRows(
  deps: CheckoutHandlerDeps,
  orderId: string | null,
  paymentId: string | null,
): Promise<void> {
  if (paymentId) {
    const { error } = await deps.db.from('payments').delete().eq('id', paymentId);
    if (error) deps.log.warn({ paymentId, error: error.message }, 'compensation: payment delete failed');
  }
  if (orderId) {
    const { error: complianceError } = await deps.db
      .from('order_compliance')
      .delete()
      .eq('order_id', orderId);
    if (complianceError) {
      deps.log.warn({ orderId, error: complianceError.message }, 'compensation: compliance delete failed');
    }
    const { error: orderError } = await deps.db.from('orders').delete().eq('id', orderId);
    if (orderError) deps.log.warn({ orderId, error: orderError.message }, 'compensation: order delete failed');
  }
}
