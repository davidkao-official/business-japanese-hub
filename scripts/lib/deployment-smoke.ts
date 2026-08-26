export interface DeploymentSmokeOptions {
  attempts?: number;
  fetcher?: (url: URL) => Promise<Response>;
  retryDelayMs?: number;
}

const DEFAULT_ATTEMPTS = 6;
const DEFAULT_RETRY_DELAY_MS = 2_000;

function deploymentBase(raw: string): URL {
  const base = new URL(raw.endsWith('/') ? raw : `${raw}/`);
  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  ) {
    throw new Error('Deployment URL must be a clean HTTPS URL');
  }
  return base;
}

async function wait(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
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
  const options: Required<DeploymentSmokeOptions> = {
    attempts: partialOptions.attempts ?? DEFAULT_ATTEMPTS,
    fetcher:
      partialOptions.fetcher ??
      ((url) => fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15_000) })),
    retryDelayMs: partialOptions.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
  };
  if (!Number.isInteger(options.attempts) || options.attempts < 1) {
    throw new Error('Deployment smoke attempts must be a positive integer');
  }

  const rootResponse = await fetchWithRetry(base, (response) => response.ok, 'root', options);
  const rootHtml = await rootResponse.text();
  const assetRefs = [
    ...new Set(
      [...rootHtml.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map(
        (match) => match[1],
      ),
    ),
  ];
  if (assetRefs.length === 0) throw new Error('Deployment smoke found no built assets');

  for (const ref of assetRefs) {
    await fetchWithRetry(
      new URL(ref, base),
      (response) => response.ok,
      `asset ${ref}`,
      options,
    );
  }

  const directRoutes = [
    'books/deployment-smoke',
    'purchase/result?order=deployment-smoke',
  ];
  for (const route of directRoutes) {
    const response = await fetchWithRetry(
      new URL(route, base),
      (candidate) => candidate.ok,
      `direct route ${route}`,
      options,
    );
    const body = await response.text();
    if (body !== rootHtml) {
      throw new Error(`Deployment smoke received a non-SPA fallback for ${route}`);
    }
  }
}
