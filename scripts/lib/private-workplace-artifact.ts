/** Public-Git boundary helpers for private Workplace Learn authoring artifacts. */
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const MAX_JSON_NODES = 10_000
const MAX_JSON_DEPTH = 64

/** Traverse parsed JSON with hard bounds; a bound hit fails closed as a match. */
function containsShape(value: unknown, matches: (candidate: unknown) => boolean): boolean {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }]
  let visited = 0
  while (pending.length > 0) {
    const current = pending.pop()!
    visited += 1
    if (visited > MAX_JSON_NODES || current.depth > MAX_JSON_DEPTH) return true
    if (matches(current.value)) return true

    if (Array.isArray(current.value)) {
      if (current.value.length > MAX_JSON_NODES - visited - pending.length) return true
      for (const child of current.value) pending.push({ value: child, depth: current.depth + 1 })
    } else if (record(current.value)) {
      const keys = Object.keys(current.value)
      if (keys.length > MAX_JSON_NODES - visited - pending.length) return true
      for (const key of keys) pending.push({ value: current.value[key], depth: current.depth + 1 })
    }
  }
  return false
}

export function isCanonicalPrivateWorkplaceFilename(path: string): boolean {
  return (path.split(/[/\\]/).at(-1) ?? '') === 'workplace-item.json'
}

/** Identifies a complete lesson/vocabulary content body without inspecting prose heuristically. */
function isWorkplaceRuntimeItem(value: unknown): boolean {
  if (!record(value) || value.schemaVersion !== 1 || !['lesson', 'vocabulary'].includes(String(value.kind))) return false
  if (typeof value.id !== 'string' || typeof value.slug !== 'string' || value.access !== 'plus') return false
  if (value.kind === 'lesson') {
    return typeof value.situation === 'string'
      && typeof value.meaningInContextZhTW === 'string'
      && typeof value.whatToSayJapanese === 'string'
      && Array.isArray(value.examples)
  }
  return typeof value.term === 'string'
    && typeof value.reading === 'string'
    && typeof value.meaningZhTW === 'string'
    && typeof value.workplaceNuanceZhTW === 'string'
    && record(value.example)
}

/** Detects a renamed complete private authoring record, not a runtime fixture. */
function isWorkplaceAuthoringItem(value: unknown): boolean {
  if (!record(value) || value.schemaVersion !== 1 || !['lesson', 'vocabulary'].includes(String(value.kind))) return false
  if (typeof value.id !== 'string' || typeof value.slug !== 'string' || typeof value.access !== 'string') return false
  if (!record(value.publication) || !['draft', 'released'].includes(String(value.publication.status))) return false
  if (!record(value.rights) || !['pending', 'cleared'].includes(String(value.rights.status)) || value.rights.basis !== 'original') return false
  if (typeof value.rights.attestation !== 'string') return false
  if (value.kind === 'lesson') {
    return typeof value.situation === 'string'
      && typeof value.whatToSayJapanese === 'string'
      && Array.isArray(value.examples)
      && typeof value.meaningInContextZhTW === 'string'
  }
  return typeof value.term === 'string'
    && typeof value.reading === 'string'
    && typeof value.meaningZhTW === 'string'
    && typeof value.workplaceNuanceZhTW === 'string'
    && record(value.example)
}

export function isContractShapedWorkplaceAuthoringJson(text: string): boolean {
  let value: unknown
  try {
    value = JSON.parse(text.startsWith('\uFEFF') ? text.slice(1) : text)
  } catch {
    return false
  }
  return containsShape(value, isWorkplaceAuthoringItem)
}

/** Detects a serialized Plus runtime body or its bounded delivery payload wrapper. */
export function isContractShapedPrivateWorkplaceRuntimeJson(text: string): boolean {
  let value: unknown
  try {
    value = JSON.parse(text.startsWith('\uFEFF') ? text.slice(1) : text)
  } catch {
    return false
  }
  return containsShape(value, (candidate) => {
    if (isWorkplaceRuntimeItem(candidate)) return true
    if (!record(candidate)) return false
    if (isWorkplaceRuntimeItem(candidate.workplaceLearn)) return true
    if (record(candidate.payload) && isWorkplaceRuntimeItem(candidate.payload.workplaceLearn)) return true
    return record(candidate.content)
      && record(candidate.content.payload)
      && isWorkplaceRuntimeItem(candidate.content.payload.workplaceLearn)
  })
}

export function privateWorkplaceArtifactReason(
  path: string,
  text: string,
): 'canonical filename' | 'authoring shape' | 'Plus runtime shape' | null {
  if (isCanonicalPrivateWorkplaceFilename(path)) return 'canonical filename'
  if (isContractShapedWorkplaceAuthoringJson(text)) return 'authoring shape'
  if (isContractShapedPrivateWorkplaceRuntimeJson(text)) return 'Plus runtime shape'
  return null
}
