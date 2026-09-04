/** Authenticated Career Game progress/evidence boundary (verify_jwt=true). */
import { createClient } from 'npm:@supabase/supabase-js@^2.112.3';
import { careerGameScenarioMap } from '../../../apps/career-game/src/content/scenario-registry.ts';
import { careerGameCors, withCorsHeaders } from '../_shared/cors.ts';
import { createServiceRoleClient, type DbClient } from '../_shared/db.ts';
import { toHandlerRequest, toResponse } from '../_shared/deno.ts';
import { readEnvFrom } from '../_shared/env.ts';
import { createSanitizedLogger } from '../_shared/log.ts';
import { handleCareerGameProgress } from './handler.ts';

Deno.serve(async (req) => {
  const env = readEnvFrom(Deno.env);
  const request = toHandlerRequest(req);
  const cors = careerGameCors(request, env, ['POST']);
  if (cors.response) return toResponse(cors.response);

  const db = createServiceRoleClient((url, key) => createClient(url, key) as unknown as DbClient, env);
  request.bodyText = await req.text();
  const result = await handleCareerGameProgress(request, {
    db,
    log: createSanitizedLogger(),
    scenarios: careerGameScenarioMap,
    randomUUID: () => crypto.randomUUID(),
  });
  return toResponse(withCorsHeaders(result, cors.headers));
});
