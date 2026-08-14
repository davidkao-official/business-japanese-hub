/**
 * Workflow: preview — derives the free-preview payload for every valid
 * authoring book and writes it to `content-dist/preview/<slug>.json`.
 *
 * The preview boundary comes from `manifest.json` (`preview.boundary`, an
 * interface-layer generic field — see docs/ui-ux-research.md §4.2). When a
 * book declares no boundary, the whole book is treated as preview (nothing is
 * hidden), which the tool reports loudly so paid books are not accidentally
 * exposed for free.
 *
 * Run: `pnpm workflow:preview`
 */

import { join } from 'node:path';
import { validateBook } from '../src/content/validate';
import { derivePreview } from '../src/authoring/preview';
import type { PreviewBoundary } from '../src/authoring/preview';
import { boundaryFor, contentDistRoot, discoverBooks, formatIssue, writeJson } from './lib/books';
import type { LoadedBook } from './lib/books';

/** Resolves the effective boundary, falling back to a whole-book preview. */
function effectiveBoundary(book: LoadedBook, lastChapterId: string): { boundary: PreviewBoundary; implied: boolean } {
  const declared = boundaryFor(book);
  if (declared !== undefined) return { boundary: declared, implied: false };
  return { boundary: { kind: 'chapter', chapterId: lastChapterId }, implied: true };
}

function previewOne(book: LoadedBook): boolean {
  const result = validateBook(book.raw);
  if (!result.ok) {
    console.log(`ERR  ${book.slug}: book is invalid; run "pnpm workflow:validate" first.`);
    for (const issue of result.issues) {
      console.log(`     - ${formatIssue(issue)}`);
    }
    return false;
  }
  const value = result.value;
  const lastChapterId = value.chapters[value.chapters.length - 1]!.id;

  const { boundary, implied } = effectiveBoundary(book, lastChapterId);
  const derived = derivePreview(value, boundary);
  if (!derived.ok) {
    console.log(`ERR  ${book.slug}: invalid preview boundary.`);
    for (const issue of derived.issues) {
      console.log(`     - ${issue.path}  ${issue.message}`);
    }
    return false;
  }
  const preview = derived.value;

  writeJson(join(contentDistRoot(), 'preview', `${book.slug}.json`), {
    schema: 'preview-v1',
    slug: book.slug,
    boundary,
    chapters: preview.chapters,
    paidStart: preview.paidStart,
    isPartial: preview.isPartial,
    generatedAt: new Date().toISOString(),
  });

  const boundaryLabel = describeBoundary(preview);
  if (implied) {
    console.log(`warn ${book.slug}: no preview boundary in manifest.json; preview covers the WHOLE book.`);
  }
  console.log(`ok   ${book.slug}: ${boundaryLabel}`);
  return true;
}

/** A one-line human summary of where the preview ends and paid content begins. */
function describeBoundary(preview: {
  chapters: { id: string }[];
  paidStart: { chapterId: string; blockId: string } | null;
}): string {
  const first = preview.chapters[0]?.id ?? '?';
  const last = preview.chapters[preview.chapters.length - 1]?.id ?? '?';
  const span = first === last ? `chapter ${last}` : `chapters ${first}..${last}`;
  if (preview.paidStart === null) {
    return `preview = ${span} (no paid content; the whole book is preview)`;
  }
  return `preview = ${span}; paid content starts at ${preview.paidStart.chapterId} / ${preview.paidStart.blockId}`;
}

function main(): number {
  const books = discoverBooks();
  if (books.length === 0) {
    console.log('No authoring books found under books/ (each book needs a <slug>/book.json).');
    return 0;
  }

  const results = books.map(previewOne);
  const failed = results.filter((ok) => !ok).length;
  if (failed > 0) {
    console.log(`\n${failed} of ${books.length} book(s) FAILED preview generation.`);
    return 1;
  }
  console.log(`\nPreview artifacts written to content-dist/preview/.`);
  return 0;
}

process.exitCode = main();
