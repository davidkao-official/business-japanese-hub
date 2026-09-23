/** Public-Git boundary helpers for private Workplace Learn authoring artifacts. */
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
export function isContractShapedWorkplaceAuthoringJson(text: string): boolean {
  let value: unknown
  try {
    value = JSON.parse(text.startsWith('\uFEFF') ? text.slice(1) : text)
  } catch {
    return false
  }
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

/** Detects a serialized Plus runtime body or its bounded delivery payload wrapper. */
export function isContractShapedPrivateWorkplaceRuntimeJson(text: string): boolean {
  let value: unknown
  try {
    value = JSON.parse(text.startsWith('\uFEFF') ? text.slice(1) : text)
  } catch {
    return false
  }
  if (isWorkplaceRuntimeItem(value)) return true
  return record(value)
    && Object.keys(value).length === 1
    && isWorkplaceRuntimeItem(value.workplaceLearn)
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
