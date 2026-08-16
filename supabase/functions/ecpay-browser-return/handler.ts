/**
 * ECPay OrderResultURL (browser-return) handler —
 * `POST /functions/v1/ecpay-browser-return` (verify_jwt=false).
 *
 * Browser navigation ONLY (decision-record §3.2): verify `CheckMacValue` for
 * diagnostics without failing the redirect, map `MerchantTradeNo` → local order
 * id, and 303-redirect to the SPA result page. This endpoint NEVER modifies
 * Order / Payment / Entitlement — the authoritative state comes only from the
 * server callback + QueryTradeInfo.
 */
import { parseFormUrlEncoded } from '../../../src/lib/payments/ecpay/adapter.ts';
import { verifyCheckMac } from '../../../src/lib/payments/ecpay/checkmac.ts';
import type { Env } from '../_shared/env.ts';
import type { DbClient } from '../_shared/db.ts';
import type { Logger } from '../_shared/log.ts';
import {
  methodNotAllowed,
  redirectResult,
  type HandlerRequest,
  type HandlerResult,
} from '../_shared/http.ts';
import { loadPaymentByMerchantRef } from '../_shared/flow.ts';

export interface BrowserReturnHandlerDeps {
  env: Env;
  db: DbClient;
  log: Logger;
}

export async function handleBrowserReturn(
  req: HandlerRequest,
  deps: BrowserReturnHandlerDeps,
): Promise<HandlerResult> {
  if (req.method !== 'POST') return methodNotAllowed('POST');
  const form = parseFormUrlEncoded(req.bodyText);

  // Diagnostics only — a mismatch never fails the redirect.
  let checkMacValid = false;
  try {
    checkMacValid = await verifyCheckMac(
      form,
      deps.env.ecpayHashKey,
      deps.env.ecpayHashIV,
      form.CheckMacValue,
    );
  } catch {
    checkMacValid = false;
  }
  deps.log.info(
    { merchantReference: form.MerchantTradeNo ?? null, checkMacValid, rtnCode: form.RtnCode ?? null },
    'browser return received (diagnostics only; no state mutation)',
  );

  // Map MerchantTradeNo → local order id (read-only). Unknown → still redirect.
  let orderId: string | null = null;
  const ref = form.MerchantTradeNo;
  if (ref) {
    try {
      const payment = await loadPaymentByMerchantRef(deps.db, 'ecpay', ref);
      orderId = payment?.order_id ?? null;
    } catch {
      orderId = null;
    }
  }

  const target = `/purchase/result${orderId ? `?order=${encodeURIComponent(orderId)}` : ''}`;
  return redirectResult(target, 303);
}
