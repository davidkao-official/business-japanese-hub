/** Validates the one supported path-prefix deployment escape hatch. */
export function resolveDeploymentBase(raw: string | undefined): string {
  const candidate = raw?.trim() || '/'
  if (!candidate.startsWith('/') || candidate.includes('?') || candidate.includes('#')) {
    throw new Error('DEPLOY_BASE_PATH must be an absolute path such as /app/')
  }
  const segments = candidate.split('/').filter(Boolean)
  if (segments.some((segment) => segment === '.' || segment === '..' || !/^[A-Za-z0-9._~-]+$/.test(segment))) {
    throw new Error('DEPLOY_BASE_PATH contains an unsafe path segment')
  }
  return segments.length === 0 ? '/' : `/${segments.join('/')}/`
}
