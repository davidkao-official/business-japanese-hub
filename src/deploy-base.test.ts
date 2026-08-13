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
});
