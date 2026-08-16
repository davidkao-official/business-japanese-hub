/**
 * Provider-adapter registry for the Edge Functions (§3.5 / §21).
 *
 * One adapter per routed provider. `createProviderAdapters(env)` builds them all
 * from server env at the Deno boundary; handlers inject fakes in tests. The
 * currency→provider routing decision lives in the checkout seam
 * (`resolveProviderForCurrency`, src/lib/payments/domain.ts) — never in the
 * client.
 */
import type { PaymentProviderAdapter } from '../../../src/lib/payments/contract.ts';
import type { Env } from './env.ts';
import { createEcpayAdapter } from './ecpay.ts';
import { createPaypalAdapter } from './paypal.ts';

/** The adapters available to the orchestration seams (one per routed provider). */
export interface ProviderAdapters {
  ecpay: PaymentProviderAdapter;
  paypal: PaymentProviderAdapter;
}

export function createProviderAdapters(env: Env): ProviderAdapters {
  return { ecpay: createEcpayAdapter(env), paypal: createPaypalAdapter(env) };
}
