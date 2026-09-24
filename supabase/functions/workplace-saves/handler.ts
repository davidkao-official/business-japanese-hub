import { workplaceLearnCatalog } from '../../../src/workplace-learn/catalog.ts'
import type { WorkplaceLearnCatalogEntry, WorkplaceLearnKind } from '../../../src/workplace-learn/types.ts'
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

export type WorkplaceMembershipAccess = 'active' | 'non-member' | 'unavailable'
export interface WorkplaceSavesDeps {
  db: DbClient
  membershipAccessFor: (userId: string) => Promise<WorkplaceMembershipAccess>
  /** Injectable only for focused tests; production uses the body-free bundled catalog. */
  catalog?: readonly WorkplaceLearnCatalogEntry[]
}

type SaveRow = { item_id: string; item_kind: WorkplaceLearnKind; revision: string | null; saved_at: string }
type PublicationRow = {
  item_id: string; item_kind: WorkplaceLearnKind; access_scope: 'free' | 'plus'
  revision: string | null; sample_classification: string | null; available: boolean
}

const MAX_BODY_BYTES = 8192
const MAX_LIST = 50
const ITEM_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/
const REVISION = /^[a-f0-9]{64}$/

function noStore(result: HandlerResult): HandlerResult {
  return { ...result, headers: { ...result.headers, 'Cache-Control': 'private, no-store' } }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function validItemId(value: unknown): value is string { return typeof value === 'string' && ITEM_ID.test(value) }
function validKind(value: unknown): value is WorkplaceLearnKind { return value === 'lesson' || value === 'vocabulary' }
function validRevision(value: unknown): value is string { return typeof value === 'string' && REVISION.test(value) }
function validTimestamp(value: unknown): value is string { return typeof value === 'string' && Number.isFinite(Date.parse(value)) }
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}
function mapSave(value: unknown): SaveRow | null {
  if (!record(value) || !validItemId(value.item_id) || !validKind(value.item_kind) ||
    !(value.revision === null || validRevision(value.revision)) || !validTimestamp(value.saved_at)) return null
  return { item_id: value.item_id, item_kind: value.item_kind, revision: value.revision, saved_at: value.saved_at }
}
function mapPublication(value: unknown): PublicationRow | null {
  if (!record(value) || !validItemId(value.item_id) || !validKind(value.item_kind) ||
    (value.access_scope !== 'free' && value.access_scope !== 'plus') ||
    !(value.revision === null || validRevision(value.revision)) ||
    !(value.sample_classification === null || value.sample_classification === 'non-proprietary-teaching-sample') ||
    typeof value.available !== 'boolean') return null
  return {
    item_id: value.item_id, item_kind: value.item_kind, access_scope: value.access_scope,
    revision: value.revision, sample_classification: value.sample_classification, available: value.available,
  }
}
function parseBody(bodyText: string): Record<string, unknown> | null {
  if (new TextEncoder().encode(bodyText).byteLength > MAX_BODY_BYTES) return null
  try { const parsed: unknown = JSON.parse(bodyText); return record(parsed) ? parsed : null } catch { return null }
}
function responseItem(row: SaveRow, current: boolean) {
  return { itemId: row.item_id, kind: row.item_kind, revision: row.revision, savedAt: row.saved_at, current }
}

async function requireMember(req: HandlerRequest, deps: WorkplaceSavesDeps): Promise<{ userId: string } | { result: HandlerResult }> {
  let userId: string | null
  try { userId = await authenticateBearer(deps.db, headerValue(req.headers, 'authorization')) }
  catch { return { result: noStore(jsonResult(503, { error: 'authentication unavailable' })) } }
  if (!userId) return { result: noStore(unauthorized()) }
  let access: WorkplaceMembershipAccess
  try { access = await deps.membershipAccessFor(userId) } catch { access = 'unavailable' }
  if (access === 'unavailable') return { result: noStore(jsonResult(503, { error: 'membership access unavailable' })) }
  if (access !== 'active') return { result: noStore(forbidden('active membership required')) }
  return { userId }
}

function itemIdQuery(req: HandlerRequest): { itemId?: string; invalid: boolean } {
  let url: URL
  try { url = new URL(req.url) } catch { return { invalid: true } }
  const entries = [...url.searchParams.entries()]
  if (entries.length === 0) return { invalid: false }
  if (entries.length !== 1 || entries[0]?.[0] !== 'itemId' || !validItemId(entries[0]?.[1])) return { invalid: true }
  return { itemId: entries[0][1], invalid: false }
}

async function currentFlags(rows: SaveRow[], deps: WorkplaceSavesDeps): Promise<Map<string, boolean> | null> {
  const ids = [...new Set(rows.map((row) => row.item_id))]
  const flags = new Map(ids.map((id) => [id, false]))
  if (ids.length === 0) return flags
  try {
    const publicationResult = await deps.db.from('workplace_learn_publication')
      .select('item_id,item_kind,access_scope,revision,sample_classification,available')
      .in('item_id', ids)
    if (publicationResult.error || !Array.isArray(publicationResult.data)) return null
    const publications = publicationResult.data.map(mapPublication)
    if (publications.some((row) => row === null)) return null
    const publicationById = new Map((publications as PublicationRow[]).map((row) => [row.item_id, row]))
    const plusRows = rows.filter((row) => {
      const publication = publicationById.get(row.item_id)
      return publication?.available === true && publication.access_scope === 'plus' &&
        publication.item_kind === row.item_kind && publication.revision === row.revision
    })
    const releases = new Set<string>()
    if (plusRows.length) {
      const releaseResult = await deps.db.from('private_content_release')
        .select('content_id,revision,content_kind,access_scope')
        .in('content_id', [...new Set(plusRows.map((row) => row.item_id))])
      if (releaseResult.error || !Array.isArray(releaseResult.data)) return null
      for (const release of releaseResult.data) {
        if (!record(release) || !validItemId(release.content_id) || !validRevision(release.revision) ||
          typeof release.content_kind !== 'string' || typeof release.access_scope !== 'string') return null
        if ((release.content_kind === 'workplace-lesson' || release.content_kind === 'workplace-vocabulary') && release.access_scope === 'member') {
          releases.add(`${release.content_id}:${release.revision}:${release.content_kind}`)
        }
      }
    }
    for (const row of rows) {
      const publication = publicationById.get(row.item_id)
      if (!publication || !publication.available || publication.item_kind !== row.item_kind || publication.revision !== row.revision) continue
      if (publication.access_scope === 'free') {
        if (publication.sample_classification === 'non-proprietary-teaching-sample' && row.revision === null) flags.set(row.item_id, true)
      } else {
        const releaseKind = row.item_kind === 'lesson' ? 'workplace-lesson' : 'workplace-vocabulary'
        if (row.revision && releases.has(`${row.item_id}:${row.revision}:${releaseKind}`)) flags.set(row.item_id, true)
      }
    }
    return flags
  } catch { return null }
}

async function listSaves(userId: string, deps: WorkplaceSavesDeps, itemId?: string): Promise<HandlerResult> {
  try {
    let query = deps.db.from('workplace_learn_saves').select('item_id,item_kind,revision,saved_at').eq('user_id', userId)
    if (itemId === undefined) query = query.order('saved_at', { ascending: false }).order('item_id', { ascending: true }).limit(MAX_LIST)
    else query = query.eq('item_id', itemId).limit(1)
    const result = await query
    if (result.error || !Array.isArray(result.data)) return noStore(jsonResult(503, { error: 'Workplace saves unavailable' }))
    const rows = result.data.map(mapSave)
    if (rows.some((row) => row === null)) return noStore(jsonResult(503, { error: 'Workplace saves unavailable' }))
    const validRows = rows as SaveRow[]
    const flags = await currentFlags(validRows, deps)
    if (!flags) return noStore(jsonResult(503, { error: 'Workplace publication unavailable' }))
    return noStore(jsonResult(200, { items: validRows.map((row) => responseItem(row, flags.get(row.item_id) === true)) }))
  } catch { return noStore(jsonResult(503, { error: 'Workplace saves unavailable' })) }
}

async function saveItem(body: Record<string, unknown>, userId: string, deps: WorkplaceSavesDeps): Promise<HandlerResult> {
  if (!exactKeys(body, ['itemId', 'revision']) || !validItemId(body.itemId) ||
    !(body.revision === null || validRevision(body.revision))) return noStore(badRequest('invalid Workplace save reference'))
  const entry = (deps.catalog ?? workplaceLearnCatalog).find((candidate) => candidate.id === body.itemId)
  if (!entry) return noStore(jsonResult(409, { error: 'Workplace item is no longer available' }))
  if (entry.access === 'free') {
    if (entry.sampleLabel !== 'non-proprietary-teaching-sample' || body.revision !== null) {
      return noStore(jsonResult(409, { error: 'Workplace save reference is stale' }))
    }
  } else if (!entry.releaseReference || entry.releaseReference.contentId !== entry.id || body.revision !== entry.releaseReference.revision) {
    return noStore(jsonResult(409, { error: 'Workplace save reference is stale' }))
  }
  try {
    const { data, error } = await deps.db.rpc('save_workplace_learn_item', {
      p_user_id: userId, p_item_id: entry.id, p_item_kind: entry.kind, p_revision: body.revision,
    })
    if (error) return noStore(jsonResult(503, { error: 'Workplace save unavailable' }))
    if (!record(data) || data.status === 'stale') return noStore(jsonResult(409, { error: 'Workplace save reference is stale' }))
    const row = mapSave({ item_id: data.item_id, item_kind: data.item_kind, revision: data.revision, saved_at: data.saved_at })
    if (data.status !== 'saved' || !row || row.item_id !== entry.id || row.item_kind !== entry.kind || row.revision !== body.revision) {
      return noStore(jsonResult(503, { error: 'Workplace save unavailable' }))
    }
    return noStore(jsonResult(200, responseItem(row, true)))
  } catch { return noStore(jsonResult(503, { error: 'Workplace save unavailable' })) }
}

async function removeItem(body: Record<string, unknown>, userId: string, deps: WorkplaceSavesDeps): Promise<HandlerResult> {
  if (!exactKeys(body, ['itemId']) || !validItemId(body.itemId)) return noStore(badRequest('invalid Workplace save identity'))
  try {
    const { data, error } = await deps.db.rpc('remove_workplace_learn_item', { p_user_id: userId, p_item_id: body.itemId })
    if (error || !record(data) || data.item_id !== body.itemId || !(data.revision === null || validRevision(data.revision)) ||
      !(data.item_kind === null || validKind(data.item_kind)) || !validTimestamp(data.server_timestamp)) {
      return noStore(jsonResult(503, { error: 'Workplace save unavailable' }))
    }
    return noStore(jsonResult(200, { itemId: data.item_id, kind: data.item_kind, revision: data.revision, serverTimestamp: data.server_timestamp }))
  } catch { return noStore(jsonResult(503, { error: 'Workplace save unavailable' })) }
}

export async function handleWorkplaceSaves(req: HandlerRequest, deps: WorkplaceSavesDeps): Promise<HandlerResult> {
  if (req.method !== 'GET' && req.method !== 'PUT' && req.method !== 'DELETE') return noStore(methodNotAllowed('GET, PUT, DELETE'))
  const member = await requireMember(req, deps)
  if ('result' in member) return member.result
  if (req.method === 'GET') {
    const query = itemIdQuery(req)
    if (query.invalid) return noStore(badRequest('invalid Workplace saves query'))
    return listSaves(member.userId, deps, query.itemId)
  }
  const body = parseBody(req.bodyText)
  if (!body) return noStore(badRequest('invalid Workplace save request'))
  return req.method === 'PUT' ? saveItem(body, member.userId, deps) : removeItem(body, member.userId, deps)
}

export { MAX_BODY_BYTES }
