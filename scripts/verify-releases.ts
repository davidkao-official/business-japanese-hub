/** Verify every committed release before Vite compiles it into the storefront. */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { contentDistRoot } from './lib/books';
import { verifyCommittedRelease } from './lib/releases';

function releaseSlugs(): string[] {
  const root = join(contentDistRoot(), 'books');
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((slug) => {
      const directory = join(root, slug);
      return statSync(directory).isDirectory() && existsSync(join(directory, 'current.json'));
    })
    .sort();
}

const slugs = releaseSlugs();
if (slugs.length === 0) {
  console.error('ERR  no committed release snapshots found under content-dist/books/.');
  process.exitCode = 1;
} else {
  let failed = 0;
  for (const slug of slugs) {
    const issues = verifyCommittedRelease(slug, contentDistRoot());
    if (issues.length === 0) {
      console.log(`ok   ${slug}: committed release integrity verified`);
    } else {
      failed += 1;
      console.error(`ERR  ${slug}: ${issues.join('; ')}`);
    }
  }
  if (failed > 0) process.exitCode = 1;
}
