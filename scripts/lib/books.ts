/**
 * Shared helpers for the authoring workflow scripts (issue #10).
 *
 * The scripts are run with tsx (`pnpm workflow:*`). They discover authoring
 * books under `books/<slug>/`, load `book.json` and `manifest.json`, and write
 * pipeline output under `content-dist/`. Released snapshots and assets are
 * committed production inputs; preview-only artifacts remain gitignored.
 *
 * Paths are resolved relative to this file (via `import.meta.url`), so the
 * scripts work regardless of the caller's working directory.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PreviewBoundary } from '../../src/authoring/preview';
import type { ContentIssue } from '../../src/content/validate';

/** Absolute path to the repository root (three levels up from scripts/lib/). */
export function repoRoot(): string {
  return fileURLToPath(new URL('../../', import.meta.url));
}

/** Absolute path to the authoring catalog (`books/`). */
export function booksRoot(root: string = repoRoot()): string {
  return join(root, 'books');
}

/** Absolute path to the release pipeline directory (`content-dist/`). */
export function contentDistRoot(root: string = repoRoot()): string {
  return join(root, 'content-dist');
}

/**
 * Authoring metadata for one book (interface layer). The `preview.boundary`
 * shape is intentionally NOT part of the content schema (docs/ui-ux-research.md
 * §4.2); the exact field name is finalized by the content-model follow-up.
 */
export interface BookManifest {
  /** Relative path (from the book directory) to the Book JSON file. */
  book?: string;
  /** Editorial storefront order; lower non-negative values appear first. */
  catalog?: { order?: number };
  /** Preview boundary — where the free preview ends. */
  preview?: { boundary?: PreviewBoundary };
  /** Free-form notes; ignored by the pipeline. */
  notes?: string;
}

/** One authoring book loaded from `books/<slug>/`. */
export interface LoadedBook {
  /** Book slug — the directory name under `books/`. */
  slug: string;
  /** Absolute path to the book directory. */
  bookDir: string;
  /** Absolute path to `book.json`. */
  bookJsonPath: string;
  /** Absolute path to `manifest.json` (may not exist). */
  manifestJsonPath: string;
  /** Parsed but UNVALIDATED book data. */
  raw: unknown;
  /** Parsed manifest, or `null` when `manifest.json` is absent. */
  manifest: BookManifest | null;
}

/**
 * Book slugs = subdirectories of `books/` that contain a `book.json`, sorted
 * for a deterministic pipeline.
 */
export function listBookSlugs(root: string = repoRoot()): string[] {
  const dir = booksRoot(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => {
      if (name.startsWith('.') || name === 'README.md') return false;
      const sub = join(dir, name);
      return statSync(sub).isDirectory() && existsSync(join(sub, 'book.json'));
    })
    .sort();
}

/** Loads one authoring book (JSON parse only; validation is the callers' job). */
export function loadBook(slug: string, root: string = repoRoot()): LoadedBook {
  const bookDir = join(booksRoot(root), slug);
  const bookJsonPath = join(bookDir, 'book.json');
  const manifestJsonPath = join(bookDir, 'manifest.json');
  const raw: unknown = JSON.parse(readFileSync(bookJsonPath, 'utf8'));
  const manifest = existsSync(manifestJsonPath)
    ? (JSON.parse(readFileSync(manifestJsonPath, 'utf8')) as BookManifest)
    : null;
  return { slug, bookDir, bookJsonPath, manifestJsonPath, raw, manifest };
}

/** Loads every authoring book, in slug order. */
export function discoverBooks(root: string = repoRoot()): LoadedBook[] {
  return listBookSlugs(root).map((slug) => loadBook(slug, root));
}

/** The preview boundary declared in the manifest, if any. */
export function boundaryFor(book: LoadedBook): PreviewBoundary | undefined {
  return book.manifest?.preview?.boundary;
}

/** Path of a book file relative to the repository root, for human output. */
export function relativePath(absolutePath: string, root: string = repoRoot()): string {
  const base = root.endsWith('/') ? root : `${root}/`;
  return absolutePath.startsWith(base) ? absolutePath.slice(base.length) : absolutePath;
}

/** Deterministically serializes `value` to `path`, creating parent directories. */
export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** Human-readable rendering of one validator issue, matching test conventions. */
export function formatIssue(issue: ContentIssue): string {
  return `${issue.path}  [${issue.code}]  ${issue.message}`;
}
