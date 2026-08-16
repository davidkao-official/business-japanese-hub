import { createClient } from 'npm:@supabase/supabase-js@^2.112.3';
import { readEnvFrom } from '../_shared/env.ts';
import { createServiceRoleClient, type DbClient } from '../_shared/db.ts';
import { createPaypalAdapter } from '../_shared/paypal.ts';
import { createSanitizedLogger } from '../_shared/log.ts';
import { toHandlerRequest, toResponse } from '../_shared/deno.ts';
import { handlePaypalWebhook } from './handler.ts';

Deno.serve(async (req) => {
  const env = readEnvFrom(Deno.env);
  const db = createServiceRoleClient((url, key) => createClient(url, key) as unknown as DbClient, env);
  const adapter = createPaypalAdapter(env);
  if (!adapter) return new Response(JSON.stringify({ error: 'PayPal is not configured' }), { status: 503 });
  const request = toHandlerRequest(req);
  request.bodyText = await req.text();
  return toResponse(
    await handlePaypalWebhook(request, { db, adapter, log: createSanitizedLogger() }),
  );
});
