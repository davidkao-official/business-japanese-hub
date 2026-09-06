import { createHash } from 'node:crypto'
import {
  normalizeCommitSha,
  parseBuildInfo,
  type DeploymentProduct,
} from './deployment-identity'

export interface DeploymentSmokeOptions {
  attempts?: number
  expectedCommitSha?: string
  expectedAssetDigests?: Readonly<Record<string, string>>
  fetcher?: (url: URL) => Promise<Response>
  product?: DeploymentProduct
  retryDelayMs?: number
}

export type { DeploymentProduct } from './deployment-identity'

interface DeploymentSmokeContract {
  directRoutes: readonly string[]
  fingerprint: string
  label: string
  runtimeFingerprints?: readonly string[]
  title: string
}

interface ResolvedDeploymentSmokeOptions {
  attempts: number
  expectedAssetDigests?: Readonly<Record<string, string>>
  expectedCommitSha?: string
  fetcher: (url: URL) => Promise<Response>
  product: DeploymentProduct
  retryDelayMs: number
}

const SMOKE_CONTRACTS: Record<DeploymentProduct, DeploymentSmokeContract> = {
  library: {
    directRoutes: [
      'books/keigo-essentials',
      'books/keigo-essentials/read/keigo-basics',
      'books/meeting-japanese',
      'books/meeting-japanese/read/meeting-purpose',
      'library-link?bookId=book-sample-bj-keigo&chapterId=ch-2',
      'purchase/result?order=deployment-smoke',
    ],
    fingerprint: 'ビジネスシーンで役立つ日本語を学ぶためのプラットフォームです。',
    label: 'Library',
    title: 'ビジネス日本語ハブ',
  },
  'career-game': {
    directRoutes: [
      'cases/rookie-survival',
      'cases/customer-communication',
      'cases/upward-disagreement',
      'case-link?scenarioId=rookie-survival',
      'case-link?scenarioId=customer-communication',
      'case-link?scenarioId=upward-disagreement',
      'cases/unknown-case',
    ],
    fingerprint:
      '日本の職場を舞台に判断と結果を振り返る、Business Japanese Hub の職場シミュレーション。',
    label: 'Career Game',
    runtimeFingerprints: ['rookie-survival', 'customer-communication', 'upward-disagreement'],
    title: 'キャリアゲーム | Business Japanese Hub',
  },
}

const DEFAULT_ATTEMPTS = 6
const DEFAULT_RETRY_DELAY_MS = 2_000
const SCRIPT_OR_STYLE = /\.(?:css|m?js)$/i
const ASSET_ATTRIBUTE = /(?:^|[\s<])(src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/gi
const AUXILIARY_CACHE_CONTROL_HEADERS = [
  'CDN-Cache-Control',
  'Cloudflare-CDN-Cache-Control',
  'Surrogate-Control',
] as const

function deploymentBase(raw: string): URL {
  const base = new URL(raw.endsWith('/') ? raw : `${raw}/`)
  const allowedProtocol =
    base.protocol === 'https:' ||
    (base.protocol === 'http:' && base.hostname === '127.0.0.1')
  if (
    !allowedProtocol ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  ) {
    throw new Error('Deployment URL must be a clean HTTPS URL or an HTTP 127.0.0.1 URL')
  }
  return base
}

async function wait(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function responseMediaType(response: Response): string {
  return response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? ''
}

function expectedAssetMediaTypes(url: URL): readonly string[] | undefined {
  const extension = /\.([a-z0-9]+)$/i.exec(url.pathname)?.[1]?.toLowerCase()
  if (!extension) return undefined
  const expected: Record<string, readonly string[]> = {
    css: ['text/css'],
    gif: ['image/gif'],
    jpeg: ['image/jpeg'],
    jpg: ['image/jpeg'],
    js: ['application/javascript', 'text/javascript'],
    json: ['application/json'],
    mjs: ['application/javascript', 'text/javascript'],
    png: ['image/png'],
    svg: ['image/svg+xml'],
    webp: ['image/webp'],
    woff: ['font/woff', 'application/font-woff'],
    woff2: ['font/woff2'],
  }
  return expected[extension]
}

function isExpectedAssetResponse(url: URL, response: Response): boolean {
  const mediaType = responseMediaType(response)
  if (!response.ok || !mediaType || mediaType === 'text/html') return false
  const expected = expectedAssetMediaTypes(url)
  return expected ? expected.includes(mediaType) : true
}

function assertRequestedUrl(response: Response, requestedUrl: URL, label: string): void {
  if (response.redirected || (response.url && response.url !== requestedUrl.href)) {
    throw new Error(`Deployment smoke ${label} changed the requested URL`)
  }
}

function cacheControlDirectives(raw: string | null): string[] {
  if (raw === null) return []

  const directives: string[] = []
  let directive = ''
  let quoted = false
  let escaped = false
  for (const character of raw) {
    if (escaped) {
      directive += character
      escaped = false
      continue
    }
    if (character === '\\' && quoted) {
      directive += character
      escaped = true
      continue
    }
    if (character === '"') {
      quoted = !quoted
      directive += character
      continue
    }
    if (character === ',' && !quoted) {
      const normalized = directive.trim().toLowerCase()
      if (normalized) directives.push(normalized)
      directive = ''
      continue
    }
    directive += character
  }
  const normalized = directive.trim().toLowerCase()
  if (normalized) directives.push(normalized)
  return directives
}

function isUnsafeCacheDirective(directive: string): boolean {
  if (
    directive === 'immutable' ||
    directive.startsWith('stale-while-revalidate') ||
    directive.startsWith('stale-if-error') ||
    /^(?:no-store|no-cache|private)\s*=/.test(directive)
  ) {
    return true
  }

  if (directive.startsWith('max-age') || directive.startsWith('s-maxage')) {
    const match = /^(max-age|s-maxage)\s*=\s*"?(\d+)"?$/.exec(directive)
    return !match || Number(match[2]) > 0
  }

  return false
}

function assertNoUnsafeCacheDirectives(
  directives: readonly string[],
  label: string,
  headerName: string,
): void {
  for (const directive of directives) {
    if (isUnsafeCacheDirective(directive)) {
      throw new Error(`Deployment smoke ${label} has unsafe ${headerName}: ${directive}`)
    }
  }
}

function assertHtmlCachePolicy(
  directives: readonly string[],
  label: string,
  headerName: string,
): void {
  if (directives.length === 0) {
    throw new Error(`Deployment smoke ${label} has unsafe ${headerName}: header is missing`)
  }

  assertNoUnsafeCacheDirectives(directives, label, headerName)

  const hasUnqualifiedNoStoreOrNoCache = directives.some(
    (directive) => directive === 'no-store' || directive === 'no-cache',
  )
  const hasZeroMaxAgeWithMustRevalidate =
    directives.some((directive) => /^max-age\s*=\s*"?0"?$/.test(directive)) &&
    directives.includes('must-revalidate')
  const hasImmediateRevalidation =
    hasUnqualifiedNoStoreOrNoCache || hasZeroMaxAgeWithMustRevalidate
  if (!hasImmediateRevalidation) {
    throw new Error(
      `Deployment smoke ${label} has unsafe ${headerName}: HTML must use no-store, no-cache, or max-age=0 with must-revalidate`,
    )
  }
}

function assertNoUnsafeAuxiliaryCacheHeaders(response: Response, label: string): void {
  for (const headerName of AUXILIARY_CACHE_CONTROL_HEADERS) {
    if (!response.headers.has(headerName)) continue
    assertHtmlCachePolicy(cacheControlDirectives(response.headers.get(headerName)), label, headerName)
  }
}

function assertSafeHtmlCache(response: Response, label: string): void {
  const directives = cacheControlDirectives(response.headers.get('cache-control'))
  assertHtmlCachePolicy(directives, label, 'cache-control')
  assertNoUnsafeAuxiliaryCacheHeaders(response, label)
}

function assertBuildInfoNoStore(response: Response): void {
  const directives = cacheControlDirectives(response.headers.get('cache-control'))
  if (!directives.includes('no-store')) {
    throw new Error('Deployment smoke build-info cache-control must include no-store')
  }
  assertNoUnsafeCacheDirectives(directives, 'build-info', 'cache-control')
  for (const headerName of AUXILIARY_CACHE_CONTROL_HEADERS) {
    if (!response.headers.has(headerName)) continue
    const auxiliaryDirectives = cacheControlDirectives(response.headers.get(headerName))
    if (!auxiliaryDirectives.includes('no-store')) {
      throw new Error(`Deployment smoke build-info has unsafe ${headerName}: must include no-store`)
    }
    assertNoUnsafeCacheDirectives(auxiliaryDirectives, 'build-info', headerName)
  }
}

function sha256Hex(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex')
}

async function assetBody(
  response: Response,
  url: URL,
  options: ResolvedDeploymentSmokeOptions,
): Promise<string> {
  const body = await response.text()
  const expectedDigest = options.expectedAssetDigests?.[url.pathname]
  if (SCRIPT_OR_STYLE.test(url.pathname) && options.expectedAssetDigests && !expectedDigest) {
    throw new Error(`Deployment smoke found an unexpected built asset URL: ${url.pathname}`)
  }
  if (expectedDigest && sha256Hex(body) !== expectedDigest) {
    throw new Error(`Deployment smoke asset content does not match the local artifact: ${url.pathname}`)
  }
  return body
}

function assetReferences(rootHtml: string, base: URL): string[] {
  const references = new Set<string>()
  for (const match of rootHtml.matchAll(ASSET_ATTRIBUTE)) {
    const reference = match[2] ?? match[3] ?? match[4]
    if (!reference) continue

    let assetUrl: URL
    try {
      assetUrl = new URL(reference, base)
    } catch {
      continue
    }

    const isScriptOrStyle = SCRIPT_OR_STYLE.test(assetUrl.pathname)
    if (
      assetUrl.origin === base.origin &&
      (isScriptOrStyle || assetUrl.pathname.includes('/assets/'))
    ) {
      references.add(reference)
    }
  }
  return [...references]
}

async function fetchWithRetry(
  url: URL,
  accept: (response: Response) => boolean | Promise<boolean | string>,
  label: string,
  options: ResolvedDeploymentSmokeOptions,
): Promise<Response> {
  let lastStatus = 'no response'
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      const response = await options.fetcher(url)
      lastStatus = `HTTP ${response.status}`
      const accepted = await accept(response)
      if (accepted === true) return response
      if (typeof accepted === 'string') lastStatus = accepted
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : 'network error'
    }
    if (attempt < options.attempts) await wait(options.retryDelayMs)
  }
  throw new Error(`Deployment smoke failed for ${label}: ${lastStatus}`)
}

/** Verify the deployed SPA root, exact source identity, cache policy, and history fallback. */
export async function verifyDeployment(
  rawBaseUrl: string,
  partialOptions: DeploymentSmokeOptions = {},
): Promise<void> {
  const base = deploymentBase(rawBaseUrl)
  const product = partialOptions.product ?? 'library'
  const contract = SMOKE_CONTRACTS[product]
  const expectedCommitSha = partialOptions.expectedCommitSha
    ? normalizeCommitSha(partialOptions.expectedCommitSha, 'expected deployment commit SHA')
    : undefined
  const options: ResolvedDeploymentSmokeOptions = {
    attempts: partialOptions.attempts ?? DEFAULT_ATTEMPTS,
    expectedAssetDigests: partialOptions.expectedAssetDigests,
    expectedCommitSha,
    fetcher:
      partialOptions.fetcher ??
      ((url) => fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) })),
    product,
    retryDelayMs: partialOptions.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
  }
  if (!Number.isInteger(options.attempts) || options.attempts < 1) {
    throw new Error('Deployment smoke attempts must be a positive integer')
  }

  const buildInfoUrl = new URL('build-info.json', base)
  const buildInfoResponse = await fetchWithRetry(
    buildInfoUrl,
    async (response) => {
      if (!response.ok || responseMediaType(response) !== 'application/json') return false
      try {
        const candidate = parseBuildInfo(await response.clone().json())
        if (candidate.product !== product) {
          return `build-info identifies ${candidate.product}, expected ${product}`
        }
        if (expectedCommitSha && candidate.commitSha !== expectedCommitSha) {
          return `expected commit ${expectedCommitSha} but build-info reports ${candidate.commitSha}`
        }
        return true
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'invalid JSON'
        return `invalid build-info: ${detail}`
      }
    },
    'build-info',
    options,
  )
  assertRequestedUrl(buildInfoResponse, buildInfoUrl, 'build-info')
  assertBuildInfoNoStore(buildInfoResponse)

  let buildInfo
  try {
    buildInfo = parseBuildInfo(await buildInfoResponse.json())
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'invalid JSON'
    throw new Error(`Deployment smoke found invalid build-info: ${detail}`)
  }
  if (buildInfo.product !== product) {
    throw new Error(
      `Deployment smoke build-info identifies ${buildInfo.product}, expected ${product}`,
    )
  }
  if (expectedCommitSha && buildInfo.commitSha !== expectedCommitSha) {
    throw new Error(
      `Deployment smoke expected commit ${expectedCommitSha} but build-info reports ${buildInfo.commitSha}`,
    )
  }

  const expectedHtmlMarker = `<meta name="bjh-build" content="${product}:${buildInfo.commitSha}" />`
  const rootResponse = await fetchWithRetry(
    base,
    async (response) => {
      if (!response.ok) return false
      if (responseMediaType(response) !== 'text/html') {
        return 'root has an unexpected content-type'
      }
      return (await response.clone().text()).includes(expectedHtmlMarker)
        ? true
        : 'HTML build identity does not match build-info'
    },
    'root',
    options,
  )
  assertRequestedUrl(rootResponse, base, 'root')
  assertSafeHtmlCache(rootResponse, 'root')
  const rootHtml = await rootResponse.text()
  if (!rootHtml.includes(contract.fingerprint)) {
    throw new Error(`Deployment smoke found the wrong ${contract.label} app fingerprint`)
  }
  if (!rootHtml.includes(`<title>${contract.title}</title>`)) {
    throw new Error(`Deployment smoke found the wrong ${contract.label} document title`)
  }
  if (!rootHtml.includes(expectedHtmlMarker)) {
    throw new Error('Deployment smoke HTML build identity does not match build-info')
  }

  const assetRefs = assetReferences(rootHtml, base)
  if (assetRefs.length === 0) throw new Error('Deployment smoke found no built assets')

  const javascriptBodies: string[] = []
  for (const ref of assetRefs) {
    const assetUrl = new URL(ref, base)
    const response = await fetchWithRetry(
      assetUrl,
      (response) => isExpectedAssetResponse(assetUrl, response),
      `asset ${ref} content-type`,
      options,
    )
    assertRequestedUrl(response, assetUrl, `asset ${ref}`)
    const body = await assetBody(response, assetUrl, options)
    if (/\.(?:m?js)$/i.test(assetUrl.pathname)) {
      javascriptBodies.push(body)
    }
  }

  for (const route of contract.directRoutes) {
    const routeUrl = new URL(route, base)
    const response = await fetchWithRetry(
      routeUrl,
      async (candidate) => {
        if (!candidate.ok) return false
        if (responseMediaType(candidate) !== 'text/html') {
          return `direct route ${route} has an unexpected content-type`
        }
        return (await candidate.clone().text()) === rootHtml
          ? true
          : 'received a non-SPA fallback'
      },
      `direct route ${route}`,
      options,
    )
    assertRequestedUrl(response, routeUrl, `direct route ${route}`)
    if (responseMediaType(response) !== 'text/html') {
      throw new Error(`Deployment smoke direct route ${route} has an unexpected content-type`)
    }
    assertSafeHtmlCache(response, `direct route ${route}`)
    const body = await response.text()
    if (body !== rootHtml) {
      throw new Error(`Deployment smoke received a non-SPA fallback for ${route}`)
    }
  }

  if (contract.runtimeFingerprints?.length) {
    const runtime = javascriptBodies.join('\n')
    for (const fingerprint of contract.runtimeFingerprints) {
      if (!runtime.includes(fingerprint)) {
        throw new Error(
          `Deployment smoke could not find ${contract.label} runtime catalog marker ${fingerprint}`,
        )
      }
    }
  }
}
