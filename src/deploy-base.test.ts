import { describe, expect, it, vi } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyDeployment } from '../scripts/lib/deployment-smoke';
import { resolveDeploymentBase } from '../vite.config';

function responseAt(url: string, body: string, contentType: string, status = 200): Response {
  const response = new Response(body, {
    status,
    headers: { 'content-type': contentType },
  })
  Object.defineProperty(response, 'url', { value: url })
  return response
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
    expect(resolveDeploymentBase(undefined)).toBe('/');
    expect(resolveDeploymentBase('/future-prefix')).toBe('/future-prefix/');
    expect(() => resolveDeploymentBase('https://attacker.example/app/')).toThrow(
      'DEPLOY_BASE_PATH',
    );
    expect(() => resolveDeploymentBase('/../escape/')).toThrow('DEPLOY_BASE_PATH');
  });

  it('keeps visual colors and stroke widths centralized in design tokens', () => {
    const globalStyles = readFileSync('src/styles/global.css', 'utf8');
    expect(globalStyles).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
    expect(globalStyles).not.toMatch(
      /(?:border(?:-(?:top|right|bottom|left))?|text-decoration-thickness):\s*[12]px\b/,
    );
  });

  it('emits root-absolute asset URLs for Cloudflare nested-route fallback', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'bjh-deploy-base-'));
    try {
      await build({ logLevel: 'error', build: { outDir, emptyOutDir: true } });

      const html = readFileSync(join(outDir, 'index.html'), 'utf8');
      const assetRefs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
        .map((match) => match[1])
        .filter(
          (ref) =>
            ref.length > 0 &&
            !ref.startsWith('#') &&
            !ref.startsWith('data:') &&
            !ref.startsWith('http'),
        );

      expect(assetRefs.length).toBeGreaterThan(0);
      for (const ref of assetRefs) {
        expect(ref, `asset reference must be absolute (got ${JSON.stringify(ref)})`).toMatch(/^\//);
      }
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('smokes the Library root, typed assets, and representative free, paid, and stable-link routes', async () => {
    const baseUrl = 'https://business-japanese-hub.pages.dev/'
    const html = [
      '<!doctype html>',
      '<html><head>',
      '<meta name="description" content="ビジネスシーンで役立つ日本語を学ぶためのプラットフォームです。">',
      '<title>ビジネス日本語ハブ</title>',
      '<link rel="stylesheet" href="/assets/app.css">',
      '<script type="module" src="/assets/app.js"></script>',
      '</head><body><div id="root"></div></body></html>',
    ].join('')
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/assets/app.js')) {
        return responseAt(url, 'export {}', 'text/javascript; charset=utf-8')
      }
      if (url.endsWith('/assets/app.css')) return responseAt(url, '', 'text/css')
      return responseAt(url, html, 'text/html; charset=utf-8')
    })

    await verifyDeployment(baseUrl, {
      attempts: 1,
      fetcher,
      product: 'library',
      retryDelayMs: 0,
    })

    expect(fetcher).toHaveBeenCalledWith(new URL(baseUrl))
    expect(fetcher).toHaveBeenCalledWith(
      new URL('books/keigo-essentials', baseUrl),
    )
    expect(fetcher).toHaveBeenCalledWith(
      new URL('books/keigo-essentials/read/keigo-basics', baseUrl),
    )
    expect(fetcher).toHaveBeenCalledWith(new URL('books/meeting-japanese', baseUrl))
    expect(fetcher).toHaveBeenCalledWith(
      new URL('books/meeting-japanese/read/meeting-purpose', baseUrl),
    )
    expect(fetcher).toHaveBeenCalledWith(
      new URL(
        'library-link?bookId=book-sample-bj-keigo&chapterId=ch-2',
        baseUrl,
      ),
    )
    expect(fetcher).toHaveBeenCalledWith(
      new URL('purchase/result?order=deployment-smoke', baseUrl),
    )
  })

  it('smokes the Career Game root, stable case, and graceful unknown-case fallback', async () => {
    const baseUrl = 'https://business-japanese-career-game.pages.dev/'
    const html = [
      '<!doctype html>',
      '<html><head>',
      '<meta name="description" content="日本の職場を舞台に判断と結果を振り返る、Business Japanese Hub の職場シミュレーション。">',
      '<title>キャリアゲーム | Business Japanese Hub</title>',
      '<script type="module" src="/assets/game.js"></script>',
      '</head><body><div id="root"></div></body></html>',
    ].join('')
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/assets/game.js')) {
        return responseAt(url, 'export {}', 'application/javascript')
      }
      return responseAt(url, html, 'text/html; charset=utf-8')
    })

    await verifyDeployment(baseUrl, {
      attempts: 1,
      fetcher,
      product: 'career-game',
      retryDelayMs: 0,
    })

    expect(fetcher).toHaveBeenCalledWith(new URL(baseUrl))
    expect(fetcher).toHaveBeenCalledWith(new URL('cases/rookie-survival', baseUrl))
    expect(fetcher).toHaveBeenCalledWith(new URL('cases/customer-communication', baseUrl))
    expect(fetcher).toHaveBeenCalledWith(new URL('cases/upward-disagreement', baseUrl))
    expect(fetcher).toHaveBeenCalledWith(
      new URL('case-link?scenarioId=rookie-survival', baseUrl),
    )
    expect(fetcher).toHaveBeenCalledWith(
      new URL('case-link?scenarioId=customer-communication', baseUrl),
    )
    expect(fetcher).toHaveBeenCalledWith(
      new URL('case-link?scenarioId=upward-disagreement', baseUrl),
    )
    expect(fetcher).toHaveBeenCalledWith(new URL('cases/unknown-case', baseUrl))
  })

  it('rejects the wrong application shell at the deployment root', async () => {
    const html = [
      '<!doctype html><html><head>',
      '<meta name="description" content="日本の職場を舞台に判断と結果を振り返る、Business Japanese Hub の職場シミュレーション。">',
      '<title>キャリアゲーム | Business Japanese Hub</title>',
      '<script type="module" src="/assets/game.js"></script>',
      '</head><body><div id="root"></div></body></html>',
    ].join('')
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/assets/game.js')) {
        return responseAt(url, 'export {}', 'application/javascript')
      }
      return responseAt(url, html, 'text/html')
    })

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
    const html = [
      '<meta name="description" content="ビジネスシーンで役立つ日本語を学ぶためのプラットフォームです。">',
      '<title>Wrong product</title>',
      '<script type="module" src="/assets/app.js"></script>',
    ].join('')
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/assets/app.js')) {
        return responseAt(url, 'export {}', 'application/javascript')
      }
      return responseAt(url, html, 'text/html')
    })

    await expect(
      verifyDeployment('https://business-japanese-hub.pages.dev/', {
        attempts: 1,
        fetcher,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow(/Library.*title|title.*Library/i)
  })

  it('requires an HTML content type for the application shell', async () => {
    const html = [
      '<meta name="description" content="ビジネスシーンで役立つ日本語を学ぶためのプラットフォームです。">',
      '<title>ビジネス日本語ハブ</title>',
      '<script type="module" src="/assets/app.js"></script>',
    ].join('')
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/assets/app.js')) {
        return responseAt(url, 'export {}', 'application/javascript')
      }
      return responseAt(url, html, 'text/plain')
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
    const html = [
      '<meta name="description" content="ビジネスシーンで役立つ日本語を学ぶためのプラットフォームです。">',
      '<title>ビジネス日本語ハブ</title>',
      '<link rel="stylesheet" href="/assets/app.css">',
    ].join('')
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/assets/app.css')) return responseAt(url, 'missing', 'text/plain', 404)
      return responseAt(url, html, 'text/html')
    })

    await expect(
      verifyDeployment('https://business-japanese-hub.pages.dev/', {
        attempts: 1,
        fetcher,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow('asset');
  });

  it('rejects an HTML fallback served in place of a built asset', async () => {
    const html = [
      '<meta name="description" content="ビジネスシーンで役立つ日本語を学ぶためのプラットフォームです。">',
      '<title>ビジネス日本語ハブ</title>',
      '<link rel="stylesheet" href="/assets/app.css">',
    ].join('')
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      return responseAt(url, html, 'text/html')
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
    const html = [
      '<meta name="description" content="ビジネスシーンで役立つ日本語を学ぶためのプラットフォームです。">',
      '<title>ビジネス日本語ハブ</title>',
      '<script type="module" src="/assets/app.js"></script>',
    ].join('')
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/assets/app.js')) return responseAt(url, 'body {}', 'text/css')
      return responseAt(url, html, 'text/html')
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
    const html = [
      '<meta name="description" content="日本の職場を舞台に判断と結果を振り返る、Business Japanese Hub の職場シミュレーション。">',
      '<title>キャリアゲーム | Business Japanese Hub</title>',
      '<script type="module" src="/assets/game.js"></script>',
    ].join('')
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/assets/game.js')) {
        return responseAt(url, 'export {}', 'application/javascript')
      }
      if (url.endsWith('/cases/rookie-survival')) {
        return responseAt(baseUrl, html, 'text/html')
      }
      return responseAt(url, html, 'text/html')
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
    const html = [
      '<meta name="description" content="日本の職場を舞台に判断と結果を振り返る、Business Japanese Hub の職場シミュレーション。">',
      '<title>キャリアゲーム | Business Japanese Hub</title>',
      '<script type="module" src="/assets/game.js"></script>',
    ].join('')
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/assets/game.js')) {
        return responseAt(url, 'export {}', 'application/javascript')
      }
      const contentType = url.endsWith('/cases/rookie-survival') ? 'text/plain' : 'text/html'
      return responseAt(url, html, contentType)
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
    const html = [
      '<meta name="description" content="ビジネスシーンで役立つ日本語を学ぶためのプラットフォームです。">',
      '<title>ビジネス日本語ハブ</title>',
      '<script type="module" src="/assets/app.js"></script>',
    ].join('')
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/assets/app.js')) {
        return responseAt(url, 'export {}', 'text/javascript')
      }
      return responseAt(url, html, 'text/html')
    })

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
    const outDir = mkdtempSync(join(tmpdir(), 'bjh-theme-color-'));
    try {
      await build({ logLevel: 'error', build: { outDir, emptyOutDir: true } });

      const html = readFileSync(join(outDir, 'index.html'), 'utf8');
      const metas = [...html.matchAll(/<meta\s+name="theme-color"[^>]*>/gi)].map((m) => m[0]);
      const lightMeta = metas.find((m) => m.includes('(prefers-color-scheme: light)'));
      const darkMeta = metas.find((m) => m.includes('(prefers-color-scheme: dark)'));
      expect(lightMeta).toBeDefined();
      expect(darkMeta).toBeDefined();
      const lightColor = lightMeta!.match(/content="([^"]+)"/)![1];
      const darkColor = darkMeta!.match(/content="([^"]+)"/)![1];

      const tokens = readFileSync('src/styles/tokens.css', 'utf8');
      const tokenLight = /:root\s*\{([^}]*)\}/.exec(tokens)?.[1]?.match(
        /--color-bg:\s*([^;]+);/,
      )?.[1]?.trim();
      const tokenDark = /:root\[data-theme='dark'\]\s*\{([^}]*)\}/.exec(
        tokens,
      )?.[1]?.match(/--color-bg:\s*([^;]+);/)?.[1]?.trim();
      expect(lightColor).toBe(tokenLight);
      expect(darkColor).toBe(tokenDark);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
