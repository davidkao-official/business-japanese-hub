export interface DeploymentSmokeOptions {
  attempts?: number;
  fetcher?: (url: URL) => Promise<Response>;
  product?: DeploymentProduct;
  retryDelayMs?: number;
}

export type DeploymentProduct = 'library' | 'career-game'

interface DeploymentSmokeContract {
  directRoutes: readonly string[]
  fingerprint: string
  label: string
  runtimeFingerprints?: readonly string[]
  title: string
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

const DEFAULT_ATTEMPTS = 6;
const DEFAULT_RETRY_DELAY_MS = 2_000;

function deploymentBase(raw: string): URL {
  const base = new URL(raw.endsWith('/') ? raw : `${raw}/`);
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
    throw new Error('Deployment URL must be a clean HTTPS URL or an HTTP 127.0.0.1 URL');
  }
  return base;
}

async function wait(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
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

async function fetchWithRetry(
  url: URL,
  accept: (response: Response) => boolean,
  label: string,
  options: Required<DeploymentSmokeOptions>,
): Promise<Response> {
  let lastStatus = 'no response';
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      const response = await options.fetcher(url);
      lastStatus = `HTTP ${response.status}`;
      if (accept(response)) return response;
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : 'network error';
    }
    if (attempt < options.attempts) await wait(options.retryDelayMs);
  }
  throw new Error(`Deployment smoke failed for ${label}: ${lastStatus}`);
}

/** Verify the deployed SPA root, built assets, and history-routing fallback. */
export async function verifyDeployment(
  rawBaseUrl: string,
  partialOptions: DeploymentSmokeOptions = {},
): Promise<void> {
  const base = deploymentBase(rawBaseUrl);
  const contract = SMOKE_CONTRACTS[partialOptions.product ?? 'library']
  const options: Required<DeploymentSmokeOptions> = {
    attempts: partialOptions.attempts ?? DEFAULT_ATTEMPTS,
    fetcher:
      partialOptions.fetcher ??
      ((url) => fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) })),
    product: partialOptions.product ?? 'library',
    retryDelayMs: partialOptions.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
  };
  if (!Number.isInteger(options.attempts) || options.attempts < 1) {
    throw new Error('Deployment smoke attempts must be a positive integer');
  }

  const rootResponse = await fetchWithRetry(base, (response) => response.ok, 'root', options);
  assertRequestedUrl(rootResponse, base, 'root')
  if (responseMediaType(rootResponse) !== 'text/html') {
    throw new Error('Deployment smoke root has an unexpected content-type')
  }
  const rootHtml = await rootResponse.text();
  if (!rootHtml.includes(contract.fingerprint)) {
    throw new Error(`Deployment smoke found the wrong ${contract.label} app fingerprint`)
  }
  if (!rootHtml.includes(`<title>${contract.title}</title>`)) {
    throw new Error(`Deployment smoke found the wrong ${contract.label} document title`)
  }
  const assetRefs = [
    ...new Set(
      [...rootHtml.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map(
        (match) => match[1],
      ),
    ),
  ];
  if (assetRefs.length === 0) throw new Error('Deployment smoke found no built assets');

  const javascriptBodies: string[] = [];
  for (const ref of assetRefs) {
    const assetUrl = new URL(ref, base)
    const response = await fetchWithRetry(
      assetUrl,
      (response) => isExpectedAssetResponse(assetUrl, response),
      `asset ${ref} content-type`,
      options,
    );
    assertRequestedUrl(response, assetUrl, `asset ${ref}`)
    if (/\.(?:m?js)$/i.test(assetUrl.pathname)) {
      javascriptBodies.push(await response.text())
    }
  }

  for (const route of contract.directRoutes) {
    const routeUrl = new URL(route, base)
    const response = await fetchWithRetry(
      routeUrl,
      (candidate) => candidate.ok,
      `direct route ${route}`,
      options,
    );
    assertRequestedUrl(response, routeUrl, `direct route ${route}`)
    if (responseMediaType(response) !== 'text/html') {
      throw new Error(`Deployment smoke direct route ${route} has an unexpected content-type`)
    }
    const body = await response.text();
    if (body !== rootHtml) {
      throw new Error(`Deployment smoke received a non-SPA fallback for ${route}`);
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
