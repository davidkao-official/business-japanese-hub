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
import { contentDistRoot } from './lib/books';
import { buildCatalogRow, catalogRetirements } from './lib/catalog';
import type { CatalogRow, SnapshotFile } from './lib/catalog';
import { verifyCommittedRelease } from './lib/releases';

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

async function upsertCatalog(client: SupabaseClient, rows: CatalogRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const { error } = await client.from('catalog').upsert(rows, { onConflict: 'book_id' });
  if (error) {
    throw new Error(`catalog upsert failed: ${error.message}`);
  }
  return rows.length;
}

async function existingCatalogBookIds(client: SupabaseClient): Promise<string[]> {
  const { data, error } = await client.from('catalog').select('book_id');
  if (error) throw new Error(`catalog inventory read failed: ${error.message}`);
  return (data ?? [])
    .map((row) => (typeof row.book_id === 'string' ? row.book_id : null))
    .filter((bookId): bookId is string => bookId !== null);
}

async function retireCatalog(client: SupabaseClient, bookIds: string[]): Promise<number> {
  if (bookIds.length === 0) return 0;
  const { error } = await client.from('catalog').delete().in('book_id', bookIds);
  if (error) throw new Error(`catalog retirement failed: ${error.message}`);
  return bookIds.length;
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
    console.log('No released snapshots found; a full live sync will retire every stale server catalog row.');
  }

  const rows: CatalogRow[] = [];
  const explicitRetirements: string[] = [];
  let failed = 0;
  for (const target of targets) {
    const snapshot = readSnapshot(target);
    if (snapshot === null) {
      console.error(`ERR  ${target}: could not read current.json`);
      failed += 1;
      continue;
    }
    const integrityIssues = verifyCommittedRelease(target, contentDistRoot());
    if (integrityIssues.length > 0) {
      console.error(`ERR  ${target}: release integrity failed: ${integrityIssues.join('; ')}`);
      failed += 1;
      continue;
    }
    const result = buildCatalogRow(target, snapshot);
    if (result.kind === 'row') {
      rows.push(result.row);
      console.log(`ok   ${target}: ${result.row.currency} ${result.row.amount_minor} (minor) @ ${result.row.published_revision}`);
    } else if (result.kind === 'retire') {
      explicitRetirements.push(result.bookId);
      console.log(`-    ${target}: retire ${result.bookId} (${result.reason})`);
    } else {
      failed += 1;
      console.error(`ERR  ${target}: ${result.reason}`);
    }
  }

  if (failed > 0) {
    console.error(`\nERR  ${failed} release snapshot(s) failed validation; catalog was not changed.`);
    return 1;
  }

  if (dryRun) {
    const fullSyncNote = slug === undefined ? ' and retire any stale server rows' : '';
    console.log(
      `\n--dry-run: would retire ${explicitRetirements.length} known row(s)${fullSyncNote}, then upsert ${rows.length} catalog row(s); nothing written.`,
    );
    return 0;
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
    const existing = slug === undefined ? await existingCatalogBookIds(client) : [];
    const retirements = catalogRetirements(existing, rows, explicitRetirements, slug === undefined);
    // Fail closed: withdrawn/free/stale products stop selling before any price is activated.
    const retired = await retireCatalog(client, retirements);
    const seeded = await upsertCatalog(client, rows);
    console.log(`\nRetired ${retired} catalog row(s); seeded ${seeded} paid row(s) via service_role.`);
  } catch (err) {
    console.error(`\nERR  ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  return 0;
}

void main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error(`ERR  ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
