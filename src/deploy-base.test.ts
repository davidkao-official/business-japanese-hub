import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { build } from 'vite'
import { verifyDeployment, type DeploymentProduct } from '../scripts/lib/deployment-smoke'
import { resolveDeploymentBase } from '../vite.config'

const TEST_COMMIT_SHA = '4444444444444444444444444444444444444444'
const SAFE_HTML_CACHE = 'public, max-age=0, must-revalidate'
const LIBRARY_ASSET = '/assets/app-a1b2c3d4.js'
const LIBRARY_STYLE = '/assets/app-a1b2c3d4.css'
const CAREER_GAME_ASSET = '/assets/game-a1b2c3d4.js'

interface AssetFixture {
  body: string
  contentType: string
  status?: number
}

interface HtmlResponseOverride {
  cacheControl?: string
  contentType?: string
  responseUrl?: string
  status?: number
}

interface DeploymentFixtureOptions {
  assets?: Record<string, AssetFixture>
  html: string
  product: DeploymentProduct
  root?: HtmlResponseOverride
  routes?: Record<string, HtmlResponseOverride>
}

function responseAt(
  url: string,
  body: string,
  contentType: string,
  status = 200,
  cacheControl?: string,
): Response {
  const response = new Response(body, {
    status,
    headers: {
      'content-type': contentType,
      ...(cacheControl ? { 'cache-control': cacheControl } : {}),
    },
  })
  Object.defineProperty(response, 'url', { value: url })
  return response
}

function withBuildMarker(html: string, product: DeploymentProduct): string {
  const marker = `<meta name="bjh-build" content="${product}:${TEST_COMMIT_SHA}" />`
  return html.includes('</head>') ? html.replace('</head>', `${marker}</head>`) : `${marker}${html}`
}

function defaultAssets(product: DeploymentProduct): Record<string, AssetFixture> {
  if (product === 'career-game') {
    return {
      [CAREER_GAME_ASSET]: {
        body: 'const cases = ["rookie-survival", "customer-communication", "upward-disagreement"]',
        contentType: 'application/javascript',
      },
    }
  }
  return {
    [LIBRARY_ASSET]: { body: 'export {}', contentType: 'text/javascript; charset=utf-8' },
  }
}

function deploymentFetcher(options: DeploymentFixtureOptions) {
  const html = withBuildMarker(options.html, options.product)
  const assets = options.assets ?? defaultAssets(options.product)

  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    const pathname = new URL(url).pathname

    if (pathname === '/build-info.json') {
      return responseAt(
        url,
        JSON.stringify({ schemaVersion: 1, product: options.product, commitSha: TEST_COMMIT_SHA }),
        'application/json',
        200,
        'no-store',
      )
    }

    const asset = assets[pathname]
    if (asset) {
      return responseAt(url, asset.body, asset.contentType, asset.status ?? 200)
    }

    const override = pathname === '/' ? options.root : options.routes?.[pathname]
    return responseAt(
      override?.responseUrl ?? url,
      html,
      override?.contentType ?? 'text/html; charset=utf-8',
      override?.status ?? 200,
      override?.cacheControl ?? SAFE_HTML_CACHE,
    )
  })
}

function libraryHtml(
  title = 'ビジネス日本語ハブ',
  assetReference = `<script type="module" src="${LIBRARY_ASSET}"></script>`,
): string {
  return [
    '<!doctype html><html><head>',
    '<meta name="description" content="ビジネスシーンで役立つ日本語を学ぶためのプラットフォームです。">',
    `<title>${title}</title>`,
    assetReference,
    '</head><body><div id="root"></div></body></html>',
  ].join('')
}

function careerGameHtml(): string {
  return [
    '<!doctype html><html><head>',
    '<meta name="description" content="日本の職場を舞台に判断と結果を振り返る、Business Japanese Hub の職場シミュレーション。">',
    '<title>キャリアゲーム | Business Japanese Hub</title>',
    `<script type="module" src="${CAREER_GAME_ASSET}"></script>`,
    '</head><body><div id="root"></div></body></html>',
  ].join('')
}

/**
 * Deployment contract regression guard.
 *
 * The canonical Cloudflare Pages deployment lives at the origin root, so the
 * app uses Vite base `/` and BrowserRouter at the root. Nested routes rely on
 * the host's SPA fallback while built assets always resolve from `/assets/...`.
 */
describe('deployment base contract', () => {
  it('defaults to the origin root and rejects unsafe custom bases', () => {
    expect(resolveDeploymentBase(undefined)).toBe('/')
    expect(resolveDeploymentBase('/future-prefix')).toBe('/future-prefix/')
    expect(() => resolveDeploymentBase('https://attacker.example/app/')).toThrow(
      'DEPLOY_BASE_PATH',
    )
    expect(() => resolveDeploymentBase('/../escape/')).toThrow('DEPLOY_BASE_PATH')
  })

  it('keeps visual colors and stroke widths centralized in design tokens', () => {
    const globalStyles = readFileSync('src/styles/global.css', 'utf8')
    expect(globalStyles).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i)
    expect(globalStyles).not.toMatch(
      /(?:border(?:-(?:top|right|bottom|left))?|text-decoration-thickness):\s*[12]px\b/,
    )
  })

  it('emits root-absolute asset URLs for Cloudflare nested-route fallback', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'bjh-deploy-base-'))
    try {
      await build({ logLevel: 'error', build: { outDir, emptyOutDir: true } })

      const html = readFileSync(join(outDir, 'index.html'), 'utf8')
      const assetRefs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
        .map((match) => match[1])
        .filter(
          (ref) =>
            ref.length > 0 &&
            !ref.startsWith('#') &&
            !ref.startsWith('data:') &&
            !ref.startsWith('http'),
        )

      expect(assetRefs.length).toBeGreaterThan(0)
      for (const ref of assetRefs) {
        expect(ref, `asset reference must be absolute (got ${JSON.stringify(ref)})`).toMatch(/^\//)
      }
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  it('smokes the Library root, typed assets, and representative free, paid, and stable-link routes', async () => {
    const baseUrl = 'https://business-japanese-hub.pages.dev/'
    const fetcher = deploymentFetcher({ html: libraryHtml(), product: 'library' })

    await verifyDeployment(baseUrl, {
      attempts: 1,
      fetcher,
      product: 'library',
      retryDelayMs: 0,
    })

    expect(fetcher).toHaveBeenCalledWith(new URL(baseUrl))
    expect(fetcher).toHaveBeenCalledWith(new URL('build-info.json', baseUrl))
    expect(fetcher).toHaveBeenCalledWith(new URL('books/keigo-essentials', baseUrl))
    expect(fetcher).toHaveBeenCalledWith(
      new URL('books/keigo-essentials/read/keigo-basics', baseUrl),
    )
    expect(fetcher).toHaveBeenCalledWith(new URL('books/meeting-japanese', baseUrl))
    expect(fetcher).toHaveBeenCalledWith(
      new URL('books/meeting-japanese/read/meeting-purpose', baseUrl),
    )
    expect(fetcher).toHaveBeenCalledWith(
      new URL('library-link?bookId=book-sample-bj-keigo&chapterId=ch-2', baseUrl),
    )
    expect(fetcher).toHaveBeenCalledWith(
      new URL('purchase/result?order=deployment-smoke', baseUrl),
    )
  })

  it('smokes the Career Game root, stable case, and graceful unknown-case fallback', async () => {
    const baseUrl = 'https://business-japanese-career-game.pages.dev/'
    const fetcher = deploymentFetcher({ html: careerGameHtml(), product: 'career-game' })

    await verifyDeployment(baseUrl, {
      attempts: 1,
      fetcher,
      product: 'career-game',
      retryDelayMs: 0,
    })

    expect(fetcher).toHaveBeenCalledWith(new URL(baseUrl))
    expect(fetcher).toHaveBeenCalledWith(new URL('build-info.json', baseUrl))
    expect(fetcher).toHaveBeenCalledWith(new URL('cases/rookie-survival', baseUrl))
    expect(fetcher).toHaveBeenCalledWith(new URL('cases/customer-communication', baseUrl))
    expect(fetcher).toHaveBeenCalledWith(new URL('cases/upward-disagreement', baseUrl))
    expect(fetcher).toHaveBeenCalledWith(new URL('case-link?scenarioId=rookie-survival', baseUrl))
    expect(fetcher).toHaveBeenCalledWith(
      new URL('case-link?scenarioId=customer-communication', baseUrl),
    )
    expect(fetcher).toHaveBeenCalledWith(
      new URL('case-link?scenarioId=upward-disagreement', baseUrl),
    )
    expect(fetcher).toHaveBeenCalledWith(new URL('cases/unknown-case', baseUrl))
  })

  it('rejects a Career Game bundle that omits a registered production case', async () => {
    const baseUrl = 'https://business-japanese-career-game.pages.dev/'
    const fetcher = deploymentFetcher({
      html: careerGameHtml(),
      product: 'career-game',
      assets: {
        [CAREER_GAME_ASSET]: {
          body: 'const cases = ["rookie-survival", "customer-communication"]',
          contentType: 'application/javascript',
        },
      },
    })

    await expect(
      verifyDeployment(baseUrl, {
        attempts: 1,
        fetcher,
        product: 'career-game',
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/runtime catalog marker.*upward-disagreement/i)
  })

  it('rejects the wrong application shell at the deployment root', async () => {
    const fetcher = deploymentFetcher({ html: careerGameHtml(), product: 'library' })

    await expect(
      verifyDeployment('https://business-japanese-hub.pages.dev/', {
        attempts: 1,
        fetcher,
        product: 'library',
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/Library.*fingerprint|fingerprint.*Library/i)
  })

  it('requires the product-specific document title', async () => {
    const fetcher = deploymentFetcher({ html: libraryHtml('Wrong product'), product: 'library' })

    await expect(
      verifyDeployment('https://business-japanese-hub.pages.dev/', {
        attempts: 1,
        fetcher,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/Library.*title|title.*Library/i)
  })

  it('requires an HTML content type for the application shell', async () => {
    const fetcher = deploymentFetcher({
      html: libraryHtml(),
      product: 'library',
      root: { contentType: 'text/plain' },
    })

    await expect(
      verifyDeployment('https://business-japanese-hub.pages.dev/', {
        attempts: 1,
        fetcher,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/root.*content-type/i)
  })

  it('fails the deployment smoke check when a built asset is unavailable', async () => {
    const fetcher = deploymentFetcher({
      html: libraryHtml(
        'ビジネス日本語ハブ',
        `<link rel="stylesheet" href="${LIBRARY_STYLE}">`,
      ),
      product: 'library',
      assets: {
        [LIBRARY_STYLE]: { body: 'missing', contentType: 'text/plain', status: 404 },
      },
    })

    await expect(
      verifyDeployment('https://business-japanese-hub.pages.dev/', {
        attempts: 1,
        fetcher,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow('asset')
  })

  it('rejects an HTML fallback served in place of a built asset', async () => {
    const fetcher = deploymentFetcher({
      html: libraryHtml(
        'ビジネス日本語ハブ',
        `<link rel="stylesheet" href="${LIBRARY_STYLE}">`,
      ),
      product: 'library',
      assets: {
        [LIBRARY_STYLE]: { body: libraryHtml(), contentType: 'text/html' },
      },
    })

    await expect(
      verifyDeployment('https://business-japanese-hub.pages.dev/', {
        attempts: 1,
        fetcher,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/asset.*content-type/i)
  })

  it('requires each built asset type to match its file extension', async () => {
    const fetcher = deploymentFetcher({
      html: libraryHtml(),
      product: 'library',
      assets: {
        [LIBRARY_ASSET]: { body: 'body {}', contentType: 'text/css' },
      },
    })

    await expect(
      verifyDeployment('https://business-japanese-hub.pages.dev/', {
        attempts: 1,
        fetcher,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/asset.*content-type/i)
  })

  it('rejects a direct route that changes the requested URL', async () => {
    const baseUrl = 'https://business-japanese-career-game.pages.dev/'
    const fetcher = deploymentFetcher({
      html: careerGameHtml(),
      product: 'career-game',
      routes: {
        '/cases/rookie-survival': { responseUrl: baseUrl },
      },
    })

    await expect(
      verifyDeployment(baseUrl, {
        attempts: 1,
        fetcher,
        product: 'career-game',
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/direct route.*URL|URL.*direct route/i)
  })

  it('requires direct routes to return an HTML SPA shell', async () => {
    const baseUrl = 'https://business-japanese-career-game.pages.dev/'
    const fetcher = deploymentFetcher({
      html: careerGameHtml(),
      product: 'career-game',
      routes: {
        '/cases/rookie-survival': { contentType: 'text/plain' },
      },
    })

    await expect(
      verifyDeployment(baseUrl, {
        attempts: 1,
        fetcher,
        product: 'career-game',
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/direct route.*content-type/i)
  })

  it('allows HTTP only for loopback built-preview smoke servers', async () => {
    const baseUrl = 'http://127.0.0.1:4173/'
    const fetcher = deploymentFetcher({ html: libraryHtml(), product: 'library' })

    await expect(
      verifyDeployment(baseUrl, {
        attempts: 1,
        fetcher,
        retryDelayMs: 0,
      }),
    ).resolves.toBeUndefined()

    await expect(
      verifyDeployment('http://localhost:4173/', {
        attempts: 1,
        fetcher,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow('clean HTTPS URL or an HTTP 127.0.0.1 URL')
  })

  it('synchronizes theme-color meta tags with the tokens.css background tokens', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'bjh-theme-color-'))
    try {
      await build({ logLevel: 'error', build: { outDir, emptyOutDir: true } })

      const html = readFileSync(join(outDir, 'index.html'), 'utf8')
      const metas = [...html.matchAll(/<meta\s+name="theme-color"[^>]*>/gi)].map((m) => m[0])
      const lightMeta = metas.find((m) => m.includes('(prefers-color-scheme: light)'))
      const darkMeta = metas.find((m) => m.includes('(prefers-color-scheme: dark)'))
      expect(lightMeta).toBeDefined()
      expect(darkMeta).toBeDefined()
      const lightColor = lightMeta!.match(/content="([^"]+)"/)![1]
      const darkColor = darkMeta!.match(/content="([^"]+)"/)![1]

      const tokens = readFileSync('src/styles/tokens.css', 'utf8')
      const tokenLight = /:root\s*\{([^}]*)\}/.exec(tokens)?.[1]?.match(
        /--color-bg:\s*([^;]+);/,
      )?.[1]?.trim()
      const tokenDark = /:root\[data-theme='dark'\]\s*\{([^}]*)\}/.exec(tokens)?.[1]?.match(
        /--color-bg:\s*([^;]+);/,
      )?.[1]?.trim()
      expect(lightColor).toBe(tokenLight)
      expect(darkColor).toBe(tokenDark)
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })
})
