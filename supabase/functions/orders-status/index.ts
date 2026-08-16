/**
 * Order-status entry — `GET /functions/v1/orders-status/:orderId/status`.
 */
import { createClient } from 'npm:@supabase/supabase-js@^2.112.3';
import { readEnvFrom } from '../_shared/env.ts';
import { createServiceRoleClient, type DbClient } from '../_shared/db.ts';
import { createSanitizedLogger } from '../_shared/log.ts';
import { toHandlerRequest, toResponse } from '../_shared/deno.ts';
import { handleOrderStatus } from './handler.ts';

Deno.serve(async (req) => {
  const env = readEnvFrom(Deno.env);
  const db = createServiceRoleClient((url, key) => createClient(url, key) as unknown as DbClient, env);
  const log = createSanitizedLogger();
  const request = toHandlerRequest(req);
  request.bodyText = await req.text();
  return toResponse(await handleOrderStatus(request, { db, log }));
});
