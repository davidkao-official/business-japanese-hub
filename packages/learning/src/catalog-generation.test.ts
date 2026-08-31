import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildLearningCatalog,
  serializeLearningCatalog,
  verifyCommittedLearningCatalog,
  writeLearningCatalog,
} from '../../../scripts/lib/learning';

function fixtureRoot(): string {
  return mkdtempSync(join(tmpdir(), 'bjh-learning-catalog-'));
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function addRelease(
  root: string,
  slug: string,
  options: {
    bookId?: string;
    bookSlug?: string;
    descriptorSlug?: string;
    releaseId?: string;
    chapters?: Array<{ id: string; slug: string }>;
    publicChapterIds?: string[];
    previewChapters?: Array<{ id: string; slug?: string }>;
    manifest?: unknown;
  } = {},
): void {
  const chapters = options.chapters ?? [{ id: `${slug}-chapter`, slug: 'first-chapter' }];
  writeJson(join(root, 'content-dist', 'books', slug, 'current.json'), {
    schema: 'publish-snapshot-v1',
    descriptor: {
      id: options.releaseId ?? `${slug}@e1-r1-123456789abc`,
      slug: options.descriptorSlug ?? slug,
    },
    book: {
      id: options.bookId ?? `book-${slug}`,
      slug: options.bookSlug ?? slug,
      chapters,
    },
    preview: {
      chapters:
        options.previewChapters ??
        chapters.filter(({ id }) =>
          (options.publicChapterIds ?? chapters.map((chapter) => chapter.id)).includes(id),
        ),
    },
  });
  if (options.manifest !== undefined) {
    writeJson(join(root, 'books', slug, 'manifest.json'), options.manifest);
  }
}

describe('Library learning catalog', () => {
  it('builds a deterministic registry for every released chapter, including empty mappings', () => {
    const root = fixtureRoot();
    addRelease(root, 'zeta', {
      chapters: [
        { id: 'z-2', slug: 'second' },
        { id: 'z-1', slug: 'first' },
      ],
      publicChapterIds: ['z-2'],
      manifest: {
        learning: { chapters: { 'z-1': ['request-clarification'] } },
      },
    });
    addRelease(root, 'alpha', {
      chapters: [{ id: 'a-1', slug: 'opening' }],
      manifest: {
        learning: { chapters: { 'a-1': ['workplace-greeting', 'error-reporting'] } },
      },
    });

    const catalog = buildLearningCatalog(root);

    expect(catalog).toEqual({
      schemaVersion: 1,
      books: [
        {
          bookId: 'book-alpha',
          bookSlug: 'alpha',
          releaseId: 'alpha@e1-r1-123456789abc',
          chapters: [
            {
              chapterId: 'a-1',
              chapterSlug: 'opening',
              access: 'public',
              skillIds: ['workplace-greeting', 'error-reporting'],
            },
          ],
        },
        {
          bookId: 'book-zeta',
          bookSlug: 'zeta',
          releaseId: 'zeta@e1-r1-123456789abc',
          chapters: [
            { chapterId: 'z-2', chapterSlug: 'second', access: 'public', skillIds: [] },
            {
              chapterId: 'z-1',
              chapterSlug: 'first',
              access: 'entitled',
              skillIds: ['request-clarification'],
            },
          ],
        },
      ],
    });
    expect(serializeLearningCatalog(catalog)).toBe(`${JSON.stringify(catalog, null, 2)}\n`);
    expect(buildLearningCatalog(root)).toEqual(catalog);
  });

  it.each([
    {
      name: 'an unknown manifest chapter',
      manifest: { learning: { chapters: { missing: ['error-reporting'] } } },
      reason: 'books/alpha/manifest.json learning chapter "missing" is not in the current release',
    },
    {
      name: 'an unknown skill',
      manifest: { learning: { chapters: { 'alpha-chapter': ['unknown-skill'] } } },
      reason:
        'books/alpha/manifest.json learning.chapters["alpha-chapter"] skillIds[0] must be a known learning skill ID',
    },
    {
      name: 'duplicate skills',
      manifest: {
        learning: { chapters: { 'alpha-chapter': ['error-reporting', 'error-reporting'] } },
      },
      reason:
        'books/alpha/manifest.json learning.chapters["alpha-chapter"] skillIds must not contain duplicate "error-reporting"',
    },
    {
      name: 'an unexpected learning metadata field',
      manifest: { learning: { chapters: {}, typo: true } },
      reason: 'books/alpha/manifest.json learning must contain only "chapters"',
    },
  ])('rejects $name', ({ manifest, reason }) => {
    const root = fixtureRoot();
    addRelease(root, 'alpha', { manifest });
    expect(() => buildLearningCatalog(root)).toThrow(reason);
  });

  it.each([
    {
      name: 'descriptor slug',
      options: { descriptorSlug: 'not-alpha' },
      reason: 'content-dist/books/alpha/current.json descriptor.slug must equal "alpha"',
    },
    {
      name: 'book slug',
      options: { bookSlug: 'not-alpha' },
      reason: 'content-dist/books/alpha/current.json book.slug must equal "alpha"',
    },
    {
      name: 'release identity',
      options: { releaseId: 'not-an-alpha-release' },
      reason: 'content-dist/books/alpha/current.json descriptor.id must begin with "alpha@"',
    },
    {
      name: 'preview chapter reference',
      options: { previewChapters: [{ id: 'not-a-released-chapter' }] },
      reason:
        'content-dist/books/alpha/current.json preview chapter "not-a-released-chapter" is not in book.chapters',
    },
  ])('rejects mismatched $name', ({ options, reason }) => {
    const root = fixtureRoot();
    addRelease(root, 'alpha', options);
    expect(() => buildLearningCatalog(root)).toThrow(reason);
  });

  it('writes the canonical artifact and detects stale or malformed committed content', () => {
    const root = fixtureRoot();
    addRelease(root, 'alpha', {
      manifest: {
        learning: { chapters: { 'alpha-chapter': ['workplace-greeting'] } },
      },
    });

    expect(verifyCommittedLearningCatalog(root)).toEqual([
      'content-dist/learning-catalog.json is missing',
    ]);

    writeLearningCatalog(root);
    const artifactPath = join(root, 'content-dist', 'learning-catalog.json');
    expect(verifyCommittedLearningCatalog(root)).toEqual([]);

    const missingAccess = JSON.parse(readFileSync(artifactPath, 'utf8')) as {
      books: Array<{ chapters: Array<Record<string, unknown>> }>;
    };
    delete missingAccess.books[0]?.chapters[0]?.access;
    writeJson(artifactPath, missingAccess);
    expect(verifyCommittedLearningCatalog(root)).toEqual([
      'content-dist/learning-catalog.json is malformed: books[0].chapters[0].access must be "public" or "entitled"',
    ]);

    writeFileSync(artifactPath, '{ malformed', 'utf8');
    expect(verifyCommittedLearningCatalog(root)).toEqual([
      'content-dist/learning-catalog.json is not valid JSON',
    ]);

    writeJson(artifactPath, { schemaVersion: 1, books: [] });
    expect(verifyCommittedLearningCatalog(root)).toEqual([
      'content-dist/learning-catalog.json is stale; run pnpm workflow:update-learning-catalog',
    ]);

    writeLearningCatalog(root);
    expect(readFileSync(artifactPath, 'utf8')).toBe(
      serializeLearningCatalog(buildLearningCatalog(root)),
    );
  });

  it('keeps every live released reference and the reviewed Library associations in the committed artifact', () => {
    const root = process.cwd();
    const catalog = buildLearningCatalog(root);
    expect(verifyCommittedLearningCatalog(root)).toEqual([]);

    const catalogRefs = catalog.books.flatMap((book) =>
      book.chapters.map((chapter) => `${book.bookId}:${chapter.chapterId}`),
    );
    const releaseRefs = catalog.books.flatMap((book) => {
      const release = JSON.parse(
        readFileSync(join(root, 'content-dist', 'books', book.bookSlug, 'current.json'), 'utf8'),
      ) as { book: { id: string; chapters: Array<{ id: string }> } };
      return release.book.chapters.map((chapter) => `${release.book.id}:${chapter.id}`);
    });
    expect(catalogRefs).toEqual(releaseRefs);

    const associatedRefs = catalog.books.flatMap((book) =>
      book.chapters.flatMap((chapter) =>
        chapter.skillIds.map((skillId) => `${book.bookId}:${chapter.chapterId}:${skillId}`),
      ),
    );
    expect(associatedRefs).toEqual([
      'book-sample-bj-email:bm-ch-3:request-clarification',
      'book-sample-bj-keigo:ch-2:workplace-greeting',
      'book-meeting-japanese:mj-ch-04:meeting-disagreement',
    ]);
    for (const gameOnlySkillId of ['deadline-negotiation', 'error-reporting']) {
      expect(associatedRefs.some((reference) => reference.endsWith(`:${gameOnlySkillId}`))).toBe(
        false,
      );
    }

    const taggedChapterAccess = catalog.books.flatMap((book) =>
      book.chapters
        .filter((chapter) => chapter.skillIds.length > 0)
        .map((chapter) => `${book.bookId}:${chapter.chapterId}:${chapter.access}`),
    );
    expect(taggedChapterAccess).toEqual([
      'book-sample-bj-email:bm-ch-3:public',
      'book-sample-bj-keigo:ch-2:public',
      'book-meeting-japanese:mj-ch-04:entitled',
    ]);
  });
});
