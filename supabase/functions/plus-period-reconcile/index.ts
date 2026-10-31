/**
 * Internal scheduled-job entry — `POST /functions/v1/plus-period-reconcile`.
 * Authorized only by the shared scheduled-job secret header.
 */
import { createClient } from 'npm:@supabase/supabase-js@^2.112.3';
import { readEnvFrom } from '../_shared/env.ts';
import { createServiceRoleClient, type DbClient } from '../_shared/db.ts';
import { createSanitizedLogger } from '../_shared/log.ts';
import { toHandlerRequest, toResponse } from '../_shared/deno.ts';
import { handlePlusPeriodReconcile, plusPeriodReconcileDeps } from './handler.ts';

Deno.serve(async (req) => {
  const env = readEnvFrom(Deno.env);
  const db = createServiceRoleClient((url, key) => createClient(url, key) as unknown as DbClient, env);
  const log = createSanitizedLogger();
  const request = toHandlerRequest(req);
  request.bodyText = await req.text();
  return toResponse(await handlePlusPeriodReconcile(request, plusPeriodReconcileDeps(env, db, log)));
});
