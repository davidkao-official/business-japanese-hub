/**
 * Workflow: rollback — repoints a book's `current.json` back to a previous
 * immutable snapshot. Snapshots are never deleted or mutated; only the
 * "current" pointer moves, so a rollback is always reversible by republishing.
 *
 * Run:
 *   `pnpm workflow:rollback --slug=keigo-essentials`        (previous snapshot)
 *   `pnpm workflow:rollback --slug=keigo-essentials --to=<snapshotId>`
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentDistRoot, writeJson } from './lib/books';
import type { SnapshotDescriptor } from '../src/authoring/publish';

interface RollbackOptions {
  slug: string;
  to?: string;
}

function parseArgs(argv: string[]): RollbackOptions {
  const slugArg = argv.find((arg) => arg.startsWith('--slug='));
  const toArg = argv.find((arg) => arg.startsWith('--to='));
  return {
    slug: slugArg === undefined ? '' : slugArg.slice('--slug='.length),
    to: toArg === undefined ? undefined : toArg.slice('--to='.length),
  };
}

function main(): number {
  const { slug, to } = parseArgs(process.argv.slice(2));
  if (slug.length === 0) {
    console.error('ERR  rollback requires --slug=<book-slug>.');
    return 1;
  }

  const bookDist = join(contentDistRoot(), 'books', slug);
  const historyPath = join(bookDist, 'history.json');
  if (!existsSync(historyPath)) {
    console.error(`ERR  no publish history for "${slug}"; nothing to roll back.`);
    return 1;
  }
  const history = (JSON.parse(readFileSync(historyPath, 'utf8')) as { snapshots?: SnapshotDescriptor[] })
    .snapshots ?? [];
  if (history.length === 0) {
    console.error(`ERR  no published snapshots for "${slug}".`);
    return 1;
  }

  const currentPath = join(bookDist, 'current.json');
  const currentId = existsSync(currentPath)
    ? (JSON.parse(readFileSync(currentPath, 'utf8')) as { descriptor?: SnapshotDescriptor }).descriptor?.id
    : undefined;

  let targetId: string;
  if (to !== undefined) {
    if (!history.some((entry) => entry.id === to)) {
      console.error(`ERR  unknown snapshot "${to}". Published snapshots:\n    ${history.map((entry) => entry.id).join('\n    ')}`);
      return 1;
    }
    targetId = to;
  } else {
    const currentIndex = history.findIndex((entry) => entry.id === currentId);
    if (currentIndex <= 0) {
      console.error(`ERR  "${slug}" is at its first published snapshot; nothing earlier to roll back to.`);
      return 1;
    }
    targetId = history[currentIndex - 1]!.id;
  }

  const snapshotPath = join(bookDist, 'snapshots', `${targetId}.json`);
  if (!existsSync(snapshotPath)) {
    console.error(`ERR  snapshot file missing: ${targetId}`);
    return 1;
  }
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  writeJson(currentPath, snapshot);

  console.log(`ok   ${slug}: current -> ${targetId}${currentId === undefined ? '' : ` (from ${currentId})`}`);
  console.log(`     Note: snapshots are immutable; to undo this rollback, republish.`);
  return 0;
}

process.exitCode = main();
