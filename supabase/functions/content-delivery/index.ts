/**
 * Authenticated proprietary-content delivery entry.
 *
 * The server-only temporal Plus membership RPC authorizes delivery only when
 * the selected stream has a paid window at database time. This narrow access
 * primitive does not imply that #107's recurring lifecycle or production
 * activation is complete.
 */
import { createClient } from 'npm:@supabase/supabase-js@^2.112.3'
import { browserCors, withCorsHeaders } from '../_shared/cors.ts'
import { createServiceRoleClient, type DbClient } from '../_shared/db.ts'
import { toHandlerRequest, toResponse } from '../_shared/deno.ts'
import { readEnvFrom } from '../_shared/env.ts'
import { handleContentDelivery } from './handler.ts'
import { contentKindStore, publishedReadingReleaseStore, publishedWorkplaceReleaseStore, releaseStore } from './release-store.ts'
import { resolvePlusMembershipAccess } from './membership.ts'

Deno.serve(async (req) => {
  const env = readEnvFrom(Deno.env)
  const request = toHandlerRequest(req)
  const cors = browserCors(request, env, ['GET'])
  if (cors.response) return toResponse(cors.response)

  const db = createServiceRoleClient((url, key) => createClient(url, key) as unknown as DbClient, env)
  const result = await handleContentDelivery(request, {
    db,
    membershipAccessFor: (userId) => resolvePlusMembershipAccess(db, userId),
    getContentKind: contentKindStore(db),
    getPublishedReadingRelease: publishedReadingReleaseStore(db),
    getPublishedWorkplaceRelease: publishedWorkplaceReleaseStore(db),
    getRelease: releaseStore(db),
  })
  return toResponse(withCorsHeaders(result, cors.headers))
})
