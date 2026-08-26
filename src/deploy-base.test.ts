import { describe, expect, it, vi } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyDeployment } from '../scripts/lib/deployment-smoke';
import { resolveDeploymentBase } from '../vite.config';

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

  it('smokes the Cloudflare root, assets, Book route, and purchase-result route', async () => {
    const html = '<script type="module" src="/assets/app.js"></script>';
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/assets/app.js')) return new Response('export {}', { status: 200 });
      if (url.includes('/books/') || url.includes('/purchase/result')) {
        return new Response(html, { status: 200 });
      }
      return new Response(html, { status: 200 });
    });

    await verifyDeployment('https://business-japanese-hub.pages.dev/', {
      attempts: 1,
      fetcher,
      retryDelayMs: 0,
    });

    expect(fetcher).toHaveBeenCalledWith(new URL('https://business-japanese-hub.pages.dev/'));
    expect(fetcher).toHaveBeenCalledWith(
      new URL('https://business-japanese-hub.pages.dev/books/deployment-smoke'),
    );
    expect(fetcher).toHaveBeenCalledWith(
      new URL(
        'https://business-japanese-hub.pages.dev/purchase/result?order=deployment-smoke',
      ),
    );
  });

  it('fails the deployment smoke check when a built asset is unavailable', async () => {
    const html = '<link rel="stylesheet" href="/assets/app.css">';
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/assets/app.css')) return new Response('missing', { status: 404 });
      if (url.includes('/books/') || url.includes('/purchase/result')) {
        return new Response(html, { status: 200 });
      }
      return new Response(html, { status: 200 });
    });

    await expect(
      verifyDeployment('https://business-japanese-hub.pages.dev/', {
        attempts: 1,
        fetcher,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow('asset');
  });

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
