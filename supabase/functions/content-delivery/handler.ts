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

export type MembershipAccess = 'active' | 'non-member' | 'unavailable'

export interface PrivateContentRelease {
  contentId: string
  revision: string
  contentKind: string
  payload: Record<string, unknown>
}

export interface ContentDeliveryDeps {
  db: DbClient
  membershipAccessFor: (userId: string) => Promise<MembershipAccess>
  getRelease: (contentId: string, revision: string) => Promise<PrivateContentRelease | null>
}

const CONTENT_ID = /^[A-Za-z0-9._:-]{1,128}$/
const REVISION = /^[a-f0-9]{64}$/

function requestReference(url: string): { contentId: string; revision: string } | null {
  try {
    const parsed = new URL(url)
    if ([...parsed.searchParams.keys()].sort().join(',') !== 'contentId,revision') return null
    const contentId = parsed.searchParams.get('contentId')
    const revision = parsed.searchParams.get('revision')
    if (!contentId || !revision || !CONTENT_ID.test(contentId) || !REVISION.test(revision)) return null
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

  const release = await deps.getRelease(reference.contentId, reference.revision)
  if (!release) return notFound('published member content not found')
  return jsonResult(200, {
    content: {
      contentId: release.contentId,
      revision: release.revision,
      contentKind: release.contentKind,
      payload: release.payload,
    },
  })
}
