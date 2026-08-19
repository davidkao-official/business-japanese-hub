/**
 * ECPay adapter factory + locale mapping for the Edge Functions (§3.5 / §4.2).
 *
 * The adapter is built from `Env` at the Deno boundary and injected into the
 * pure handlers (tests inject fakes). Secrets never cross the handler/log
 * boundary. ECPay `Language` mapping is BCP-47 locale → CHT / JPN / ENG.
 */
import { EcpayPaymentProviderAdapter } from '../../../src/lib/payments/ecpay/adapter.ts';
import type { PaymentProviderAdapter } from '../../../src/lib/payments/contract.ts';
import type { EcpayLanguage } from '../../../src/lib/payments/ecpay/types.ts';
import type { Env } from './env.ts';

export type EcpayConfiguredEnv = Env & {
  ecpayMerchantId: string;
  ecpayHashKey: string;
  ecpayHashIV: string;
};

export class EcpayConfigurationUnavailableError extends Error {
  constructor() {
    super('ECPay is not configured (ECPAY_MERCHANT_ID / ECPAY_HASH_KEY / ECPAY_HASH_IV)');
    this.name = 'EcpayConfigurationUnavailableError';
  }
}

export function isEcpayConfigured(env: Env): env is EcpayConfiguredEnv {
  return Boolean(env.ecpayMerchantId && env.ecpayHashKey && env.ecpayHashIV);
}

export function createEcpayAdapter(env: Env): EcpayPaymentProviderAdapter {
  if (!isEcpayConfigured(env)) throw new EcpayConfigurationUnavailableError();
  return new EcpayPaymentProviderAdapter({
    merchantId: env.ecpayMerchantId,
    hashKey: env.ecpayHashKey,
    hashIV: env.ecpayHashIV,
    env: env.ecpayEnv,
  });
}

export function createUnavailableEcpayAdapter(): PaymentProviderAdapter {
  const fail = (): never => {
    throw new EcpayConfigurationUnavailableError();
  };
  return {
    createCheckout: async () => fail(),
    verifyCallback: async () => fail(),
    confirmPayment: async () => fail(),
    refund: async () => fail(),
    reconcile: async () => fail(),
  };
}

export function createEcpayAdapterSafely(env: Env): PaymentProviderAdapter {
  return isEcpayConfigured(env) ? createEcpayAdapter(env) : createUnavailableEcpayAdapter();
}

/**
 * Map a BCP-47 client locale to the ECPay `Language` value (§4.2):
 * zh-* → CHT, ja-* → JPN, en-* → ENG. Unknown locales default to CHT
 * (the store's home market). Never throws — always yields a valid value.
 */
export function mapLocaleToEcpayLanguage(locale: string | undefined): EcpayLanguage {
  const normalized = (locale ?? '').toLowerCase();
  if (normalized.startsWith('zh')) return 'CHT';
  if (normalized.startsWith('ja')) return 'JPN';
  if (normalized.startsWith('en')) return 'ENG';
  return 'CHT';
}
