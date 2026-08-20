import { describe, expect, it, vi } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preparePagesOutput } from '../scripts/lib/pages';
import { verifyPagesDeployment } from '../scripts/lib/pages-smoke';
import { resolveDeploymentBase } from '../vite.config';

/**
 * Deployment base contract regression guard.
 *
 * The app uses an absolute Vite base (`base: '/'`) with `BrowserRouter` at the
 * root. This test builds the app for production and asserts every asset
 * reference in the emitted HTML is absolute (`/assets/...`). That guarantees a
 * direct load or refresh of a nested route such as `/books/:slug` resolves
 * assets from the site root instead of beneath the current document path (which
 * would 404 once the host serves index.html as the SPA fallback).
 */
describe('deployment base contract', () => {
  it('normalizes the configured GitHub Pages project path and rejects unsafe bases', () => {
    expect(resolveDeploymentBase(undefined)).toBe('/');
    expect(resolveDeploymentBase('/business-japanese-hub')).toBe('/business-japanese-hub/');
    expect(() => resolveDeploymentBase('https://attacker.example/app/')).toThrow(
      'DEPLOY_BASE_PATH',
    );
    expect(() => resolveDeploymentBase('/../escape/')).toThrow('DEPLOY_BASE_PATH');
  });

  it('keeps visual colors and stroke widths centralized in design tokens', () => {
    const globalStyles = readFileSync('src/styles/global.css', 'utf8');
    expect(globalStyles).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
    expect(globalStyles).not.toMatch(/(?:border(?:-(?:top|right|bottom|left))?|text-decoration-thickness):\s*[12]px\b/);
  });

  it('emits absolute asset URLs so nested routes do not rely on document-relative assets', async () => {
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

  it('emits project-path asset URLs and a Pages SPA fallback for production deployment', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'bjh-pages-base-'));
    try {
      const base = resolveDeploymentBase('/business-japanese-hub/');
      await build({ base, logLevel: 'error', build: { outDir, emptyOutDir: true } });
      preparePagesOutput(outDir, ['released-book']);

      const html = readFileSync(join(outDir, 'index.html'), 'utf8');
      expect(html).toMatch(/(?:src|href)="\/business-japanese-hub\/assets\//);
      expect(readFileSync(join(outDir, '404.html'), 'utf8')).toBe(html);
      expect(JSON.parse(readFileSync(join(outDir, 'deployment-manifest.json'), 'utf8'))).toEqual({
        bookSlugs: ['released-book'],
      });
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('refuses to prepare a Pages artifact without a built index', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'bjh-pages-missing-index-'));
    try {
      writeFileSync(join(outDir, 'unrelated.txt'), 'not a build');
      expect(() => preparePagesOutput(outDir, ['released-book'])).toThrow('index.html');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('smokes the deployed root, assets, Book route, and purchase-result route', async () => {
    const html = '<script type="module" src="/business-japanese-hub/assets/app.js"></script>';
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/deployment-manifest.json')) {
        return Response.json({ bookSlugs: ['released-book'] });
      }
      if (url.endsWith('/assets/app.js')) return new Response('export {}', { status: 200 });
      if (url.includes('/books/') || url.includes('/purchase/result')) {
        return new Response(html, { status: 404 });
      }
      return new Response(html, { status: 200 });
    });

    await verifyPagesDeployment('https://davidkao-official.github.io/business-japanese-hub/', {
      attempts: 1,
      fetcher,
      retryDelayMs: 0,
    });

    expect(fetcher).toHaveBeenCalledWith(
      new URL('https://davidkao-official.github.io/business-japanese-hub/'),
    );
    expect(fetcher).toHaveBeenCalledWith(
      new URL('https://davidkao-official.github.io/business-japanese-hub/books/released-book'),
    );
    expect(fetcher).toHaveBeenCalledWith(
      new URL(
        'https://davidkao-official.github.io/business-japanese-hub/purchase/result?order=deployment-smoke',
      ),
    );
  });

  it('fails the deployment smoke check when a built asset is unavailable', async () => {
    const html = '<link rel="stylesheet" href="/business-japanese-hub/assets/app.css">';
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/deployment-manifest.json')) {
        return Response.json({ bookSlugs: ['released-book'] });
      }
      if (url.endsWith('/assets/app.css')) return new Response('missing', { status: 404 });
      if (url.includes('/books/') || url.includes('/purchase/result')) {
        return new Response(html, { status: 404 });
      }
      return new Response(html, { status: 200 });
    });

    await expect(
      verifyPagesDeployment('https://davidkao-official.github.io/business-japanese-hub/', {
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

      // tokens.css is the single canonical color source: the built meta values
      // must equal the --color-bg values there, so a token-only design pass can
      // never leave the browser-chrome color stale.
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
