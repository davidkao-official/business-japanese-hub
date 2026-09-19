/**
 * Decodes only the untrusted subject claim needed to bind a browser bearer to
 * the UI identity that initiated an authenticated request. Server validation
 * remains the authorization authority.
 */
export function tokenSubject(token: string): string | null {
  const encodedPayload = token.split('.')[1]
  if (!encodedPayload) return null
  try {
    const normalized = encodedPayload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const payload = JSON.parse(globalThis.atob(padded)) as { sub?: unknown }
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}
