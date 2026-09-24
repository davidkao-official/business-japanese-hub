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

export type ContentKindLookup =
  | { kind: 'found'; contentKind: string }
  | { kind: 'missing' }
  | { kind: 'unavailable' }

export type ReadingReleaseLookup =
  | { kind: 'found'; release: PrivateContentRelease }
  | { kind: 'non-member' }
  | { kind: 'missing' }
  | { kind: 'unavailable' }

export interface ContentDeliveryDeps {
  db: DbClient
  membershipAccessFor: (userId: string) => Promise<MembershipAccess>
  getContentKind: (contentId: string, revision: string) => Promise<ContentKindLookup>
  getPublishedReadingRelease: (userId: string, contentId: string, revision: string) => Promise<ReadingReleaseLookup>
  getRelease: (contentId: string, revision: string) => Promise<ReleaseLookup>
}

function privateNoStore(result: HandlerResult): HandlerResult {
  return { ...result, headers: { ...result.headers, 'Cache-Control': 'private, no-store' } }
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
 * The browser can choose a reference, never access. The injected membership
 * decision comes from the temporal server RPC; direct table access is impossible.
 */
export async function handleContentDelivery(
  req: HandlerRequest,
  deps: ContentDeliveryDeps,
): Promise<HandlerResult> {
  if (req.method !== 'GET') return methodNotAllowed('GET')
  const reference = requestReference(req.url)
  if (!reference) return badRequest('invalid content reference')

  const userId = await authenticateBearer(deps.db, headerValue(req.headers, 'authorization'))
  if (!userId) return privateNoStore(unauthorized())

  let contentKind: ContentKindLookup
  try {
    contentKind = await deps.getContentKind(reference.contentId, reference.revision)
  } catch {
    contentKind = { kind: 'unavailable' }
  }
  if (contentKind.kind !== 'found') {
    let access: MembershipAccess
    try {
      access = await deps.membershipAccessFor(userId)
    } catch {
      access = 'unavailable'
    }
    if (access === 'unavailable') return privateNoStore(jsonResult(503, { error: 'membership access unavailable' }))
    if (access !== 'active') return privateNoStore(forbidden('active membership required'))
    if (contentKind.kind === 'unavailable') return privateNoStore(jsonResult(503, { error: 'content delivery unavailable' }))
    return privateNoStore(notFound('published member content not found'))
  }

  let lookup: ReleaseLookup | ReadingReleaseLookup
  if (contentKind.contentKind === 'reading') {
    try {
      lookup = await deps.getPublishedReadingRelease(userId, reference.contentId, reference.revision)
    } catch {
      lookup = { kind: 'unavailable' }
    }
    if (lookup.kind === 'non-member') return privateNoStore(forbidden('active membership required'))
  } else {
    let access: MembershipAccess
    try {
      access = await deps.membershipAccessFor(userId)
    } catch {
      access = 'unavailable'
    }
    if (access === 'unavailable') return privateNoStore(jsonResult(503, { error: 'membership access unavailable' }))
    if (access !== 'active') return privateNoStore(forbidden('active membership required'))
    try {
      lookup = await deps.getRelease(reference.contentId, reference.revision)
    } catch {
      lookup = { kind: 'unavailable' }
    }
  }
  if (lookup.kind === 'unavailable') return privateNoStore(jsonResult(503, { error: 'content delivery unavailable' }))
  if (lookup.kind === 'missing') return privateNoStore(notFound('published member content not found'))
  const { release } = lookup
  if (release.contentKind !== contentKind.contentKind) {
    return privateNoStore(jsonResult(503, { error: 'content delivery unavailable' }))
  }
  return privateNoStore(jsonResult(200, {
    content: {
      contentId: release.contentId,
      revision: release.revision,
      contentKind: release.contentKind,
      payload: release.payload,
    },
  }))
}
