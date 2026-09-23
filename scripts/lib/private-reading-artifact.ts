/** Public-Git admission for the private Business Reading authoring artifact. */

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The documented external authoring filename is reserved anywhere in public Git. */
export function isCanonicalPrivateReadingFilename(path: string): boolean {
  return (path.split(/[/\\]/).at(-1) ?? '') === 'reading-item.json'
}

/** A renamed complete authoring record is still private, regardless of extension. */
export function isContractShapedReadingAuthoringJson(text: string): boolean {
  let value: unknown
  try {
    value = JSON.parse(text.startsWith('\uFEFF') ? text.slice(1) : text)
  } catch {
    return false
  }
  if (!record(value) || value.schemaVersion !== 1 || typeof value.id !== 'string' || typeof value.slug !== 'string') return false
  if (!record(value.publication) || !['draft', 'released'].includes(String(value.publication.status))) return false
  if (!record(value.rights) || typeof value.rights.basis !== 'string' || typeof value.rights.status !== 'string') return false
  if (!record(value.japaneseMaterial) || typeof value.japaneseMaterial.text !== 'string') return false
  return typeof value.explanationZhTW === 'string' && typeof value.businessContextZhTW === 'string'
}

export function privateReadingArtifactReason(path: string, text: string): 'canonical filename' | 'authoring shape' | null {
  if (isCanonicalPrivateReadingFilename(path)) return 'canonical filename'
  if (isContractShapedReadingAuthoringJson(text)) return 'authoring shape'
  return null
}
