import { describe, expect, it } from 'vitest'
import {
  createBuildInfo,
  resolveBuildCommitSha,
} from '../../scripts/lib/deployment-identity'
import { verifyDeployment } from '../../scripts/lib/deployment-smoke'

const expectedSha = '1111111111111111111111111111111111111111'
const staleSha = '2222222222222222222222222222222222222222'
const safeHtmlCache = 'public, max-age=0, must-revalidate'

function libraryHtml(commitSha: string, assetPrefix = 'index-a1b2c3d4'): string {
  return `<!doctype html>
<html>
  <head>
    <meta name="bjh-build" content="library:${commitSha}" />
    <title>ビジネス日本語ハブ</title>
    <link rel="stylesheet" href="/assets/${assetPrefix}.css" />
  </head>
  <body>
    <p>ビジネスシーンで役立つ日本語を学ぶためのプラットフォームです。</p>
    <script type="module" src="/assets/${assetPrefix}.js"></script>
  </body>
</html>`
}

interface FakeDeploymentOptions {
  buildInfoCache?: string
  buildInfoSha?: string
  htmlCache?: string
  htmlSha?: string
  routeCache?: Record<string, string>
  assetPrefix?: string
}

function fakeLibraryDeployment({
  buildInfoCache = 'no-store',
  buildInfoSha = expectedSha,
  htmlCache = safeHtmlCache,
  htmlSha = expectedSha,
  routeCache = {},
  assetPrefix = 'index-a1b2c3d4',
}: FakeDeploymentOptions = {}): (url: URL) => Promise<Response> {
  const html = libraryHtml(htmlSha, assetPrefix)
  return async (url) => {
    if (url.pathname === '/build-info.json') {
      return new Response(JSON.stringify(createBuildInfo('library', buildInfoSha)), {
        status: 200,
        headers: {
          'cache-control': buildInfoCache,
          'content-type': 'application/json',
        },
      })
    }

    if (url.pathname.startsWith('/assets/')) {
      const isCss = url.pathname.endsWith('.css')
      return new Response(isCss ? 'body{}' : 'console.log("built")', {
        status: 200,
        headers: {
          'content-type': isCss ? 'text/css' : 'application/javascript',
        },
      })
    }

    return new Response(html, {
      status: 200,
      headers: {
        'cache-control': routeCache[url.pathname] ?? htmlCache,
        'content-type': 'text/html',
      },
    })
  }
}

describe('deployment build identity', () => {
  it('prefers the Cloudflare Pages commit SHA over the local Git fallback', () => {
    let fallbackReads = 0
    const resolved = resolveBuildCommitSha({
      env: { CF_PAGES_COMMIT_SHA: expectedSha },
      readGitHead: () => {
        fallbackReads += 1
        return staleSha
      },
    })

    expect(resolved).toBe(expectedSha)
    expect(fallbackReads).toBe(0)
  })

  it('uses the exact local Git HEAD when Cloudflare does not provide a commit SHA', () => {
    expect(
      resolveBuildCommitSha({
        env: {},
        readGitHead: () => ` ${expectedSha}\n`,
      }),
    ).toBe(expectedSha)
  })

  it('rejects malformed source identities instead of publishing an ambiguous build', () => {
    expect(() =>
      resolveBuildCommitSha({
        env: { CF_PAGES_COMMIT_SHA: 'main' },
        readGitHead: () => expectedSha,
      }),
    ).toThrow(/commit SHA/i)
  })

  it('emits a deterministic versioned public build record', () => {
    expect(createBuildInfo('career-game', expectedSha)).toEqual({
      schemaVersion: 1,
      product: 'career-game',
      commitSha: expectedSha,
    })
  })
})

describe('deployment exact-head and cache smoke', () => {
  it('accepts a deployment whose HTML, build record, cache policy, and assets match', async () => {
    await expect(
      verifyDeployment('https://example.pages.dev/', {
        attempts: 1,
        expectedCommitSha: expectedSha,
        fetcher: fakeLibraryDeployment(),
        product: 'library',
        retryDelayMs: 0,
      }),
    ).resolves.toBeUndefined()
  })

  it('rejects a stale build record even when the product fingerprint is unchanged', async () => {
    await expect(
      verifyDeployment('https://example.pages.dev/', {
        attempts: 1,
        expectedCommitSha: expectedSha,
        fetcher: fakeLibraryDeployment({ buildInfoSha: staleSha, htmlSha: staleSha }),
        product: 'library',
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/expected commit/i)
  })

  it('rejects stale HTML even when build-info already exposes the new commit', async () => {
    await expect(
      verifyDeployment('https://example.pages.dev/', {
        attempts: 1,
        expectedCommitSha: expectedSha,
        fetcher: fakeLibraryDeployment({ htmlSha: staleSha }),
        product: 'library',
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/HTML build identity/i)
  })

  it('rejects browser-cacheable HTML with a positive max-age', async () => {
    await expect(
      verifyDeployment('https://example.pages.dev/', {
        attempts: 1,
        expectedCommitSha: expectedSha,
        fetcher: fakeLibraryDeployment({ htmlCache: 'public, max-age=3600' }),
        product: 'library',
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/unsafe cache-control/i)
  })

  it('checks the cache policy on SPA fallback routes as well as the root', async () => {
    await expect(
      verifyDeployment('https://example.pages.dev/', {
        attempts: 1,
        expectedCommitSha: expectedSha,
        fetcher: fakeLibraryDeployment({
          routeCache: { '/books/keigo-essentials': 'public, max-age=600' },
        }),
        product: 'library',
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/direct route books\/keigo-essentials.*unsafe cache-control/i)
  })

  it('requires build-info to bypass browser storage', async () => {
    await expect(
      verifyDeployment('https://example.pages.dev/', {
        attempts: 1,
        expectedCommitSha: expectedSha,
        fetcher: fakeLibraryDeployment({ buildInfoCache: safeHtmlCache }),
        product: 'library',
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/build-info.*no-store/i)
  })

  it('rejects reusable JS/CSS asset URLs without a content fingerprint', async () => {
    await expect(
      verifyDeployment('https://example.pages.dev/', {
        attempts: 1,
        expectedCommitSha: expectedSha,
        fetcher: fakeLibraryDeployment({ assetPrefix: 'index' }),
        product: 'library',
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/fingerprinted asset/i)
  })
})
