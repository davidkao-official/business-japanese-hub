/**
 * Workflow: publish — validates every authoring book, then publishes the target
 * book(s) as immutable, versioned snapshots under `content-dist/`.
 *
 * For each target book:
 *   1. Validates the whole catalog first — an invalid book fails the publish
 *      BEFORE anything is written (invalid content never goes live).
 *   2. Computes the next `revision` for the (slug, edition) pair.
 *   3. Derives the preview payload (same boundary as `pnpm workflow:preview`).
 *   4. Writes an IMMUTABLE snapshot file (its id embeds slug/edition/revision).
 *   5. Rewrites `current.json` — the self-contained published artifact the
 *      platform loads (rollback = point this back to a previous snapshot).
 *   6. Appends the snapshot descriptor to `history.json` (append-only log).
 *   7. Copies `books/<slug>/assets/**` to `content-dist/assets/books/<slug>/`.
 *
 * Run: `pnpm workflow:publish` (all books) or `pnpm workflow:publish --slug=keigo-essentials`
 */

import { cpSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateBook } from '../src/content/validate';
import { derivePreview } from '../src/authoring/preview';
import type { PreviewBoundary } from '../src/authoring/preview';
import { nextRevision, snapshotDescriptorFor, withPublishedState } from '../src/authoring/publish';
import type { SnapshotDescriptor } from '../src/authoring/publish';
import { boundaryFor, contentDistRoot, discoverBooks, formatIssue, writeJson } from './lib/books';
import type { LoadedBook } from './lib/books';

const PUBLISH_SNAPSHOT_SCHEMA = 'publish-snapshot-v1';

interface PublishOptions {
  slug?: string;
}

function parseArgs(argv: string[]): PublishOptions {
  const slugArg = argv.find((arg) => arg.startsWith('--slug='));
  return { slug: slugArg === undefined ? undefined : slugArg.slice('--slug='.length) };
}

/** Resolves the effective preview boundary (whole-book default when undeclared). */
function effectiveBoundary(book: LoadedBook, lastChapterId: string): PreviewBoundary {
  return boundaryFor(book) ?? { kind: 'chapter', chapterId: lastChapterId };
}

interface HistoryFile {
  snapshots: SnapshotDescriptor[];
}

function readHistory(historyPath: string): HistoryFile {
  if (!existsSync(historyPath)) return { snapshots: [] };
  const parsed = JSON.parse(readFileSync(historyPath, 'utf8')) as Partial<HistoryFile>;
  return { snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [] };
}

/** Copies `books/<slug>/assets/**` to `content-dist/assets/books/<slug>/`. */
function copyAssets(book: LoadedBook): void {
  const src = join(book.bookDir, 'assets');
  if (!existsSync(src)) return;
  const dest = join(contentDistRoot(), 'assets', 'books', book.slug);
  cpSync(src, dest, { recursive: true });
}

function publishOne(book: LoadedBook): boolean {
  const result = validateBook(book.raw);
  if (!result.ok) {
    console.log(`ERR  ${book.slug}: book is invalid; nothing was published.`);
    for (const issue of result.issues) {
      console.log(`     - ${formatIssue(issue)}`);
    }
    return false;
  }
  const value = result.value;

  const bookDist = join(contentDistRoot(), 'books', book.slug);
  const history = readHistory(join(bookDist, 'history.json'));
  const editionNumber = value.edition?.number ?? 1;
  const revision = nextRevision(history.snapshots, book.slug, editionNumber);
  const createdAt = new Date().toISOString();
  const descriptor = snapshotDescriptorFor(value, revision, createdAt);
  const publishedBook = withPublishedState(value, descriptor.releasedAt);

  const boundary = effectiveBoundary(book, value.chapters[value.chapters.length - 1]!.id);
  const derived = derivePreview(value, boundary);
  if (!derived.ok) {
    console.log(`ERR  ${book.slug}: invalid preview boundary; nothing was published.`);
    for (const issue of derived.issues) {
      console.log(`     - ${issue.path}  ${issue.message}`);
    }
    return false;
  }

  const snapshot = {
    schema: PUBLISH_SNAPSHOT_SCHEMA,
    descriptor,
    preview: derived.value,
    book: publishedBook,
  };

  const snapshotPath = join(bookDist, 'snapshots', `${descriptor.id}.json`);
  if (existsSync(snapshotPath)) {
    console.error(`ERR  ${book.slug}: snapshot ${descriptor.id} already exists; refusing to overwrite.`);
    return false;
  }
  writeJson(snapshotPath, snapshot);
  writeJson(join(bookDist, 'current.json'), snapshot);
  writeJson(join(bookDist, 'history.json'), { snapshots: [...history.snapshots, descriptor] });
  copyAssets(book);

  console.log(`ok   ${book.slug}: published -> ${descriptor.id} (released ${descriptor.releasedAt})`);
  return true;
}

function main(): number {
  const { slug } = parseArgs(process.argv.slice(2));
  const books = discoverBooks();
  const targets = slug === undefined ? books : books.filter((book) => book.slug === slug);

  if (slug !== undefined && targets.length === 0) {
    console.error(`ERR  unknown book slug "${slug}".`);
    return 1;
  }
  if (targets.length === 0) {
    console.log('No authoring books found under books/ (each book needs a <slug>/book.json).');
    return 0;
  }

  // Validate the whole catalog first: nothing is published if any book is
  // invalid, because the platform loads the full catalog.
  for (const book of books) {
    const result = validateBook(book.raw);
    if (!result.ok) {
      console.log(`ERR  ${book.slug}: book is invalid; aborting before any publish.`);
      for (const issue of result.issues) {
        console.log(`     - ${formatIssue(issue)}`);
      }
      return 1;
    }
  }

  const results = targets.map(publishOne);
  const failed = results.filter((ok) => !ok).length;
  if (failed > 0) {
    console.log(`\n${failed} of ${targets.length} target(s) FAILED to publish.`);
    return 1;
  }
  console.log(`\nPublished ${targets.length} book(s) to content-dist/. Snapshots are immutable; rollback repoints current.json.`);
  return 0;
}

process.exitCode = main();
