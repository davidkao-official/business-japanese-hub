/**
 * ECPay-specific types (decision-record §4.2 / §4.3 / §6).
 *
 * These types are PROVIDER-SPECIFIC and live ONLY here — they must never leak
 * into the provider-neutral `src/lib/payments/contract.ts`. The provider-neutral
 * layer sees only normalized `VerifiedProviderEvent` / `ProviderPaymentSnapshot`
 * values produced by the adapter.
 */

/** ECPay AioCheckOut `Language` values (§4.2): CHT / JPN / ENG. */
export type EcpayLanguage = 'CHT' | 'JPN' | 'ENG';

/**
 * First-phase AioCheckOut V5 field set (§4.2). `TotalAmount` is the integer TWD
 * amount ECPay accepts (major units); the adapter derives it from the canonical
 * `Money` via the TWD minor-unit conversion (decision-record §8.1.5). `CheckMacValue`
 * is filled in by the adapter after canonicalization; it is not required input.
 */
export interface EcpayCheckoutParams {
  MerchantID: string;
  /** Unique per payment attempt; <= 20 chars, alphanumeric, never reused (§4.6). */
  MerchantTradeNo: string;
  /** `yyyy/MM/dd HH:mm:ss`. */
  MerchantTradeDate: string;
  PaymentType: 'aio';
  /** Integer TWD (major units). */
  TotalAmount: number;
  TradeDesc: string;
  ItemName: string;
  ReturnURL: string;
  ChoosePayment: 'Credit';
  CheckMacValue?: string;
  EncryptType: 1;
  OrderResultURL: string;
  NeedExtraPaidInfo: 'N';
  Language: EcpayLanguage;
}

/**
 * ReturnURL callback evidence fields (§4.3). The callback is
 * `application/x-www-form-urlencoded`, parsed into `Record<string, string>`.
 * Only the documented financial / status fields are allowlisted; the interface
 * keeps the index signature so extra provider fields are tolerated but not
 * treated as evidence. `RtnMsg` is sanitized (never raw secrets / card data).
 */
export interface EcpayCallbackForm {
  MerchantID?: string;
  MerchantTradeNo?: string;
  TradeNo?: string;
  TradeAmt?: string;
  PaymentDate?: string;
  PaymentType?: string;
  RtnCode?: string;
  RtnMsg?: string;
  SimulatePaid?: string;
  CheckMacValue?: string;
  [key: string]: string | undefined;
}

/**
 * QueryTradeInfo V5 response (§6). Response is form-urlencoded; `TradeStatus=1`
 * means paid, `TradeStatus=0` means order created but not yet paid (not terminal).
 * The response `CheckMacValue` MUST be verified before trusting any field.
 */
export interface EcpayQueryResult {
  MerchantID?: string;
  MerchantTradeNo?: string;
  TradeNo?: string;
  TradeAmt?: string;
  TradeStatus?: string;
  SimulatePaid?: string;
  CheckMacValue?: string;
  [key: string]: string | undefined;
}
