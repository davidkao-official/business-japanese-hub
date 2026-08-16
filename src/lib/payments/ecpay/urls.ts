/**
 * ECPay endpoint URLs (§4.1 / §6).
 *
 * Stage and production credentials / endpoints must never be mixed (§16).
 * `resolveEcpayEnv` returns ONE environment's full URL set; an absent env value
 * fails closed to stage (never an ambiguous hybrid).
 */

/** The full URL set for one ECPay environment. */
export interface EcpayUrls {
  /** AioCheckOut V5 checkout redirect (§4.1). */
  checkout: string;
  /** QueryTradeInfo V5 order-query endpoint (§6). */
  queryTradeInfo: string;
  /**
   * FundingReconDetail credit-card funding reconciliation CSV (§6) — production
   * only; stage has no real-authorization sandbox so there is no stage URL.
   */
  fundingReconDetail?: string;
}

export type EcpayEnv = 'stage' | 'prod';

export const ECPAY_URLS: Record<EcpayEnv, EcpayUrls> = {
  stage: {
    checkout: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5',
    queryTradeInfo: 'https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5',
  },
  prod: {
    checkout: 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5',
    queryTradeInfo: 'https://payment.ecpay.com.tw/Cashier/QueryTradeInfo/V5',
    fundingReconDetail: 'https://payment.ecpay.com.tw/CreditDetail/FundingReconDetail',
  },
};

/**
 * Resolve the URL set for an environment. `undefined` (env not configured) is
 * treated as stage — the safe, non-mixing default; production is only ever
 * selected by an explicit `'prod'`.
 */
export function resolveEcpayEnv(env: EcpayEnv | undefined): EcpayUrls {
  return env === 'prod' ? ECPAY_URLS.prod : ECPAY_URLS.stage;
}
