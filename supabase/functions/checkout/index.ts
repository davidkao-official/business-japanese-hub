/**
 * Checkout Edge Function entry — `POST /functions/v1/checkout/books/:bookId`.
 *
 * Deno boundary: reads real `Deno.env`, builds the service-role client and the
 * ECPay adapter, and wires the pure `handleCheckout`. Importing `@supabase/
 * supabase-js` via the `npm:` specifier is Deno-only; vitest never imports this
 * file (it imports `./handler.ts` directly with injected fakes).
 *
 * NOTE (environment dependency, not a code defect): `supabase functions deploy`
 * must bundle the cross-directory imports into `src/` (pure domain + adapter +
 * grant write point, decision-record §3.5). This must be verified against a
 * provisioned Supabase project.
 */
import { createClient } from 'npm:@supabase/supabase-js@^2.112.3';
import { readEnvFrom } from '../_shared/env.ts';
import { createServiceRoleClient, type DbClient } from '../_shared/db.ts';
import { createEcpayAdapter } from '../_shared/ecpay.ts';
import { createSanitizedLogger } from '../_shared/log.ts';
import { toHandlerRequest, toResponse } from '../_shared/deno.ts';
import { handleCheckout, type CheckoutHandlerDeps } from './handler.ts';

Deno.serve(async (req) => {
  const env = readEnvFrom(Deno.env);
  const db = createServiceRoleClient((url, key) => createClient(url, key) as unknown as DbClient, env);
  const adapter = createEcpayAdapter(env);
  const log = createSanitizedLogger();
  const deps: CheckoutHandlerDeps = { env, db, adapter, log };

  const request = toHandlerRequest(req);
  request.bodyText = await req.text();
  return toResponse(await handleCheckout(request, deps));
});
