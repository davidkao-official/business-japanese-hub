/**
 * Operator / service-role script: seeds the `catalog` price seam from the released
 * publish snapshots under `content-dist/books/<slug>/current.json`.
 *
 * Context (docs/payments/decision-record.md §8.3): the client can never supply a
 * trusted amount/currency. The server takes price ONLY from the authoritative
 * `catalog` table, which this script writes from content-dist. The publish
 * snapshot's `Price.amount` is a major-unit DISPLAY value (src/content/types.ts),
 * never used for arithmetic — this script converts it to the canonical minor-unit
 * `amount_minor` per the locked Money contract (src/lib/payments/contract.ts):
 *   JPY   minor unit = 1   (JPY 880 -> amount_minor 880)
 *   TWD   minor unit = 100 (TWD 790 -> amount_minor 79000)
 *   USD   minor unit = 100
 * Any other currency has no locked minor-unit exponent -> the book is refused.
 *
 * SAFETY:
 *  - Reads ONLY released snapshots (current.json with publication.status='published').
 *    It never writes prices for unreleased/draft content.
 *  - Requires a service-role Supabase client (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
 *    The service-role key is a privileged secret that must never live in the browser.
 *  - `--dry-run` prints the would-be rows and writes nothing.
 *
 * Run:
 *   pnpm exec tsx scripts/update-catalog.ts --help
 *   pnpm exec tsx scripts/update-catalog.ts --dry-run
 *   pnpm exec tsx scripts/update-catalog.ts --slug=keigo-essentials
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm exec tsx scripts/update-catalog.ts
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSafeMoney } from '../src/lib/payments/contract';
import type { Money } from '../src/lib/payments/contract';
import { contentDistRoot } from './lib/books';

/** Shape of the releaseTimestamp source within a publish snapshot. */
interface SnapshotDescriptor {
  id?: string;
  slug?: string;
  createdAt?: string;
  releasedAt?: string;
}

/** Minimal view of the published Book inside a snapshot (fields the seam needs). */
interface SnapshotBook {
  id?: string;
  slug?: string;
  price?: { tier?: string; amount?: number; currency?: string };
  publication?: { status?: string; releasedAt?: string };
}

/** Parsed `content-dist/books/<slug>/current.json`. */
interface SnapshotFile {
  schema?: string;
  descriptor?: SnapshotDescriptor;
  book?: SnapshotBook;
}

/** A row this script would upsert into `public.catalog`. */
interface CatalogRow {
  book_id: string;
  slug: string;
  currency: string;
  amount_minor: number;
  published_revision: string;
  released_at: string;
  updated_at: string;
}

/** Per-book build outcome. */
type BuildResult =
  | { kind: 'row'; row: CatalogRow }
  | { kind: 'skip'; reason: string }
  | { kind: 'error'; reason: string };

interface UpdateCatalogOptions {
  slug?: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): UpdateCatalogOptions {
  const slugArg = argv.find((arg) => arg.startsWith('--slug='));
  return {
    slug: slugArg === undefined ? undefined : slugArg.slice('--slug='.length),
    dryRun: argv.includes('--dry-run'),
  };
}

function printHelp(): void {
  console.log(
    [
      'usage: pnpm exec tsx scripts/update-catalog.ts [options]',
      '',
      'Seeds the server-side `catalog` price seam (decision-record §8.3) from the released',
      'publish snapshots in content-dist/books/<slug>/current.json. Writes via a service-role',
      'Supabase client (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).',
      '',
      'options:',
      '  --slug=<slug>   seed only the given book slug (default: all published books)',
      '  --dry-run       print the would-be catalog rows without writing to the DB',
      '  --help          show this help',
      '',
      'Only released (published) snapshots are read; unreleased/draft content is never priced.',
    ].join('\n'),
  );
}

/** Lists content-dist books that have a current.json (i.e. have been published). */
function listPublishedSlugs(): string[] {
  const root = join(contentDistRoot(), 'books');
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => {
      if (name.startsWith('.')) return false;
      const dir = join(root, name);
      return statSync(dir).isDirectory() && existsSync(join(dir, 'current.json'));
    })
    .sort();
}

function readSnapshot(slug: string): SnapshotFile | null {
  const path = join(contentDistRoot(), 'books', slug, 'current.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as SnapshotFile;
  } catch {
    return null;
  }
}

/** Release timestamp for a snapshot: descriptor.createdAt (full ISO) if present, else the date. */
function releaseTimestamp(snapshot: SnapshotFile): string | null {
  if (snapshot.descriptor?.createdAt) return snapshot.descriptor.createdAt;
  const releasedAt = snapshot.book?.publication?.releasedAt;
  return releasedAt ? `${releasedAt}T00:00:00Z` : null;
}

/**
 * Converts the major-unit display `Price.amount` to the canonical minor-unit
 * `amount_minor` (locked Money contract, §8.1). Returns null for currencies whose
 * minor-unit exponent is not locked (JPY=1, TWD/USD=100).
 */
function toAmountMinor(price: { amount?: number; currency?: string }): number | null {
  if (price.amount === undefined || price.currency === undefined) return null;
  const exponent =
    price.currency === 'JPY' ? 1 : price.currency === 'TWD' || price.currency === 'USD' ? 100 : null;
  if (exponent === null) return null;
  return price.amount * exponent;
}

/** Builds the catalog row for one released snapshot, or reports skip/error. */
function buildCatalogRow(slug: string, snapshot: SnapshotFile): BuildResult {
  const book = snapshot.book;
  const releasedAt = releaseTimestamp(snapshot);
  const publishedRevision = snapshot.descriptor?.id;
  const bookId = book?.id;
  const bookSlug = book?.slug ?? slug;
  const tier = book?.price?.tier;

  // Never price unreleased content.
  if (book?.publication?.status !== 'published') {
    return { kind: 'error', reason: `not a published snapshot (publication.status=${String(book?.publication?.status)})` };
  }
  if (releasedAt === null) {
    return { kind: 'error', reason: 'no release timestamp on the snapshot' };
  }
  if (!publishedRevision) {
    return { kind: 'error', reason: 'snapshot has no descriptor.id' };
  }
  if (!bookId) {
    return { kind: 'error', reason: 'snapshot has no book.id' };
  }

  // Only paid books have a price seam; free/preview books are not sold.
  if (tier !== 'paid') {
    return { kind: 'skip', reason: `tier=${String(tier)} (not sold via the price seam)` };
  }

  const amountMinor = toAmountMinor(book.price ?? {});
  const currency = book.price?.currency;
  if (amountMinor === null || !currency) {
    return { kind: 'error', reason: 'paid book is missing amount/currency or has an unlocked currency' };
  }
  if (!isSafeMoney({ amount: amountMinor, currency } as Money)) {
    return { kind: 'error', reason: `converted amount_minor=${amountMinor} is not a safe, non-negative integer` };
  }

  return {
    kind: 'row',
    row: {
      book_id: bookId,
      slug: bookSlug,
      currency,
      amount_minor: amountMinor,
      published_revision: publishedRevision,
      released_at: releasedAt,
      updated_at: new Date().toISOString(),
    },
  };
}

async function upsertCatalog(client: SupabaseClient, rows: CatalogRow[]): Promise<number> {
  const { error } = await client.from('catalog').upsert(rows, { onConflict: 'book_id' });
  if (error) {
    throw new Error(`catalog upsert failed: ${error.message}`);
  }
  return rows.length;
}

async function main(): Promise<number> {
  const { slug, dryRun } = parseArgs(process.argv.slice(2));
  if (process.argv.slice(2).includes('--help')) {
    printHelp();
    return 0;
  }

  const slugs = listPublishedSlugs();
  const targets = slug === undefined ? slugs : slugs.filter((s) => s === slug);
  if (slug !== undefined && targets.length === 0) {
    console.error(`ERR  unknown published book slug "${slug}" (no content-dist/books/${slug}/current.json).`);
    return 1;
  }
  if (targets.length === 0) {
    console.log('No published snapshots under content-dist/books/*/current.json (run pnpm workflow:publish first).');
    return 0;
  }

  const rows: CatalogRow[] = [];
  let failed = 0;
  let skipped = 0;
  for (const target of targets) {
    const snapshot = readSnapshot(target);
    if (snapshot === null) {
      console.error(`ERR  ${target}: could not read current.json`);
      failed += 1;
      continue;
    }
    const result = buildCatalogRow(target, snapshot);
    if (result.kind === 'row') {
      rows.push(result.row);
      console.log(`ok   ${target}: ${result.row.currency} ${result.row.amount_minor} (minor) @ ${result.row.published_revision}`);
    } else if (result.kind === 'skip') {
      skipped += 1;
      console.log(`-    ${target}: skipped (${result.reason})`);
    } else {
      failed += 1;
      console.error(`ERR  ${target}: ${result.reason}`);
    }
  }

  if (rows.length === 0) {
    console.log(`\nNo catalog rows to seed (${skipped} skipped, ${failed} failed).`);
    return failed > 0 ? 1 : 0;
  }

  if (dryRun) {
    console.log(`\n--dry-run: would upsert ${rows.length} catalog row(s); nothing written.`);
    return failed > 0 ? 1 : 0;
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error('\nERR  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to write the catalog.');
    console.error('     (Use --dry-run to preview without a provisioned Supabase instance.)');
    return 1;
  }

  const client = createClient(url, serviceRoleKey);
  try {
    const count = await upsertCatalog(client, rows);
    console.log(`\nSeeded ${count} catalog row(s) via service_role.`);
  } catch (err) {
    console.error(`\nERR  ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  return failed > 0 ? 1 : 0;
}

void main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error(`ERR  ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
