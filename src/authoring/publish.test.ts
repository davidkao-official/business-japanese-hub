import { describe, expect, it } from 'vitest';
import { sampleBook } from '../content/fixtures/sample-book';
import {
  nextRevision,
  parseSnapshotId,
  snapshotDescriptorFor,
  snapshotIdFor,
  withPublishedState,
} from './publish';
import type { SnapshotDescriptor } from './publish';

function history(entries: Array<Partial<SnapshotDescriptor>>): SnapshotDescriptor[] {
  return entries.map(
    (entry, index) =>
      ({
        id: `book@e1-r${index + 1}`,
        slug: 'book',
        editionNumber: 1,
        revision: index + 1,
        status: 'published',
        releasedAt: '2026-08-14',
        createdAt: '2026-08-14T00:00:00.000Z',
        ...entry,
      }) satisfies SnapshotDescriptor,
  );
}

describe('snapshot ids', () => {
  it('formats and parses a snapshot id', () => {
    const id = snapshotIdFor('keigo-essentials', 1, 3);
    expect(id).toBe('keigo-essentials@e1-r3');
    expect(parseSnapshotId(id)).toEqual({ slug: 'keigo-essentials', editionNumber: 1, revision: 3 });
  });

  it('rejects malformed snapshot ids', () => {
    expect(parseSnapshotId('keigo-essentials')).toBeNull();
    expect(parseSnapshotId('keigo-essentials@e1')).toBeNull();
    expect(parseSnapshotId('@e1-r1')).toBeNull();
  });
});

describe('nextRevision', () => {
  it('starts at 1 for a never-published (slug, edition) pair', () => {
    expect(nextRevision([], 'keigo-essentials', 1)).toBe(1);
  });

  it('increments past the highest revision of the matching (slug, edition)', () => {
    const entries = history([
      { id: 'a@e1-r1', slug: 'a', revision: 1 },
      { id: 'a@e1-r2', slug: 'a', revision: 2 },
      { id: 'a@e2-r1', slug: 'a', editionNumber: 2, revision: 1 },
      { id: 'other@e1-r9', slug: 'other', revision: 9 },
    ]);
    expect(nextRevision(entries, 'a', 1)).toBe(3);
    expect(nextRevision(entries, 'a', 2)).toBe(2);
    expect(nextRevision(entries, 'other', 1)).toBe(10);
    expect(nextRevision(entries, 'never-seen', 1)).toBe(1);
  });
});

describe('snapshotDescriptorFor', () => {
  it('derives the descriptor from the book and a creation timestamp', () => {
    const descriptor = snapshotDescriptorFor(sampleBook, 3, '2026-08-14T21:00:00.000Z');
    expect(descriptor).toEqual({
      id: 'keigo-essentials@e1-r3',
      slug: 'keigo-essentials',
      editionNumber: 1,
      revision: 3,
      status: 'published',
      releasedAt: '2026-08-14',
      createdAt: '2026-08-14T21:00:00.000Z',
    });
  });

  it('defaults the edition to 1 when the book has none', () => {
    const book = { ...sampleBook };
    delete book.edition;
    const descriptor = snapshotDescriptorFor(book, 1, '2026-08-14T00:00:00.000Z');
    expect(descriptor.editionNumber).toBe(1);
  });
});

describe('withPublishedState', () => {
  it('returns a new book whose publication state is published, without mutating the input', () => {
    expect(sampleBook.publication?.status).toBe('draft');
    const published = withPublishedState(sampleBook, '2026-08-14');
    expect(published.publication).toEqual({ status: 'published', releasedAt: '2026-08-14' });
    expect(sampleBook.publication?.status).toBe('draft');
    expect(published.slug).toBe(sampleBook.slug);
    expect(published.chapters).toBe(sampleBook.chapters);
  });
});
