/** Authenticated Library learning-evidence boundary (verify_jwt=true). */
import { createClient } from 'npm:@supabase/supabase-js@^2.112.3';
import learningCatalog from '../../../content-dist/learning-catalog.json' with { type: 'json' };
import { browserCors, withCorsHeaders } from '../_shared/cors.ts';
import { createServiceRoleClient, type DbClient } from '../_shared/db.ts';
import { toHandlerRequest, toResponse } from '../_shared/deno.ts';
import { readEnvFrom } from '../_shared/env.ts';
import { createSanitizedLogger } from '../_shared/log.ts';
import {
  handleLibraryLearningEvidence,
  type LibraryLearningCatalog,
} from './handler.ts';

Deno.serve(async (req) => {
  const env = readEnvFrom(Deno.env);
  const request = toHandlerRequest(req);
  const cors = browserCors(request, env, ['POST']);
  if (cors.response) return toResponse(cors.response);

  const db = createServiceRoleClient((url, key) => createClient(url, key) as unknown as DbClient, env);
  request.bodyText = await req.text();
  const result = await handleLibraryLearningEvidence(request, {
    db,
    log: createSanitizedLogger(),
    // The pure handler validates the runtime shape before trusting any entry.
    catalog: learningCatalog as unknown as LibraryLearningCatalog,
  });
  return toResponse(withCorsHeaders(result, cors.headers));
});
