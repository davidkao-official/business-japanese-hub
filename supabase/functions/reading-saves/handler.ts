import { readingCatalog } from '../../../src/reading/catalog.ts'
import type { ReadingCatalogEntry } from '../../../src/reading/types.ts'
import { authenticateBearer } from '../_shared/auth.ts'
import type { DbClient } from '../_shared/db.ts'
import {
  badRequest,
  forbidden,
  headerValue,
  jsonResult,
  methodNotAllowed,
  unauthorized,
  type HandlerRequest,
  type HandlerResult,
} from '../_shared/http.ts'

export type ReadingMembershipAccess = 'active' | 'non-member' | 'unavailable'

export interface ReadingSavesDeps {
  db: DbClient
  membershipAccessFor: (userId: string) => Promise<ReadingMembershipAccess>
  /** Injectable only for focused handler tests; production uses the canonical catalog. */
  catalog?: readonly ReadingCatalogEntry[]
}

type SaveRow = { item_id: string; revision: string | null; saved_at: string }

const MAX_BODY_BYTES = 8192
const MAX_LIST = 50
const ITEM_ID = /^[A-Za-z0-9._:-]{1,128}$/
const REVISION = /^[a-f0-9]{64}$/

function noStore(result: HandlerResult): HandlerResult {
  return { ...result, headers: { ...result.headers, 'Cache-Control': 'private, no-store' } }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validItemId(value: unknown): value is string {
  return typeof value === 'string' && ITEM_ID.test(value)
}

function validRevision(value: unknown): value is string {
  return typeof value === 'string' && REVISION.test(value)
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}

function mapRow(value: unknown): SaveRow | null {
  if (!record(value) || !validItemId(value.item_id) ||
    !(value.revision === null || validRevision(value.revision)) || !validTimestamp(value.saved_at)) return null
  return { item_id: value.item_id, revision: value.revision, saved_at: value.saved_at }
}

function responseItem(row: SaveRow) {
  return { itemId: row.item_id, revision: row.revision, savedAt: row.saved_at }
}

function parseBody(bodyText: string): Record<string, unknown> | null {
  if (new TextEncoder().encode(bodyText).byteLength > MAX_BODY_BYTES) return null
  try {
    const parsed: unknown = JSON.parse(bodyText)
    return record(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function requireMember(
  req: HandlerRequest,
  deps: ReadingSavesDeps,
): Promise<{ userId: string } | { result: HandlerResult }> {
  let userId: string | null
  try {
    userId = await authenticateBearer(deps.db, headerValue(req.headers, 'authorization'))
  } catch {
    return { result: noStore(jsonResult(503, { error: 'authentication unavailable' })) }
  }
  if (!userId) return { result: noStore(unauthorized()) }
  let access: ReadingMembershipAccess
  try {
    access = await deps.membershipAccessFor(userId)
  } catch {
    access = 'unavailable'
  }
  if (access === 'unavailable') return { result: noStore(jsonResult(503, { error: 'membership access unavailable' })) }
  if (access !== 'active') return { result: noStore(forbidden('active membership required')) }
  return { userId }
}

function itemIdQuery(req: HandlerRequest): { itemId?: string; invalid: boolean } {
  let url: URL
  try {
    url = new URL(req.url)
  } catch {
    return { invalid: true }
  }
  const entries = [...url.searchParams.entries()]
  if (entries.length === 0) return { invalid: false }
  if (entries.length !== 1 || entries[0]?.[0] !== 'itemId' || !validItemId(entries[0]?.[1])) {
    return { invalid: true }
  }
  return { itemId: entries[0][1], invalid: false }
}

async function listSaves(userId: string, deps: ReadingSavesDeps, itemId?: string): Promise<HandlerResult> {
  try {
    let query = deps.db.from('reading_saves')
      .select('item_id,revision,saved_at')
      .eq('user_id', userId)
    if (itemId === undefined) {
      query = query.order('saved_at', { ascending: false })
        .order('item_id', { ascending: true })
        .limit(MAX_LIST)
    } else {
      query = query.eq('item_id', itemId).limit(1)
    }
    const result = await query
    if (result.error || !Array.isArray(result.data)) return noStore(jsonResult(503, { error: 'Reading saves unavailable' }))
    const rows = result.data.map(mapRow)
    if (rows.some((row) => row === null)) return noStore(jsonResult(503, { error: 'Reading saves unavailable' }))
    return noStore(jsonResult(200, { items: rows.map((row) => responseItem(row as SaveRow)) }))
  } catch {
    return noStore(jsonResult(503, { error: 'Reading saves unavailable' }))
  }
}

async function saveItem(body: Record<string, unknown>, userId: string, deps: ReadingSavesDeps): Promise<HandlerResult> {
  if (!exactKeys(body, ['itemId', 'revision']) || !validItemId(body.itemId) ||
    !(body.revision === null || validRevision(body.revision))) {
    return noStore(badRequest('invalid Reading save reference'))
  }
  const entry = (deps.catalog ?? readingCatalog).find((candidate) => candidate.id === body.itemId)
  if (!entry) return noStore(jsonResult(409, { error: 'Reading item is no longer available' }))

  if (entry.access === 'free') {
    if (entry.sampleLabel !== 'non-proprietary-teaching-sample' || body.revision !== null) {
      return noStore(jsonResult(409, { error: 'Reading save reference is stale' }))
    }
  } else {
    const reference = entry.releaseReference
    if (!reference || reference.contentId !== entry.id || body.revision !== reference.revision) {
      return noStore(jsonResult(409, { error: 'Reading save reference is stale' }))
    }
  }

  try {
    const { data, error } = await deps.db.rpc('save_reading_item', {
      p_user_id: userId,
      p_item_id: entry.id,
      p_revision: body.revision,
    })
    if (error) return noStore(jsonResult(503, { error: 'Reading save unavailable' }))
    if (record(data) && data.status === 'stale') {
      return noStore(jsonResult(409, { error: 'Reading save reference is stale' }))
    }
    const row = mapRow(data)
    if (!row || row.item_id !== entry.id || row.revision !== body.revision) {
      return noStore(jsonResult(503, { error: 'Reading save unavailable' }))
    }
    return noStore(jsonResult(200, responseItem(row)))
  } catch {
    return noStore(jsonResult(503, { error: 'Reading save unavailable' }))
  }
}

async function removeItem(body: Record<string, unknown>, userId: string, deps: ReadingSavesDeps): Promise<HandlerResult> {
  if (!exactKeys(body, ['itemId']) || !validItemId(body.itemId)) {
    return noStore(badRequest('invalid Reading save identity'))
  }
  try {
    const { data, error } = await deps.db.rpc('remove_reading_item', {
      p_user_id: userId,
      p_item_id: body.itemId,
    })
    if (error || !record(data) || data.item_id !== body.itemId ||
      !(data.revision === null || validRevision(data.revision)) || !validTimestamp(data.server_timestamp)) {
      return noStore(jsonResult(503, { error: 'Reading save unavailable' }))
    }
    return noStore(jsonResult(200, {
      itemId: data.item_id,
      revision: data.revision,
      serverTimestamp: data.server_timestamp,
    }))
  } catch {
    return noStore(jsonResult(503, { error: 'Reading save unavailable' }))
  }
}

export async function handleReadingSaves(req: HandlerRequest, deps: ReadingSavesDeps): Promise<HandlerResult> {
  if (req.method !== 'GET' && req.method !== 'PUT' && req.method !== 'DELETE') {
    return noStore(methodNotAllowed('GET, PUT, DELETE'))
  }
  const member = await requireMember(req, deps)
  if ('result' in member) return member.result
  if (req.method === 'GET') {
    const query = itemIdQuery(req)
    if (query.invalid) return noStore(badRequest('invalid Reading saves query'))
    return listSaves(member.userId, deps, query.itemId)
  }

  const body = parseBody(req.bodyText)
  if (!body) return noStore(badRequest('invalid Reading save request'))
  return req.method === 'PUT'
    ? saveItem(body, member.userId, deps)
    : removeItem(body, member.userId, deps)
}

export { MAX_BODY_BYTES }
