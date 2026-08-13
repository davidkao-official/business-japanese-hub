import { describe, expect, it } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
      const tokenDark = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{([^}]*)\}/.exec(
        tokens,
      )?.[1]?.match(/--color-bg:\s*([^;]+);/)?.[1]?.trim();
      expect(lightColor).toBe(tokenLight);
      expect(darkColor).toBe(tokenDark);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
