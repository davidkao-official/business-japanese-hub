/**
 * Checkout Edge Function entry — `POST /functions/v1/checkout/books/:bookId`.
 *
 * Deno boundary: reads real `Deno.env`, builds the service-role client and the
 * provider adapters, and wires the pure `handleCheckout`. ECPay/TWD remains
 * required; PayPal/USD is enabled only when its complete server credential set
 * is configured.
 */
import { createClient } from 'npm:@supabase/supabase-js@^2.112.3';
import { readEnvFrom } from '../_shared/env.ts';
import { createServiceRoleClient, type DbClient } from '../_shared/db.ts';
import { createEcpayAdapter } from '../_shared/ecpay.ts';
import { createPaypalAdapter } from '../_shared/paypal.ts';
import { createSanitizedLogger } from '../_shared/log.ts';
import { toHandlerRequest, toResponse } from '../_shared/deno.ts';
import { handleCheckout, type CheckoutHandlerDeps } from './handler.ts';

Deno.serve(async (req) => {
  const env = readEnvFrom(Deno.env);
  const db = createServiceRoleClient((url, key) => createClient(url, key) as unknown as DbClient, env);
  const ecpay = createEcpayAdapter(env);
  const paypal = createPaypalAdapter(env);
  const log = createSanitizedLogger();
  const deps: CheckoutHandlerDeps = {
    env,
    db,
    adapter: ecpay,
    adapters: { ecpay, ...(paypal ? { paypal } : {}) },
    log,
  };

  const request = toHandlerRequest(req);
  request.bodyText = await req.text();
  return toResponse(await handleCheckout(request, deps));
});
