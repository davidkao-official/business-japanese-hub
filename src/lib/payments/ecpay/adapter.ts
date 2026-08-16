/**
 * ECPay first TWD adapter (decision-record §4 / §6 / §7 / §8 / §10 / §16 / §17.1).
 *
 * Implements `PaymentProviderAdapter` for ECPay AioCheckOut V5 (hosted redirect,
 * `ChoosePayment=Credit`) with CheckMacValue signing, ReturnURL callback
 * verification, and QueryTradeInfo/V5 confirmation.
 *
 * BOUNDARY (§10): this adapter ONLY initiates / verifies / parses / normalizes /
 * queries / refunds. It NEVER updates `Order` / `PaymentAttempt` / `Entitlement`
 * and holds no DB / global state. The only network it performs is the
 * QueryTradeInfo/V5 POST inside `confirmPayment` (bounded by a finite timeout).
 *
 * SECRETS (§15): `HashKey` / `HashIV` are server-only and are passed to the
 * constructor from server env at the Edge Function boundary (e.g.
 * `Deno.env.get('ECPAY_HASH_KEY')`). They are NEVER accepted from or emitted to
 * client-facing inputs, never logged, and never exported.
 *
 * CURRENCY (§8.1.5, §17.1): ECPay only accepts integer TWD. The canonical domain
 * `Money.amount` is in minor units (TWD 790 → `{ amount: 79000, currency: 'TWD' }`),
 * so the adapter converts via `minorUnitFor('TWD')` before sending `TotalAmount`.
 * Any non-TWD amount is a hard refusal: `UnsupportedCurrencyForProvider('ecpay')`.
 */

import {
  UnsupportedCurrencyForProvider,
  type CheckoutInstruction,
  type CreateCheckoutInput,
  type Money,
  type PaymentProvider,
  type PaymentProviderAdapter,
  type ProviderCallbackRequest,
  type ProviderPaymentSnapshot,
  type ProviderReconciliationData,
  type ProviderRefundResult,
  type ReconciliationRange,
  type RefundInput,
  type VerifiedProviderEvent,
} from '../contract';
import { isSafeMoney, minorUnitFor } from '../money';
import { ecpayCheckMac, sha256Hex, verifyCheckMac } from './checkmac';
import { resolveEcpayEnv, type EcpayEnv, type EcpayUrls } from './urls';
import type { EcpayCallbackForm, EcpayCheckoutParams, EcpayLanguage } from './types';

/* ------------------------------------------------------------------------- *
 * Constants / errors
 * ------------------------------------------------------------------------- */

/** Fixed `TradeDesc` (§4.2). */
export const TRADE_DESC = 'Business Japanese Hub book purchase';

/** Fixed payment type / method for the hosted checkout (§4.6). */
const PAYMENT_TYPE = 'aio' as const;
const CHOOSE_PAYMENT = 'Credit' as const;
const ENCRYPT_TYPE = 1 as const;
const NEED_EXTRA_PAID_INFO = 'N' as const;

/** QueryTradeInfo connect/read deadline (finite; §6). */
export const QUERY_TRADE_INFO_TIMEOUT_MS = 15_000;

/** Allowlisted callback evidence fields used to build the event fingerprint (§12). */
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

/** Thrown when a callback / query response fails CheckMacValue verification. */
export class InvalidCheckMacValueError extends Error {
  constructor(context: string) {
    super(`Invalid ECPay CheckMacValue for ${context}`);
    this.name = 'InvalidCheckMacValueError';
  }
}

/**
 * Thrown by `reconcile` in MVP. The production FundingReconDetail download is a
 * documented ops step (§6 / §7): there is no stage sandbox and no operator
 * credentials belong in this adapter. Layer C uses the pure parser
 * `parseFundingReconDetailCsv` over an operator-provided CSV instead.
 */
export class EcpayReconciliationNotAutomatedError extends Error {
  constructor() {
    super(
      'ECPay FundingReconDetail download is not automated in MVP (decision-record §6/§7); ' +
        'production download is an ops step. Use parseFundingReconDetailCsv for an operator-provided CSV.',
    );
    this.name = 'EcpayReconciliationNotAutomatedError';
  }
}

/* ------------------------------------------------------------------------- *
 * Transport / config
 * ------------------------------------------------------------------------- */

/** Minimal HTTP transport seam — the ONLY place the adapter performs I/O. */
export interface EcpayTransport {
  post(url: string, form: Record<string, string>, timeoutMs: number): Promise<{ status: number; body: string }>;
}

/** Default transport backed by global `fetch` with an AbortController deadline. */
export function createDefaultEcpayTransport(): EcpayTransport {
  return {
    async post(url, form, timeoutMs) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
          body: new URLSearchParams(form).toString(),
          signal: controller.signal,
        });
        return { status: res.status, body: await res.text() };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export interface EcpayAdapterConfig {
  /** ECPay merchant id (non-secret; may be exposed). */
  merchantId: string;
  /** Server-only secret; never client-facing (§15). */
  hashKey: string;
  /** Server-only secret; never client-facing (§15). */
  hashIV: string;
  /** `'stage'` or `'prod'`; `undefined` fails closed to stage (§16). */
  env?: EcpayEnv;
  /** Injectable clock for deterministic `MerchantTradeDate` / `TimeStamp` (tests). */
  now?: () => Date;
  /** Injectable transport; defaults to `createDefaultEcpayTransport()`. */
  transport?: EcpayTransport;
}

/* ------------------------------------------------------------------------- *
 * Pure helpers (exported for tests / downstream use)
 * ------------------------------------------------------------------------- */

/** Map a client locale to the ECPay `Language` value (§4.2). Accepts the exact values. */
export function toEcpayLanguage(locale: string): EcpayLanguage {
  const normalized = locale.toUpperCase();
  if (normalized === 'CHT' || normalized === 'JPN' || normalized === 'ENG') {
    return normalized;
  }
  throw new Error(`Invalid ECPay Language '${locale}'; expected CHT | JPN | ENG`);
}

/** Format a Date as ECPay `yyyy/MM/dd HH:mm:ss` (MerchantTradeDate, §4.2). */
export function formatMerchantTradeDate(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/**
 * Convert the canonical TWD `Money` (minor units, §8.1) to the integer TWD value
 * ECPay accepts as `TotalAmount` (major units, §4.2 / §8.1.5). Returns the
 * ECPay integer; throws when the amount is not a whole number of TWD.
 */
export function twdIntegerFromCanonical(money: Money): number {
  const minor = minorUnitFor('TWD');
  const twd = money.amount / minor;
  if (!Number.isSafeInteger(twd) || twd <= 0) {
    throw new Error(
      `ECPay TotalAmount must be a positive whole-number TWD amount, got ${JSON.stringify(money)}`,
    );
  }
  return twd;
}

/** Serialize the typed checkout params to the form field map (all values become strings). */
export function toFormFields(params: EcpayCheckoutParams): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const key of Object.keys(params) as Array<keyof EcpayCheckoutParams>) {
    const value = params[key];
    if (value === undefined) {
      continue;
    }
    fields[key] = String(value);
  }
  return fields;
}

/** Parse an `application/x-www-form-urlencoded` body into a string map (callback / query). */
export function parseFormUrlEncoded(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(body).entries()) {
    out[key] = value;
  }
  return out;
}

/**
 * Deterministic canonical payload for the payment-event fingerprint (§12): the
 * allowlisted financial / status fields, sorted by key, joined `k=v&`. Only
 * allowlisted evidence is hashed — never a raw provider payload dump.
 */
export function canonicalVerifiedPayload(form: Record<string, string>): string {
  return CALLBACK_ALLOWLIST.filter((key) => form[key] !== undefined)
    .sort()
    .map((key) => `${key}=${form[key]}`)
    .join('&');
}

/* ------------------------------------------------------------------------- *
 * ECPayPaymentVerified success predicate (§4.4)
 *
 * The FINAL entitlement gate. True only when the callback, the local payment,
 * and the QueryTradeInfo confirmation all agree the payment is real and paid.
 * Used by the callback Edge Function (A4); `merchantTradeNoExistsLocally` is the
 * one orchestration-provided fact (the local lookup against `payments`).
 * ------------------------------------------------------------------------- */

export interface EcpayPaymentVerifiedArgs {
  /** CheckMacValue of the callback form already verified (adapter `verifyCallback`). */
  callbackCheckMacValid: boolean;
  /** CheckMacValue of the QueryTradeInfo response already verified (adapter `confirmPayment`). */
  queryCheckMacValid: boolean;
  /** Configured server MerchantID. */
  configuredMerchantId: string;
  /** Callback `MerchantTradeNo` found in the local payments table (orchestration). */
  merchantTradeNoExistsLocally: boolean;
  /** Local immutable Payment amount as canonical `Money` (TWD minor units). */
  localAmount: Money;
  callback: {
    merchantId: string;
    merchantTradeNo: string;
    tradeNo: string;
    /** ECPay integer TWD. */
    tradeAmt: string;
    rtnCode: string;
    simulatePaid: string;
  };
  query: {
    merchantTradeNo: string;
    tradeNo: string;
    /** ECPay integer TWD. */
    tradeAmt: string;
    tradeStatus: string;
  };
}

/**
 * `ECPayPaymentVerified` (§4.4): all eleven conditions below must hold before
 * the orchestration layer may transition the payment to `succeeded` / grant
 * entitlement. SimulatePaid=1 and any checkmac / amount / ref mismatch make it
 * false, even when `RtnCode=1`.
 */
export function ecpayPaymentVerified(args: EcpayPaymentVerifiedArgs): boolean {
  const { callback, query, configuredMerchantId, localAmount } = args;
  if (localAmount.currency !== 'TWD' || !Number.isSafeInteger(localAmount.amount)) {
    return false;
  }
  // ECPay integer TWD (major units); non-whole-TWD amounts simply fail the
  // equality checks below instead of throwing — the predicate never throws.
  const localTwdInteger = localAmount.amount / minorUnitFor('TWD');
  return (
    args.callbackCheckMacValid && // valid_callback_checkmac
    callback.merchantId === configuredMerchantId && // merchant_id_matches
    args.merchantTradeNoExistsLocally && // merchant_trade_no_matches (exists locally)
    Number(callback.tradeAmt) === localTwdInteger && // amount_matches
    callback.rtnCode === '1' && // rtn_code == 1
    callback.simulatePaid === '0' && // simulate_paid == 0
    args.queryCheckMacValid && // valid_query_response_checkmac
    query.merchantTradeNo === callback.merchantTradeNo && // query refs == callback refs
    query.tradeNo === callback.tradeNo &&
    Number(query.tradeAmt) === localTwdInteger && // query.trade_amt == local amount
    query.tradeStatus === '1' // query.trade_status == 1
  );
}

/* ------------------------------------------------------------------------- *
 * FundingReconDetail CSV parser (§6, Layer C) — pure / parser-only
 * ------------------------------------------------------------------------- */

/**
 * One row of the ECPay credit-card funding reconciliation CSV.
 *
 * Column order below follows the official FundingReconDetail schema; treat it as
 * documented and re-validate against the current official column order before
 * production use (the download itself is an ops step). Refunds appear as a
 * negative `refundAmount` (§6: 退款金額為負數).
 */
export interface EcpayFundingReconEntry {
  merchantId: string;
  /** `yyyyMMdd`. */
  fundingDate: string;
  fundingAmount: string;
  merchantTradeNo: string;
  tradeNo: string;
  tradeDate: string;
  tradeTime: string;
  tradeAmt: string;
  tradeFee: string;
  tradeStatus: string;
  /** Empty when the row is not a refund; negative for a confirmed refund. */
  refundAmount: string;
  refundStatus: string;
  tradeType: string;
}

/** Split one CSV line, honoring double-quoted fields and doubled quotes. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

/**
 * Parse a FundingReconDetail CSV fixture/operator file into typed entries.
 * Skips the header row and the trailing `合計` summary row; skips malformed
 * short rows rather than throwing (reconciliation is a non-blocking ops check).
 */
export function parseFundingReconDetailCsv(csv: string): EcpayFundingReconEntry[] {
  const entries: EcpayFundingReconEntry[] = [];
  for (const rawLine of csv.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('特店編號') || line.startsWith('合計')) {
      continue;
    }
    const cols = splitCsvLine(line);
    if (cols.length < 13) {
      continue; // malformed / partial row — documented skip
    }
    entries.push({
      merchantId: cols[0],
      fundingDate: cols[1],
      fundingAmount: cols[2],
      merchantTradeNo: cols[3],
      tradeNo: cols[4],
      tradeDate: cols[5],
      tradeTime: cols[6],
      tradeAmt: cols[7],
      tradeFee: cols[8],
      tradeStatus: cols[9],
      refundAmount: cols[10],
      refundStatus: cols[11],
      tradeType: cols[12],
    });
  }
  return entries;
}

/* ------------------------------------------------------------------------- *
 * Adapter
 * ------------------------------------------------------------------------- */

export class EcpayPaymentProviderAdapter implements PaymentProviderAdapter {
  readonly provider: PaymentProvider = 'ecpay';

  private readonly merchantId: string;
  private readonly hashKey: string;
  private readonly hashIV: string;
  private readonly urls: EcpayUrls;
  private readonly now: () => Date;
  private readonly transport: EcpayTransport;

  constructor(config: EcpayAdapterConfig) {
    this.merchantId = config.merchantId;
    this.hashKey = config.hashKey;
    this.hashIV = config.hashIV;
    this.urls = resolveEcpayEnv(config.env);
    this.now = config.now ?? (() => new Date());
    this.transport = config.transport ?? createDefaultEcpayTransport();
  }

  /**
   * Build the AioCheckOut V5 hosted-redirect instruction (§4.2). Refuses any
   * non-TWD amount. `TotalAmount` is the integer TWD equivalent of the canonical
   * TWD `Money` (minor units → major units, §8.1.5).
   */
  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutInstruction> {
    if (input.amount.currency !== 'TWD') {
      throw new UnsupportedCurrencyForProvider('ecpay');
    }
    if (!isSafeMoney(input.amount)) {
      throw new Error(`ECPay requires a safe non-negative TWD amount, got ${JSON.stringify(input.amount)}`);
    }
    const params: EcpayCheckoutParams = {
      MerchantID: this.merchantId,
      MerchantTradeNo: input.merchantReference,
      MerchantTradeDate: formatMerchantTradeDate(this.now()),
      PaymentType: PAYMENT_TYPE,
      TotalAmount: twdIntegerFromCanonical(input.amount),
      TradeDesc: TRADE_DESC,
      ItemName: input.itemNameSnapshot,
      ReturnURL: input.returnUrl,
      ChoosePayment: CHOOSE_PAYMENT,
      EncryptType: ENCRYPT_TYPE,
      OrderResultURL: input.orderResultUrl,
      NeedExtraPaidInfo: NEED_EXTRA_PAID_INFO,
      Language: toEcpayLanguage(input.locale),
    };
    const formFields = toFormFields(params);
    const checkMacValue = await ecpayCheckMac(formFields, this.hashKey, this.hashIV);
    return {
      action: this.urls.checkout,
      fields: { ...formFields, CheckMacValue: checkMacValue },
      provider: 'ecpay',
      merchantReference: input.merchantReference,
    };
  }

  /**
   * Verify a ReturnURL callback (§4.3 / §4.4). REJECTS (throws) on an invalid
   * CheckMacValue, a MerchantID mismatch, or malformed / missing local-invariant
   * evidence fields. A verified callback with `RtnCode != 1` is NOT a rejection —
   * it is returned as a normalized `failed` event for durable persistence.
   */
  async verifyCallback(request: ProviderCallbackRequest): Promise<VerifiedProviderEvent> {
    if (request.provider !== 'ecpay') {
      throw new Error(`ecpay adapter cannot verify provider '${request.provider}'`);
    }
    // The raw form is a `Record<string, string>`; `EcpayCallbackForm` documents
    // the allowlisted evidence fields (§4.3) without narrowing the map.
    const form = request.form;

    // Signature first (§4.4): reject anything that does not verify.
    const expectedMac = form.CheckMacValue;
    if (!expectedMac) {
      throw new Error('ecpay callback missing CheckMacValue');
    }
    const macValid = await verifyCheckMac(form, this.hashKey, this.hashIV, expectedMac);
    if (!macValid) {
      throw new InvalidCheckMacValueError('callback');
    }

    // Merchant identity (§4.4).
    if (form.MerchantID !== this.merchantId) {
      throw new Error(`ecpay callback MerchantID mismatch: got '${form.MerchantID}'`);
    }

    // Local invariants: required evidence fields present and well-formed.
    const required: ReadonlyArray<keyof EcpayCallbackForm> = [
      'MerchantTradeNo',
      'TradeNo',
      'TradeAmt',
      'RtnCode',
      'SimulatePaid',
      'PaymentDate',
      'PaymentType',
    ];
    for (const key of required) {
      const value = form[key];
      if (value === undefined || value === '') {
        throw new Error(`ecpay callback missing required field '${key}'`);
      }
    }
    const rtnCode = form.RtnCode as string;
    const simulatePaid = form.SimulatePaid as string;
    const tradeAmt = Number(form.TradeAmt);
    if (!Number.isSafeInteger(tradeAmt) || tradeAmt < 0) {
      throw new Error(`ecpay callback TradeAmt is not a non-negative integer: '${form.TradeAmt}'`);
    }
    if (!/^\d+$/.test(rtnCode)) {
      throw new Error(`ecpay callback RtnCode is not numeric: '${rtnCode}'`);
    }
    if (simulatePaid !== '0' && simulatePaid !== '1') {
      throw new Error(`ecpay callback SimulatePaid is not 0/1: '${simulatePaid}'`);
    }

    // Normalized status (§4.4): succeeded only for real, non-simulated payment.
    const status: 'succeeded' | 'failed' | 'unknown' =
      rtnCode === '1' && simulatePaid === '0'
        ? 'succeeded'
        : rtnCode === '1'
          ? 'unknown' // SimulatePaid=1 → not a real payment; never treated as paid
          : 'failed';

    const eventFingerprint = await sha256Hex(canonicalVerifiedPayload(form));
    return {
      provider: 'ecpay',
      providerMerchantRef: form.MerchantTradeNo as string,
      providerPaymentRef: form.TradeNo as string,
      eventFingerprint,
      status,
      amount: { amount: tradeAmt * minorUnitFor('TWD'), currency: 'TWD' },
      paidAt: form.PaymentDate as string,
      rawStatusCode: rtnCode,
    };
  }

  /**
   * Confirm a verified event against ECPay via QueryTradeInfo/V5 (§6) with a
   * finite deadline. The response CheckMacValue is verified; `TradeStatus` maps
   * to a provider snapshot (`1`→succeeded, `0`→pending — not terminal, other→
   * unknown). Any network error / non-200 / invalid response checkmac fails
   * closed to `unknown` so the orchestration layer persists `verification_pending`.
   */
  async confirmPayment(event: VerifiedProviderEvent): Promise<ProviderPaymentSnapshot> {
    if (!event.amount || event.amount.currency !== 'TWD') {
      throw new Error('confirmPayment requires a verified event with a TWD amount');
    }
    const queryParams = await this.buildQueryParams(event.providerMerchantRef);

    let res: { status: number; body: string };
    try {
      res = await this.transport.post(this.urls.queryTradeInfo, queryParams, QUERY_TRADE_INFO_TIMEOUT_MS);
    } catch {
      return this.unknownSnapshot(event, 'QUERY_UNAVAILABLE');
    }
    if (res.status !== 200) {
      return this.unknownSnapshot(event, `QUERY_HTTP_${res.status}`);
    }

    // `EcpayQueryResult` documents the response fields (§6); the parsed map stays
    // a `Record<string, string>` so its CheckMacValue can be verified in place.
    const query = parseFormUrlEncoded(res.body);
    const expectedMac = query.CheckMacValue;
    if (!expectedMac) {
      return this.unknownSnapshot(event, 'QUERY_CHECKMAC_MISSING');
    }
    const macValid = await verifyCheckMac(query, this.hashKey, this.hashIV, expectedMac);
    if (!macValid) {
      return this.unknownSnapshot(event, 'QUERY_CHECKMAC_INVALID');
    }

    // SimulatePaid cross-check (§4.4): a simulated query result is never `succeeded`.
    if (query.SimulatePaid === '1') {
      return this.unknownSnapshot(event, 'SIMULATED_PAYMENT');
    }

    const status: ProviderPaymentSnapshot['status'] =
      query.TradeStatus === '1'
        ? 'succeeded'
        : query.TradeStatus === '0'
          ? 'pending'
          : 'unknown';

    return {
      provider: 'ecpay',
      merchantReference: event.providerMerchantRef,
      providerPaymentReference: query.TradeNo ?? event.providerPaymentRef,
      status,
      amount: event.amount,
      paidAt: status === 'succeeded' ? (event.paidAt ?? undefined) : undefined,
      rawStatusCode: query.TradeStatus,
      // The QUERY response's own fields, so the §4.4 predicate can cross-check
      // the provider-confirmed values (not the callback-derived ones).
      queryResponse: {
        merchantTradeNo: query.MerchantTradeNo,
        tradeNo: query.TradeNo,
        tradeAmt: query.TradeAmt,
        tradeStatus: query.TradeStatus,
      },
    };
  }

  /**
   * MVP manual-refund policy (§7 / §16): automated ECPay refund is intentionally
   * NOT implemented — ECPay's refund API has no usable stage sandbox (no real
   * authorization), so an automated call cannot be validated in stage. The MVP
   * flow is: operator executes the full refund in the ECPay portal → the daily
   * FundingReconDetail reconciliation confirms it → orchestration sets
   * `refunds.status = succeeded` → `applyConfirmedRefund` revokes entitlement.
   * Entitlement is NEVER revoked before a provider-confirmed refund lands.
   */
  async refund(input: RefundInput): Promise<ProviderRefundResult> {
    // The input is intentionally ignored — MVP manual refund (see above).
    void input;
    return { ok: false, status: 'failed', rawStatusCode: 'MVP_MANUAL_REFUND' };
  }

  /**
   * Not automated in MVP — see `EcpayReconciliationNotAutomatedError`. The pure
   * parser `parseFundingReconDetailCsv` is the testable seam for Layer C.
   */
  async reconcile(input: ReconciliationRange): Promise<ProviderReconciliationData> {
    // The input is intentionally ignored — download is an ops step (see error).
    void input;
    throw new EcpayReconciliationNotAutomatedError();
  }

  /* ------------------------- private helpers ------------------------- */

  private async buildQueryParams(merchantTradeNo: string): Promise<Record<string, string>> {
    const params = {
      MerchantID: this.merchantId,
      MerchantTradeNo: merchantTradeNo,
      TimeStamp: Math.floor(this.now().getTime() / 1000).toString(),
    };
    const checkMacValue = await ecpayCheckMac(params, this.hashKey, this.hashIV);
    return { ...params, CheckMacValue: checkMacValue };
  }

  private unknownSnapshot(event: VerifiedProviderEvent, code: string): ProviderPaymentSnapshot {
    return {
      provider: 'ecpay',
      merchantReference: event.providerMerchantRef,
      providerPaymentReference: event.providerPaymentRef,
      status: 'unknown',
      amount: event.amount as Money,
      rawStatusCode: code,
    };
  }
}
