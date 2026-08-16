/**
 * Checkout Edge Function handler — `POST /functions/v1/checkout/books/:bookId`
 * (verify_jwt=true; decision-record §3.4/§3.5, §8.3).
 *
 * The browser sends ONLY `bookId` + the collected compliance `ConsentSubmission`
 * (never a price/amount). The handler reads the authoritative `catalog` price
 * seam, selects the payment provider from that SERVER-side currency, creates
 * Order + `order_compliance` evidence, then the Payment attempt (server-generated
 * merchant reference with collision retry), builds the provider checkout
 * instruction, transitions the payment to `pending`, and returns
 * `CheckoutResponse`. Any client-supplied price/provider/status field is ignored.
 *
 * Pure handler: `Env` / `DbClient` / adapters / logger are injected; the Deno
 * entry (`index.ts`) wires the real implementations. No top-level `Deno.serve`.
 */
import {
  type CheckoutResponse,
  type ConsentSubmission,
  type JapanConsumptionTaxStatus,
  type Jurisdiction,
  type PaymentProvider,
  type PaymentProviderAdapter,
  type ResolvedJurisdiction,
  isResolvedJurisdiction,
} from '../../../src/lib/payments/contract.ts';
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
import { generateMerchantReference, isMerchantRefCollision } from '../_shared/merchant-ref.ts';
import { applyPaymentEvent, type PaymentRow } from '../_shared/flow.ts';

export interface CheckoutHandlerDeps {
  env: Env;
  db: DbClient;
  /** Existing TWD/ECPay adapter, kept as a compatibility fallback. */
  adapter: PaymentProviderAdapter;
  /** Provider registry used by the second-provider path. */
  adapters?: Partial<Record<PaymentProvider, PaymentProviderAdapter>>;
  log: Logger;
  now?: () => Date;
  random?: () => number;
}

/** Collision-retry budget for the UNIQUE(provider, provider_merchant_ref) constraint. */
export const MAX_MERCHANT_REF_RETRIES = 3;

/** Sentinels so `handleCheckout` maps distinct failures to distinct HTTP codes. */
class BookNotFoundError extends Error {}
class CatalogUnavailableError extends Error {}
class UnsupportedCheckoutCurrencyError extends Error {}
class PaymentProviderUnavailableError extends Error {}

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

/**
 * Provider selection is SERVER-authoritative and based only on the immutable
 * catalog currency snapshot. Locale/jurisdiction never choose a provider.
 */
export function checkoutProviderForCurrency(currency: string): PaymentProvider | null {
  if (currency === 'TWD') return 'ecpay';
  if (currency === 'USD') return 'paypal';
  return null;
}

function checkoutAdapterForProvider(
  deps: CheckoutHandlerDeps,
  provider: PaymentProvider,
): PaymentProviderAdapter | null {
  const registered = deps.adapters?.[provider];
  if (registered) return registered;
  // Backward-compatible TWD seam: existing callers/tests inject `adapter`.
  return provider === 'ecpay' ? deps.adapter : null;
}

function checkoutUrls(
  env: Env,
  provider: PaymentProvider,
  orderId: string,
): { returnUrl: string; orderResultUrl: string } {
  if (provider === 'ecpay') {
    return {
      returnUrl: edgeFunctionUrl(env, 'ecpay-callback'),
      orderResultUrl: edgeFunctionUrl(env, 'ecpay-browser-return'),
    };
  }
  if (provider === 'paypal') {
    const base = edgeFunctionUrl(env, 'paypal-browser-return');
    const order = encodeURIComponent(orderId);
    return {
      returnUrl: `${base}?order=${order}`,
      orderResultUrl: `${base}?order=${order}&cancel=1`,
    };
  }
  throw new PaymentProviderUnavailableError(`checkout URLs are not configured for ${provider}`);
}

function providerLocale(provider: PaymentProvider, locale: string | undefined): string {
  return provider === 'ecpay' ? mapLocaleToEcpayLanguage(locale) : (locale ?? 'en');
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

  // JP reads the server-authoritative Japan consumption-tax status (fail closed).
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
    if (err instanceof UnsupportedCheckoutCurrencyError) {
      return jsonResult(422, {
        error: 'checkout refused: no payment provider supports this catalog currency',
        reason: 'unsupported_currency',
      });
    }
    if (err instanceof PaymentProviderUnavailableError) {
      return jsonResult(503, {
        error: 'checkout provider is not configured',
        reason: 'provider_unavailable',
      });
    }
    deps.log.error({ error: err instanceof Error ? err.message : String(err) }, 'checkout failed');
    return jsonResult(502, { error: 'checkout failed' });
  }
}

interface CreateCheckoutInput {
  uid: string;
  bookId: string;
  consent: ConsentSubmission | null;
  jurisdiction: ResolvedJurisdiction;
  japanTaxStatus: JapanConsumptionTaxStatus;
  deps: CheckoutHandlerDeps;
  now: () => Date;
  random: () => number;
}

async function createCheckoutOrder(input: CreateCheckoutInput): Promise<HandlerResult> {
  const { uid, bookId, consent, jurisdiction, japanTaxStatus, deps, now, random } = input;

  // Authoritative server-side price seam (§8.3): released-only catalog row.
  const catalog = await readCatalog(deps.db, bookId, now);
  const currency = String(catalog.currency);
  const amountMinor = Number(catalog.amount_minor);
  const provider = checkoutProviderForCurrency(currency);
  if (!provider) throw new UnsupportedCheckoutCurrencyError(currency);
  const adapter = checkoutAdapterForProvider(deps, provider);
  if (!adapter) throw new PaymentProviderUnavailableError(provider);

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

    // Compliance evidence — persisted whenever provided (§8.3/#25).
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

    // Build the provider checkout instruction. The ECPay callback/browser URLs
    // remain unchanged; PayPal receives a state-neutral browser return URL.
    const urls = checkoutUrls(deps.env, provider, orderId);
    const instruction = await adapter.createCheckout({
      orderId,
      paymentId,
      merchantReference: paymentRow.provider_merchant_ref,
      amount: { amount: amountMinor, currency },
      itemNameSnapshot: String(catalog.slug ?? ''),
      locale: providerLocale(provider, consent?.locale),
      returnUrl: urls.returnUrl,
      orderResultUrl: urls.orderResultUrl,
    });
    if (instruction.provider !== provider || instruction.merchantReference !== paymentRow.provider_merchant_ref) {
      throw new Error('provider checkout instruction does not match the local payment attempt');
    }

    // created → pending (payment_initiated).
    await applyPaymentEvent(
      { db: deps.db, log: deps.log, now },
      paymentRow,
      { type: 'payment_initiated', merchantReference: paymentRow.provider_merchant_ref },
    );

    const response: CheckoutResponse = { orderId, paymentId, instruction };
    deps.log.info(
      {
        orderId,
        paymentId,
        bookId,
        provider,
        merchantReference: paymentRow.provider_merchant_ref,
        amountMinor,
        currency,
      },
      'checkout created',
    );
    return jsonResult(200, response);
  } catch (err) {
    // All-or-nothing at the handler level: roll back rows created by this call.
    await compensateCreatedRows(deps, orderId, paymentId);
    throw err;
  }
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
    deps.log.warn({ provider, merchantReference: merchantRef }, 'merchant reference collision; regenerating');
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
