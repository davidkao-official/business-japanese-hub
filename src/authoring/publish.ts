/**
 * Publish snapshot / version helpers for the authoring workflow (issue #10).
 *
 * MVP versioning model (see docs/authoring.md §5):
 * - `edition.number` is authored by humans and bumped for substantive revisions.
 * - `revision` is an auto-incremented counter stamped by the pipeline on every
 *   publish of a given (slug, edition) pair.
 * - Each publish writes an IMMUTABLE snapshot whose id embeds
 *   slug/edition/revision; rollback points the "current" pointer back to a
 *   previous snapshot. Snapshots are never mutated or deleted.
 *
 * Pure, deterministic, filesystem-free. Input books must already have passed
 * `validateBook`.
 */

import type { Book } from '../content/types';

/** Metadata describing one immutable publish snapshot. */
export interface SnapshotDescriptor {
  /** Stable snapshot id, e.g. "keigo-essentials@e1-r1". */
  id: string;
  /** The book slug this snapshot belongs to. */
  slug: string;
  /** `book.edition.number`, defaulting to 1 when the author did not set one. */
  editionNumber: number;
  /** 1-based auto-incremented publish counter for this (slug, edition). */
  revision: number;
  status: 'published';
  /** Date-only ISO 8601 (YYYY-MM-DD) release date, derived from `createdAt`. */
  releasedAt: string;
  /** Full ISO 8601 timestamp when the snapshot was created. */
  createdAt: string;
}

const SNAPSHOT_ID_PATTERN = /^(.+)@e(\d+)-r(\d+)$/;

/** Builds a snapshot id such as "keigo-essentials@e1-r1". */
export function snapshotIdFor(slug: string, editionNumber: number, revision: number): string {
  return `${slug}@e${editionNumber}-r${revision}`;
}

/** Parsed parts of a snapshot id; `null` when the id does not match the format. */
export interface ParsedSnapshotId {
  slug: string;
  editionNumber: number;
  revision: number;
}

/** Parses a snapshot id; returns `null` for ids outside the documented format. */
export function parseSnapshotId(id: string): ParsedSnapshotId | null {
  const match = SNAPSHOT_ID_PATTERN.exec(id);
  if (match === null) return null;
  return {
    slug: match[1]!,
    editionNumber: Number(match[2]),
    revision: Number(match[3]),
  };
}

/**
 * The next revision for a (slug, edition) pair: one greater than the highest
 * revision already published, or 1 when the pair has never been published.
 */
export function nextRevision(
  history: SnapshotDescriptor[],
  slug: string,
  editionNumber: number,
): number {
  let max = 0;
  for (const entry of history) {
    if (entry.slug === slug && entry.editionNumber === editionNumber && entry.revision > max) {
      max = entry.revision;
    }
  }
  return max + 1;
}

/** Builds the descriptor for a snapshot; `releasedAt` is the date part of `createdAt`. */
export function snapshotDescriptorFor(book: Book, revision: number, createdAt: string): SnapshotDescriptor {
  return {
    id: snapshotIdFor(book.slug, book.edition?.number ?? 1, revision),
    slug: book.slug,
    editionNumber: book.edition?.number ?? 1,
    revision,
    status: 'published',
    releasedAt: createdAt.slice(0, 10),
    createdAt,
  };
}

/**
 * Returns a NEW book object whose `publication` state is `published` with the
 * given release date. Existing publication metadata (e.g. forward-compatible
 * extra fields) is preserved. The input book is not mutated.
 */
export function withPublishedState(book: Book, releasedAt: string): Book {
  return {
    ...book,
    publication: {
      ...book.publication,
      status: 'published',
      releasedAt,
    },
  };
}
