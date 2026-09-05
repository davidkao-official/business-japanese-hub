import { execFileSync } from 'node:child_process'

export type DeploymentProduct = 'library' | 'career-game'

export interface DeploymentBuildInfo {
  schemaVersion: 1
  product: DeploymentProduct
  commitSha: string
}

const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/i

export function normalizeCommitSha(raw: string, label = 'deployment commit SHA'): string {
  const commitSha = raw.trim().toLowerCase()
  if (!COMMIT_SHA_PATTERN.test(commitSha)) {
    throw new Error(`${label} must be a 40-character hexadecimal commit SHA`)
  }
  return commitSha
}

export interface ResolveBuildCommitShaOptions {
  env?: Record<string, string | undefined>
  readGitHead?: () => string
}

/**
 * Resolve the immutable source identity embedded into a frontend build.
 * Cloudflare Pages injects CF_PAGES_COMMIT_SHA. Other exact-checkout builds use
 * Git HEAD so the public artifact can still be tied back to one repository ref.
 */
export function resolveBuildCommitSha(
  options: ResolveBuildCommitShaOptions = {},
): string {
  const env = options.env ?? process.env
  const cloudflareCommit = env.CF_PAGES_COMMIT_SHA?.trim()
  if (cloudflareCommit) {
    return normalizeCommitSha(cloudflareCommit, 'CF_PAGES_COMMIT_SHA')
  }

  const readGitHead =
    options.readGitHead ??
    (() =>
      execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }))
  return normalizeCommitSha(readGitHead(), 'Git HEAD commit SHA')
}

export function createBuildInfo(
  product: DeploymentProduct,
  commitSha: string,
): DeploymentBuildInfo {
  return {
    schemaVersion: 1,
    product,
    commitSha: normalizeCommitSha(commitSha),
  }
}

export function parseBuildInfo(raw: unknown): DeploymentBuildInfo {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('deployment build-info must be a JSON object')
  }

  const candidate = raw as Record<string, unknown>
  if (candidate.schemaVersion !== 1) {
    throw new Error('deployment build-info has an unsupported schemaVersion')
  }
  if (candidate.product !== 'library' && candidate.product !== 'career-game') {
    throw new Error('deployment build-info has an invalid product')
  }
  if (typeof candidate.commitSha !== 'string') {
    throw new Error('deployment build-info is missing commitSha')
  }

  return createBuildInfo(candidate.product, candidate.commitSha)
}
