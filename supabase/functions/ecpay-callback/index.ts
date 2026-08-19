/**
 * ECPay ReturnURL callback entry — `POST /functions/v1/ecpay-callback`.
 * Deno boundary (verify_jwt=false; the handler self-verifies the callback).
 */
import { createClient } from 'npm:@supabase/supabase-js@^2.112.3';
import { readEnvFrom } from '../_shared/env.ts';
import { createServiceRoleClient, type DbClient } from '../_shared/db.ts';
import { createEcpayAdapterSafely } from '../_shared/ecpay.ts';
import { createSanitizedLogger } from '../_shared/log.ts';
import { toHandlerRequest, toResponse } from '../_shared/deno.ts';
import { handleEcpayCallback } from './handler.ts';

Deno.serve(async (req) => {
  const env = readEnvFrom(Deno.env);
  const db = createServiceRoleClient((url, key) => createClient(url, key) as unknown as DbClient, env);
  const adapter = createEcpayAdapterSafely(env);
  const log = createSanitizedLogger();
  const request = toHandlerRequest(req);
  request.bodyText = await req.text();
  return toResponse(await handleEcpayCallback(request, { env, db, adapter, log }));
});
