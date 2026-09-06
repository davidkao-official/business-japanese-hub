import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createBuildInfo,
  resolveCheckoutCommitSha,
  resolveBuildCommitSha,
  resolveExpectedDeploymentSha,
} from '../../scripts/lib/deployment-identity'
import { verifyDeployment } from '../../scripts/lib/deployment-smoke'

const expectedSha = '1111111111111111111111111111111111111111'
const staleSha = '2222222222222222222222222222222222222222'
const safeHtmlCache = 'public, max-age=0, must-revalidate'

function libraryHtml(
  commitSha: string,
  assetPrefix = 'index-a1b2c3d4',
  assetPath = '/assets',
): string {
  return `<!doctype html>
<html>
  <head>
    <meta name="bjh-build" content="library:${commitSha}" />
    <title>ビジネス日本語ハブ</title>
    <link rel="stylesheet" href="${assetPath}/${assetPrefix}.css" />
  </head>
  <body>
    <p>ビジネスシーンで役立つ日本語を学ぶためのプラットフォームです。</p>
    <script type="module" src="${assetPath}/${assetPrefix}.js"></script>
  </body>
</html>`
}

interface FakeDeploymentOptions {
  buildInfoHeaders?: Record<string, string>
  buildInfoCache?: string
  buildInfoSha?: string
  htmlHeaders?: Record<string, string>
  htmlCache?: string
  htmlSha?: string
  html?: string
  routeCache?: Record<string, string>
  assetPrefix?: string
  assetPath?: string
}

function fakeLibraryDeployment({
  buildInfoHeaders = {},
  buildInfoCache = 'no-store',
  buildInfoSha = expectedSha,
  htmlHeaders = {},
  htmlCache = safeHtmlCache,
  htmlSha = expectedSha,
  routeCache = {},
  assetPrefix = 'index-a1b2c3d4',
  assetPath = '/assets',
  html: htmlOverride,
}: FakeDeploymentOptions = {}): (url: URL) => Promise<Response> {
  const html = htmlOverride ?? libraryHtml(htmlSha, assetPrefix, assetPath)
  return async (url) => {
    if (url.pathname === '/build-info.json') {
      return new Response(JSON.stringify(createBuildInfo('library', buildInfoSha)), {
        status: 200,
        headers: {
          'cache-control': buildInfoCache,
          'content-type': 'application/json',
          ...buildInfoHeaders,
        },
      })
    }

    if (/\.(?:css|m?js)$/i.test(url.pathname)) {
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
        ...htmlHeaders,
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

  it('resolves built-artifact smoke expectations from checkout HEAD even with ambient Pages identity', () => {
    expect(resolveCheckoutCommitSha(() => ` ${expectedSha}\n`)).toBe(expectedSha)
  })

  it('rejects malformed source identities instead of publishing an ambiguous build', () => {
    expect(() =>
      resolveBuildCommitSha({
        env: { CF_PAGES_COMMIT_SHA: 'main' },
        readGitHead: () => expectedSha,
      }),
    ).toThrow(/commit SHA/i)
  })

  it('lets an aggregate production smoke carry independent product revisions', () => {
    const env = {
      EXPECTED_LIBRARY_DEPLOYMENT_SHA: expectedSha,
      EXPECTED_CAREER_GAME_DEPLOYMENT_SHA: staleSha,
    }

    expect(resolveExpectedDeploymentSha('library', { env })).toBe(expectedSha)
    expect(resolveExpectedDeploymentSha('career-game', { env })).toBe(staleSha)
  })

  it('uses explicit SHA before product-specific, generic, or Git fallbacks', () => {
    expect(
      resolveExpectedDeploymentSha('library', {
        explicitSha: staleSha,
        env: {
          EXPECTED_LIBRARY_DEPLOYMENT_SHA: expectedSha,
          EXPECTED_DEPLOYMENT_SHA: expectedSha,
        },
        readGitHead: () => expectedSha,
      }),
    ).toBe(staleSha)
  })

  it('uses checkout Git HEAD for the default expected SHA despite ambient Pages build identity', () => {
    expect(
      resolveExpectedDeploymentSha('library', {
        env: { CF_PAGES_COMMIT_SHA: staleSha },
        readGitHead: () => expectedSha,
      }),
    ).toBe(expectedSha)
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

  it('retries a stale build-info identity until the expected commit is active', async () => {
    const stale = fakeLibraryDeployment({ buildInfoSha: staleSha })
    const current = fakeLibraryDeployment()
    let buildInfoRequests = 0

    await expect(
      verifyDeployment('https://example.pages.dev/', {
        attempts: 2,
        expectedCommitSha: expectedSha,
        fetcher: async (url) => {
          if (url.pathname !== '/build-info.json') return current(url)
          buildInfoRequests += 1
          return buildInfoRequests === 1 ? stale(url) : current(url)
        },
        product: 'library',
        retryDelayMs: 0,
      }),
    ).resolves.toBeUndefined()
    expect(buildInfoRequests).toBe(2)
  })

  it('retries stale HTML until it matches the current build-info identity', async () => {
    const stale = fakeLibraryDeployment({ htmlSha: staleSha })
    const current = fakeLibraryDeployment()
    let rootRequests = 0

    await expect(
      verifyDeployment('https://example.pages.dev/', {
        attempts: 2,
        expectedCommitSha: expectedSha,
        fetcher: async (url) => {
          if (url.pathname !== '/') return current(url)
          rootRequests += 1
          return rootRequests === 1 ? stale(url) : current(url)
        },
        product: 'library',
        retryDelayMs: 0,
      }),
    ).resolves.toBeUndefined()
    expect(rootRequests).toBe(2)
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

  it('does not treat bare max-age=0 as complete HTML revalidation', async () => {
    await expect(
      verifyDeployment('https://example.pages.dev/', {
        attempts: 1,
        expectedCommitSha: expectedSha,
        fetcher: fakeLibraryDeployment({ htmlCache: 'public, max-age=0' }),
        product: 'library',
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/unsafe cache-control/i)
  })

  it('does not treat a qualified no-cache field as full-response HTML revalidation', async () => {
    await expect(
      verifyDeployment('https://example.pages.dev/', {
        attempts: 1,
        expectedCommitSha: expectedSha,
        fetcher: fakeLibraryDeployment({ htmlCache: 'public, no-cache="Set-Cookie"' }),
        product: 'library',
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/unsafe cache-control/i)
  })

  it.each([
    ['CDN-Cache-Control', 'max-age=600'],
    ['Cloudflare-CDN-Cache-Control', 'max-age=600'],
    ['Surrogate-Control', 'max-age=600'],
  ])('rejects positive %s on HTML', async (headerName, value) => {
    await expect(
      verifyDeployment('https://example.pages.dev/', {
        attempts: 1,
        expectedCommitSha: expectedSha,
        fetcher: fakeLibraryDeployment({ htmlHeaders: { [headerName]: value } }),
        product: 'library',
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(new RegExp('unsafe ' + headerName, 'i'))
  })

  it.each(['CDN-Cache-Control', 'Cloudflare-CDN-Cache-Control', 'Surrogate-Control'])(
    'rejects an incomplete %s HTML policy',
    async (headerName) => {
      await expect(
        verifyDeployment('https://example.pages.dev/', {
          attempts: 1,
          expectedCommitSha: expectedSha,
          fetcher: fakeLibraryDeployment({ htmlHeaders: { [headerName]: 'no-cache="Set-Cookie"' } }),
          product: 'library',
          retryDelayMs: 0,
        }),
      ).rejects.toThrow(new RegExp(`unsafe ${headerName}`, 'i'))
    },
  )

  it.each(['CDN-Cache-Control', 'Cloudflare-CDN-Cache-Control', 'Surrogate-Control'])(
    'does not treat bare max-age=0 in %s as complete HTML revalidation',
    async (headerName) => {
      await expect(
        verifyDeployment('https://example.pages.dev/', {
          attempts: 1,
          expectedCommitSha: expectedSha,
          fetcher: fakeLibraryDeployment({ htmlHeaders: { [headerName]: 'max-age=0' } }),
          product: 'library',
          retryDelayMs: 0,
        }),
      ).rejects.toThrow(new RegExp(`unsafe ${headerName}`, 'i'))
    },
  )

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

  it.each([
    ['CDN-Cache-Control', 'max-age=600'],
    ['Cloudflare-CDN-Cache-Control', 'stale-while-revalidate=60'],
    ['Surrogate-Control', 's-maxage=600'],
  ])('rejects unsafe %s on build-info', async (headerName, value) => {
    await expect(
      verifyDeployment('https://example.pages.dev/', {
        attempts: 1,
        expectedCommitSha: expectedSha,
        fetcher: fakeLibraryDeployment({ buildInfoHeaders: { [headerName]: value } }),
        product: 'library',
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(new RegExp('unsafe ' + headerName, 'i'))
  })

  it.each(['CDN-Cache-Control', 'Cloudflare-CDN-Cache-Control', 'Surrogate-Control'])(
    'requires an explicit no-store %s build-info policy',
    async (headerName) => {
      await expect(
        verifyDeployment('https://example.pages.dev/', {
          attempts: 1,
          expectedCommitSha: expectedSha,
          fetcher: fakeLibraryDeployment({ buildInfoHeaders: { [headerName]: 'public' } }),
          product: 'library',
          retryDelayMs: 0,
        }),
      ).rejects.toThrow(new RegExp(`build-info.*${headerName}.*no-store`, 'i'))
    },
  )

  it('accepts JS/CSS references outside the conventional assets directory without a filename shape', async () => {
    await expect(
      verifyDeployment('https://example.pages.dev/', {
        attempts: 1,
        expectedCommitSha: expectedSha,
        fetcher: fakeLibraryDeployment({ assetPath: '/static', assetPrefix: 'index-production' }),
        product: 'library',
        retryDelayMs: 0,
      }),
    ).resolves.toBeUndefined()
  })

  it('accepts reusable JS/CSS asset URLs when no local artifact map is supplied', async () => {
    await expect(
      verifyDeployment('https://example.pages.dev/', {
        attempts: 1,
        expectedCommitSha: expectedSha,
        fetcher: fakeLibraryDeployment({ assetPrefix: 'index' }),
        product: 'library',
        retryDelayMs: 0,
      }),
    ).resolves.toBeUndefined()
  })

  it('rejects an asset URL absent from the supplied local artifact map', async () => {
    const bodyDigest = createHash('sha256').update('console.log("built")').digest('hex')
    await expect(
      verifyDeployment('https://example.pages.dev/', {
        attempts: 1,
        expectedCommitSha: expectedSha,
        expectedAssetDigests: {
          '/assets/index-a1b2c3d4.js': bodyDigest,
          '/assets/index-a1b2c3d4.css': createHash('sha256').update('body{}').digest('hex'),
        },
        fetcher: fakeLibraryDeployment({ assetPrefix: 'index-release1' }),
        product: 'library',
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/unexpected built asset URL/i)
  })

  it('parses legal unquoted JS references without requiring a filename shape', async () => {
    const quotedHtml = libraryHtml(expectedSha)
    const html = quotedHtml.replace(
      'src="/assets/index-a1b2c3d4.js"',
      'src=/runtime.js',
    )
    await expect(
      verifyDeployment('https://example.pages.dev/', {
        attempts: 1,
        expectedCommitSha: expectedSha,
        fetcher: fakeLibraryDeployment({ html }),
        product: 'library',
        retryDelayMs: 0,
      }),
    ).resolves.toBeUndefined()
  })
})
