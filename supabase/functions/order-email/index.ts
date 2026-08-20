/** Internal pg_cron-triggered order-confirmation email entry. */
import { createClient } from 'npm:@supabase/supabase-js@^2.112.3';
import { createServiceRoleClient, type DbClient } from '../_shared/db.ts';
import { createResendEmailSender, isOrderEmailConfigured, type EmailSender } from '../_shared/email.ts';
import { readEnvFrom } from '../_shared/env.ts';
import { toHandlerRequest, toResponse } from '../_shared/deno.ts';
import { createSanitizedLogger } from '../_shared/log.ts';
import { handleOrderEmail } from './handler.ts';

Deno.serve(async (req) => {
  const env = readEnvFrom(Deno.env);
  const db = createServiceRoleClient((url, key) => createClient(url, key) as unknown as DbClient, env);
  const sender: EmailSender = isOrderEmailConfigured(env)
    ? createResendEmailSender(env)
    : { send: async () => ({ ok: false, errorCode: 'not_configured', retryable: false }) };
  const request = toHandlerRequest(req);
  request.bodyText = await req.text();
  return toResponse(await handleOrderEmail(request, {
    env,
    db,
    sender,
    log: createSanitizedLogger(),
  }));
});
