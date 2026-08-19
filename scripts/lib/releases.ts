import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { validateReleaseSnapshot } from '../../src/authoring/release';
import type { ReleaseSnapshot } from '../../src/authoring/release';

function assetFiles(root: string, directory: string = root): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .flatMap((name) => {
      const path = join(directory, name);
      return statSync(path).isDirectory() ? assetFiles(root, path) : [path];
    })
    .sort((left, right) => relative(root, left).localeCompare(relative(root, right)));
}

/** SHA-256 of the exact customer-facing release payload and every asset byte. */
export function releaseContentHash(payload: unknown, assetsDirectory: string): string {
  const hash = createHash('sha256');
  hash.update(JSON.stringify(payload));
  for (const path of assetFiles(assetsDirectory)) {
    hash.update('\0');
    hash.update(relative(assetsDirectory, path));
    hash.update('\0');
    hash.update(readFileSync(path));
  }
  return hash.digest('hex');
}

export type VerifiableReleaseSnapshot = ReleaseSnapshot;

/** Verify that a release artifact still matches its content-addressed identity. */
export function verifyReleaseContent(
  slug: string,
  snapshot: VerifiableReleaseSnapshot,
  assetsDirectory: string,
): string | null {
  const structural = validateReleaseSnapshot(snapshot, slug);
  if (!structural.ok) return structural.reason;
  const descriptor = snapshot.descriptor;
  if (descriptor?.slug !== slug || typeof descriptor.id !== 'string') return 'invalid descriptor identity';
  if (typeof descriptor.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(descriptor.contentHash)) {
    return 'invalid descriptor contentHash';
  }
  const actual = releaseContentHash(
    { book: snapshot.book, preview: snapshot.preview, catalog: snapshot.catalog ?? {} },
    assetsDirectory,
  );
  if (actual !== descriptor.contentHash) return `content hash mismatch (expected ${descriptor.contentHash}, got ${actual})`;
  if (!descriptor.id.endsWith(`-${actual.slice(0, 12)}`)) return 'snapshot id does not match contentHash';
  return null;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

/** Verify current, immutable snapshot, history ledger, and both asset copies together. */
export function verifyCommittedRelease(slug: string, contentRoot: string): string[] {
  const issues: string[] = [];
  const bookRoot = join(contentRoot, 'books', slug);
  const currentPath = join(bookRoot, 'current.json');
  if (!existsSync(currentPath)) return ['current.json is missing'];

  const currentRaw = readFileSync(currentPath, 'utf8');
  const current = JSON.parse(currentRaw) as VerifiableReleaseSnapshot;
  const descriptor = current.descriptor;
  const id = typeof descriptor?.id === 'string' ? descriptor.id : '';
  const identityIssue = verifyReleaseContent(slug, current, join(contentRoot, 'assets', 'books', slug));
  if (identityIssue) issues.push(identityIssue);
  if (id.length === 0) return [...issues, 'current snapshot has no descriptor.id'];

  const immutablePath = join(bookRoot, 'snapshots', `${id}.json`);
  if (!existsSync(immutablePath)) {
    issues.push(`immutable snapshot is missing: ${id}`);
  } else {
    const immutableRaw = readFileSync(immutablePath, 'utf8');
    if (immutableRaw !== currentRaw) issues.push('current.json differs from its immutable snapshot');
    const immutable = JSON.parse(immutableRaw) as VerifiableReleaseSnapshot;
    const immutableIssue = verifyReleaseContent(
      slug,
      immutable,
      join(contentRoot, 'assets', 'snapshots', slug, id),
    );
    if (immutableIssue) issues.push(`immutable snapshot: ${immutableIssue}`);
  }

  const historyPath = join(bookRoot, 'history.json');
  if (!existsSync(historyPath)) {
    issues.push('history.json is missing');
  } else {
    const history = readJson(historyPath) as { snapshots?: unknown[] };
    const match = history.snapshots?.find(
      (entry) => typeof entry === 'object' && entry !== null && 'id' in entry && entry.id === id,
    );
    if (JSON.stringify(match) !== JSON.stringify(descriptor)) {
      issues.push('history.json does not contain the exact current descriptor');
    }
  }
  return issues;
}
