/** Server-only delivery of a previously imported proprietary release. */
import { authenticateBearer } from '../_shared/auth.ts'
import {
  badRequest,
  forbidden,
  headerValue,
  jsonResult,
  methodNotAllowed,
  notFound,
  unauthorized,
  type HandlerRequest,
  type HandlerResult,
} from '../_shared/http.ts'
import type { DbClient } from '../_shared/db.ts'
import { isPrivateContentId, PRIVATE_CONTENT_REVISION } from '../../../src/content-delivery/references.ts'

export type MembershipAccess = 'active' | 'non-member' | 'unavailable'

export interface PrivateContentRelease {
  contentId: string
  revision: string
  contentKind: string
  payload: Record<string, unknown>
}

export type ReleaseLookup =
  | { kind: 'found'; release: PrivateContentRelease }
  | { kind: 'missing' }
  | { kind: 'unavailable' }

export interface ContentDeliveryDeps {
  db: DbClient
  membershipAccessFor: (userId: string) => Promise<MembershipAccess>
  getRelease: (contentId: string, revision: string) => Promise<ReleaseLookup>
}

function requestReference(url: string): { contentId: string; revision: string } | null {
  try {
    const parsed = new URL(url)
    if ([...parsed.searchParams.keys()].sort().join(',') !== 'contentId,revision') return null
    const contentId = parsed.searchParams.get('contentId')
    const revision = parsed.searchParams.get('revision')
    if (!contentId || !revision || !isPrivateContentId(contentId) || !PRIVATE_CONTENT_REVISION.test(revision)) return null
    return { contentId, revision }
  } catch {
    return null
  }
}

/**
 * The browser can choose a reference, never access. #107 replaces only the
 * injected membership projection; direct table access remains impossible.
 */
export async function handleContentDelivery(
  req: HandlerRequest,
  deps: ContentDeliveryDeps,
): Promise<HandlerResult> {
  if (req.method !== 'GET') return methodNotAllowed('GET')
  const reference = requestReference(req.url)
  if (!reference) return badRequest('invalid content reference')

  const userId = await authenticateBearer(deps.db, headerValue(req.headers, 'authorization'))
  if (!userId) return unauthorized()

  const access = await deps.membershipAccessFor(userId)
  if (access === 'unavailable') return jsonResult(503, { error: 'membership access unavailable' })
  if (access !== 'active') return forbidden('active membership required')

  const lookup = await deps.getRelease(reference.contentId, reference.revision)
  if (lookup.kind === 'unavailable') return jsonResult(503, { error: 'content delivery unavailable' })
  if (lookup.kind === 'missing') return notFound('published member content not found')
  const { release } = lookup
  return jsonResult(200, {
    content: {
      contentId: release.contentId,
      revision: release.revision,
      contentKind: release.contentKind,
      payload: release.payload,
    },
  })
}
