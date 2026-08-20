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
import { authenticateBearerUser } from '../_shared/auth.ts';
import { isEcpayConfigured, mapLocaleToEcpayLanguage } from '../_shared/ecpay.ts';
import { isPaypalConfigured } from '../_shared/paypal.ts';
import { generateMerchantReference, isMerchantRefCollision } from '../_shared/merchant-ref.ts';
import { applyPaymentEvent, type PaymentRow } from '../_shared/flow.ts';
import type { ProviderAdapters } from '../_shared/provider.ts';
import {
  canonicalCheckoutEvidence,
  isPaidLaunchLegalReady,
  SELLER_DISCLOSURE,
} from '../../../src/legal-content/index.ts';
import { isOrderEmailConfigured } from '../_shared/email.ts';
import { publicSiteRoute } from '../_shared/public-site.ts';
import { sha256Hex } from '../../../src/lib/payments/crypto.ts';

export type { ProviderAdapters };

export interface CheckoutHandlerDeps {
  env: Env;
  db: DbClient;
  adapters: ProviderAdapters;
  log: Logger;
  now?: () => Date;
  random?: () => number;
  /** Test seam only; production evaluates every legal/email/public-site gate. */
  legalReady?: () => boolean;
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
  const canonical = canonicalCheckoutEvidence(jurisdiction);
  if (
    locale !== canonical.locale ||
    noticeVersion !== canonical.noticeVersion ||
    consentVersion !== canonical.consentVersion ||
    noticeTextSnapshot !== canonical.noticeTextSnapshot ||
    consentTextSnapshot !== canonical.consentTextSnapshot
  ) {
    return null;
  }
  return {
    jurisdiction,
    locale: canonical.locale,
    noticeVersion: canonical.noticeVersion,
    consentVersion: canonical.consentVersion,
    consentGranted,
    noticeTextSnapshot: canonical.noticeTextSnapshot,
    consentTextSnapshot: canonical.consentTextSnapshot,
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

  const user = await authenticateBearerUser(deps.db, headerValue(req.headers, 'authorization'));
  if (!user) return unauthorized();
  if (!user.email || !user.emailConfirmed) {
    return jsonResult(422, {
      error: 'a confirmed account email is required before checkout',
      reason: 'verified_email_required',
    });
  }

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
  if (raw.consent !== undefined && consent === null) {
    return jsonResult(422, {
      error: 'checkout legal evidence does not match the canonical disclosure',
      reason: 'legal_evidence_invalid',
    });
  }

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

  // No money may move while the committed legal text or seller disclosure is
  // still draft/pending. The test seam cannot be supplied by a deployed entry.
  const legalConfigurationReady = deps.legalReady
    ? deps.legalReady()
    : isPaidLaunchLegalReady() &&
      deps.env.legalSellerName?.trim() === SELLER_DISCLOSURE.name.trim() &&
      deps.env.supportEmail?.trim().toLowerCase() === SELLER_DISCLOSURE.supportEmail.trim().toLowerCase();
  const launchReady = legalConfigurationReady &&
    isOrderEmailConfigured(deps.env) &&
    publicSiteRoute(deps.env, '') !== null &&
    await isEmailSchedulerReady(deps);
  if (!launchReady) {
    return jsonResult(503, {
      error: 'paid launch legal configuration is not ready',
      reason: 'launch_readiness_unresolved',
    });
  }

  // TW requires explicit prior consent to immediate digital delivery (§4.1/§5).
  if (consent === null || consent.consentGranted !== true) {
    return jsonResult(422, {
      error: jurisdiction === 'TW'
        ? 'explicit prior consent to immediate digital delivery is required'
        : 'proceeding after the canonical disclosure is required',
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
      uid: user.id,
      customerEmail: user.email,
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

async function isEmailSchedulerReady(deps: CheckoutHandlerDeps): Promise<boolean> {
  if (!deps.env.scheduledJobSecret) return false;
  const { data, error } = await deps.db.rpc('is_order_email_scheduler_ready', {
    p_function_url: edgeFunctionUrl(deps.env, 'order-email'),
    p_secret_sha256: await sha256Hex(deps.env.scheduledJobSecret),
  });
  return !error && (data as unknown) === true;
}

interface CheckoutFlowInput {
  uid: string;
  customerEmail: string;
  bookId: string;
  consent: ConsentSubmission | null;
  jurisdiction: ResolvedJurisdiction;
  japanTaxStatus: JapanConsumptionTaxStatus;
  deps: CheckoutHandlerDeps;
  now: () => Date;
  random: () => number;
}

async function createCheckoutOrder(input: CheckoutFlowInput): Promise<HandlerResult> {
  const { uid, customerEmail, bookId, consent, jurisdiction, japanTaxStatus, deps, now, random } = input;
  if (!consent) throw new Error('canonical compliance evidence is required');

  // Authoritative server-side price seam (§8.3): released-only catalog row.
  const catalog = await readCatalog(deps.db, bookId, now);
  const currency = String(catalog.currency);
  const itemName = typeof catalog.item_name === 'string' ? catalog.item_name.trim() : '';
  if (!itemName) throw new CatalogUnavailableError('catalog item name is unavailable');
  // Server-authoritative routing (§21): TWD → ecpay, USD → paypal; any other
  // currency (e.g. JPY) is unsupported and refuses BEFORE any insert (#20 stays
  // untouched). The client never decides the provider.
  const provider = resolveProviderForCurrency(currency);
  if (provider !== 'ecpay' && provider !== 'paypal') {
    return jsonResult(422, {
      error: 'checkout refused: provider is not enabled for paid launch',
      reason: 'unsupported_provider',
    });
  }
  // USD → PayPal requires PayPal server-side config. Refuse BEFORE creating any
  // Order / Payment row when it is absent (never silently fall USD back to
  // another provider) — an ECPay-only deployment keeps serving TWD (§21).
  if (provider === 'paypal' && !isPaypalConfigured(deps.env)) {
    return jsonResult(422, {
      error: 'checkout refused: paypal provider is not configured',
      reason: 'provider_configuration_unavailable',
    });
  }
  if (provider === 'ecpay' && !isEcpayConfigured(deps.env)) {
    return jsonResult(422, {
      error: 'checkout refused: ecpay provider is not configured',
      reason: 'provider_configuration_unavailable',
    });
  }
  const adapter = deps.adapters[provider];

  let orderId: string | null = null;
  let paymentId: string | null = null;

  try {
    // One service-role-only Postgres transaction re-reads the released catalog
    // and commits Order + canonical compliance + Payment together. The handler
    // retries only a generated merchant-reference collision.
    const created = await createAtomicCheckoutIntent(
      deps,
      uid,
      customerEmail,
      bookId,
      consent,
      jurisdiction,
      japanTaxStatus,
      provider,
      now,
      random,
    );
    const orderRow = created.order;
    const paymentRow = created.payment;
    orderId = orderRow.id;
    paymentId = paymentRow.id;
    const snapshotAmountMinor = Number(orderRow.amount_minor);
    const snapshotCurrency = String(orderRow.currency);
    const snapshotItemName = String(orderRow.item_name_snapshot);

    // Build the provider-appropriate checkout input (§4.2 / §21): ECPay needs
    // its server callback + browser-return + Language; PayPal needs the browser
    // approval return/cancel URLs (its webhook is server-configured).
    const checkoutInput = buildCheckoutInput(deps, provider, {
      orderId,
      paymentId,
      merchantReference: paymentRow.provider_merchant_ref,
      amount: { amount: snapshotAmountMinor, currency: snapshotCurrency },
      itemNameSnapshot: snapshotItemName,
      locale: consent.locale,
    });
    const instruction = await adapter.createCheckout(checkoutInput);

    // Preserve the provider checkout/session reference known before settlement
    // (PayPal Order id). The final capture/transaction id is stored separately
    // in provider_payment_ref only after authoritative confirmation.
    if (instruction.providerPaymentReference) {
      const { error: refUpdateError } = await deps.db
        .from('payments')
        .update({ provider_checkout_ref: instruction.providerPaymentReference })
        .eq('id', paymentId);
      if (refUpdateError) {
        throw new Error(`provider checkout ref update failed: ${refUpdateError.message}`);
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
      {
        orderId,
        paymentId,
        bookId,
        provider,
        merchantReference: paymentRow.provider_merchant_ref,
        amountMinor: snapshotAmountMinor,
        currency: snapshotCurrency,
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

interface AtomicCheckoutIntent {
  order: {
    id: string;
    item_name_snapshot: string;
    amount_minor: number;
    currency: string;
  };
  payment: PaymentRow;
}

async function createAtomicCheckoutIntent(
  deps: CheckoutHandlerDeps,
  userId: string,
  customerEmail: string,
  bookId: string,
  consent: ConsentSubmission,
  jurisdiction: ResolvedJurisdiction,
  japanTaxStatus: JapanConsumptionTaxStatus,
  provider: PaymentProvider,
  now: () => Date,
  random: () => number,
): Promise<AtomicCheckoutIntent> {
  for (let attempt = 0; attempt < MAX_MERCHANT_REF_RETRIES; attempt += 1) {
    const merchantRef = generateMerchantReference(now, random);
    const { data, error } = await deps.db.rpc('create_checkout_intent', {
      p_user_id: userId,
      p_book_id: bookId,
      p_customer_email_snapshot: customerEmail,
      p_jurisdiction: jurisdiction,
      p_japan_tax_status_snapshot: japanTaxStatus,
      p_locale: consent.locale,
      p_notice_version: consent.noticeVersion,
      p_consent_version: consent.consentVersion,
      p_consent_granted: consent.consentGranted,
      p_notice_text_snapshot: consent.noticeTextSnapshot,
      p_consent_text_snapshot: consent.consentTextSnapshot,
      p_consent_timestamp: now().toISOString(),
      p_provider: provider,
      p_provider_merchant_ref: merchantRef,
      p_payment_method: provider === 'paypal' ? 'paypal' : 'credit',
    });
    if (!error && data) {
      const order = data.order;
      const payment = data.payment;
      if (
        !order ||
        typeof order !== 'object' ||
        !payment ||
        typeof payment !== 'object' ||
        typeof (order as Record<string, unknown>).id !== 'string' ||
        typeof (payment as Record<string, unknown>).id !== 'string'
      ) {
        throw new Error('create_checkout_intent returned invalid rows');
      }
      return {
        order: order as unknown as AtomicCheckoutIntent['order'],
        payment: payment as unknown as PaymentRow,
      };
    }
    if (error && !isMerchantRefCollision(error.message)) {
      throw new Error(`create_checkout_intent failed: ${error.message}`);
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
