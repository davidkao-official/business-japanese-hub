import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  LEARNING_EVIDENCE_REFERENCE_MAX_LENGTH,
  validateLearningSkillIds,
  type LearningSkillId,
} from '@business-japanese-hub/learning';
import { repoRoot } from './books';

export interface LibraryLearningChapter {
  chapterId: string;
  chapterSlug: string;
  access: 'public' | 'entitled';
  skillIds: LearningSkillId[];
}

export interface LibraryLearningBook {
  bookId: string;
  bookSlug: string;
  releaseId: string;
  chapters: LibraryLearningChapter[];
}

export interface LibraryLearningCatalog {
  schemaVersion: 1;
  books: LibraryLearningBook[];
}

interface PublishedChapter {
  id: string;
  slug: string;
}

interface PublishedRelease {
  descriptor: { id: string; slug: string };
  book: { id: string; slug: string; chapters: PublishedChapter[] };
  publicChapterIds: Set<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(path: string, displayPath: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    throw new Error(`${displayPath} is not valid JSON`);
  }
}

function requireNonEmptyString(
  value: unknown,
  path: string,
): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function learningEvidenceReferenceProblem(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return 'must be a non-empty string';
  if (value.length > LEARNING_EVIDENCE_REFERENCE_MAX_LENGTH) {
    return `must be at most ${LEARNING_EVIDENCE_REFERENCE_MAX_LENGTH} characters`;
  }
  if (value.trim() !== value) return 'must not have leading or trailing whitespace';
  return null;
}

function requireLearningEvidenceReference(value: unknown, path: string): string {
  const problem = learningEvidenceReferenceProblem(value);
  if (problem) throw new Error(`${path} ${problem}`);
  return value as string;
}

function releaseSlugs(root: string): string[] {
  const releasesRoot = join(root, 'content-dist', 'books');
  if (!existsSync(releasesRoot)) return [];
  return readdirSync(releasesRoot)
    .filter((slug) => {
      const directory = join(releasesRoot, slug);
      return statSync(directory).isDirectory() && existsSync(join(directory, 'current.json'));
    })
    .sort();
}

function readPublishedRelease(root: string, slug: string): PublishedRelease {
  const displayPath = `content-dist/books/${slug}/current.json`;
  const raw = parseJson(join(root, displayPath), displayPath);
  if (!isRecord(raw) || raw.schema !== 'publish-snapshot-v1') {
    throw new Error(`${displayPath} must be a publish-snapshot-v1 object`);
  }
  if (!isRecord(raw.descriptor)) throw new Error(`${displayPath} descriptor must be an object`);
  if (!isRecord(raw.book)) throw new Error(`${displayPath} book must be an object`);
  if (!isRecord(raw.preview) || !Array.isArray(raw.preview.chapters)) {
    throw new Error(`${displayPath} preview.chapters must be an array`);
  }

  const descriptorId = requireLearningEvidenceReference(
    raw.descriptor.id,
    `${displayPath} descriptor.id`,
  );
  const descriptorSlug = requireNonEmptyString(raw.descriptor.slug, `${displayPath} descriptor.slug`);
  if (descriptorSlug !== slug) {
    throw new Error(`${displayPath} descriptor.slug must equal "${slug}"`);
  }
  if (!descriptorId.startsWith(`${slug}@`)) {
    throw new Error(`${displayPath} descriptor.id must begin with "${slug}@"`);
  }

  const bookId = requireLearningEvidenceReference(raw.book.id, `${displayPath} book.id`);
  const bookSlug = requireNonEmptyString(raw.book.slug, `${displayPath} book.slug`);
  if (bookSlug !== slug) throw new Error(`${displayPath} book.slug must equal "${slug}"`);
  if (!Array.isArray(raw.book.chapters)) {
    throw new Error(`${displayPath} book.chapters must be an array`);
  }

  const seenChapterIds = new Set<string>();
  const seenChapterSlugs = new Set<string>();
  const chapters = raw.book.chapters.map((chapter, index): PublishedChapter => {
    const chapterPath = `${displayPath} book.chapters[${index}]`;
    if (!isRecord(chapter)) throw new Error(`${chapterPath} must be an object`);
    const id = requireLearningEvidenceReference(chapter.id, `${chapterPath}.id`);
    const chapterSlug = requireNonEmptyString(chapter.slug, `${chapterPath}.slug`);
    if (seenChapterIds.has(id)) throw new Error(`${displayPath} has duplicate chapter id "${id}"`);
    if (seenChapterSlugs.has(chapterSlug)) {
      throw new Error(`${displayPath} has duplicate chapter slug "${chapterSlug}"`);
    }
    seenChapterIds.add(id);
    seenChapterSlugs.add(chapterSlug);
    return { id, slug: chapterSlug };
  });

  const publicChapterIds = new Set<string>();
  for (const [index, previewChapter] of raw.preview.chapters.entries()) {
    const previewPath = `${displayPath} preview.chapters[${index}]`;
    if (!isRecord(previewChapter)) throw new Error(`${previewPath} must be an object`);
    const id = requireNonEmptyString(previewChapter.id, `${previewPath}.id`);
    if (!seenChapterIds.has(id)) {
      throw new Error(`${displayPath} preview chapter "${id}" is not in book.chapters`);
    }
    if (publicChapterIds.has(id)) {
      throw new Error(`${displayPath} has duplicate preview chapter id "${id}"`);
    }
    publicChapterIds.add(id);
  }

  return {
    descriptor: { id: descriptorId, slug: descriptorSlug },
    book: { id: bookId, slug: bookSlug, chapters },
    publicChapterIds,
  };
}

function readChapterAssociations(
  root: string,
  releaseSlug: string,
  releasedChapterIds: ReadonlySet<string>,
): Map<string, LearningSkillId[]> {
  const displayPath = `books/${releaseSlug}/manifest.json`;
  const manifestPath = join(root, displayPath);
  if (!existsSync(manifestPath)) return new Map();

  const raw = parseJson(manifestPath, displayPath);
  if (!isRecord(raw)) throw new Error(`${displayPath} must be an object`);
  if (raw.learning === undefined) return new Map();
  if (!isRecord(raw.learning)) throw new Error(`${displayPath} learning must be an object`);
  if (Object.keys(raw.learning).some((key) => key !== 'chapters')) {
    throw new Error(`${displayPath} learning must contain only "chapters"`);
  }
  if (raw.learning.chapters === undefined) return new Map();
  if (!isRecord(raw.learning.chapters)) {
    throw new Error(`${displayPath} learning.chapters must be an object`);
  }

  const associations = new Map<string, LearningSkillId[]>();
  for (const [chapterId, rawSkillIds] of Object.entries(raw.learning.chapters)) {
    if (!releasedChapterIds.has(chapterId)) {
      throw new Error(`${displayPath} learning chapter "${chapterId}" is not in the current release`);
    }
    const result = validateLearningSkillIds(rawSkillIds);
    if (!result.ok) {
      throw new Error(`${displayPath} learning.chapters["${chapterId}"] ${result.reason}`);
    }
    associations.set(chapterId, result.value);
  }
  return associations;
}

export function buildLearningCatalog(root: string = repoRoot()): LibraryLearningCatalog {
  const slugs = releaseSlugs(root);
  if (slugs.length === 0) {
    throw new Error('no committed release snapshots found under content-dist/books/');
  }

  const seenBookIds = new Set<string>();
  const books = slugs.map((slug): LibraryLearningBook => {
    const release = readPublishedRelease(root, slug);
    if (seenBookIds.has(release.book.id)) {
      throw new Error(`released books have duplicate book id "${release.book.id}"`);
    }
    seenBookIds.add(release.book.id);

    const associations = readChapterAssociations(
      root,
      slug,
      new Set(release.book.chapters.map(({ id }) => id)),
    );
    return {
      bookId: release.book.id,
      bookSlug: release.book.slug,
      releaseId: release.descriptor.id,
      chapters: release.book.chapters.map(({ id, slug: chapterSlug }) => ({
        chapterId: id,
        chapterSlug,
        access: release.publicChapterIds.has(id) ? 'public' : 'entitled',
        skillIds: associations.get(id) ?? [],
      })),
    };
  });

  return { schemaVersion: 1, books };
}

export function serializeLearningCatalog(catalog: LibraryLearningCatalog): string {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

function validateCommittedArtifact(raw: unknown): string | null {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.books)) {
    return 'must be a schemaVersion 1 object with a books array';
  }
  for (const [bookIndex, book] of raw.books.entries()) {
    const bookPath = `books[${bookIndex}]`;
    if (!isRecord(book) || !Array.isArray(book.chapters)) return `${bookPath} must contain chapters`;
    for (const key of ['bookSlug'] as const) {
      if (typeof book[key] !== 'string' || book[key].length === 0) {
        return `${bookPath}.${key} must be a non-empty string`;
      }
    }
    for (const key of ['bookId', 'releaseId'] as const) {
      const problem = learningEvidenceReferenceProblem(book[key]);
      if (problem) return `${bookPath}.${key} ${problem}`;
    }
    for (const [chapterIndex, chapter] of book.chapters.entries()) {
      const chapterPath = `${bookPath}.chapters[${chapterIndex}]`;
      if (!isRecord(chapter)) return `${chapterPath} must be an object`;
      const chapterIdProblem = learningEvidenceReferenceProblem(chapter.chapterId);
      if (chapterIdProblem) return `${chapterPath}.chapterId ${chapterIdProblem}`;
      if (typeof chapter.chapterSlug !== 'string' || chapter.chapterSlug.length === 0) {
        return `${chapterPath}.chapterSlug must be a non-empty string`;
      }
      if (chapter.access !== 'public' && chapter.access !== 'entitled') {
        return `${chapterPath}.access must be "public" or "entitled"`;
      }
      const validation = validateLearningSkillIds(chapter.skillIds);
      if (!validation.ok) return `${chapterPath}.${validation.reason}`;
    }
  }
  return null;
}

export function verifyCommittedLearningCatalog(root: string = repoRoot()): string[] {
  const displayPath = 'content-dist/learning-catalog.json';
  const artifactPath = join(root, displayPath);
  if (!existsSync(artifactPath)) return [`${displayPath} is missing`];

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(artifactPath, 'utf8')) as unknown;
  } catch {
    return [`${displayPath} is not valid JSON`];
  }
  const malformed = validateCommittedArtifact(raw);
  if (malformed) return [`${displayPath} is malformed: ${malformed}`];

  const expected = serializeLearningCatalog(buildLearningCatalog(root));
  const actual = readFileSync(artifactPath, 'utf8');
  return actual === expected
    ? []
    : [`${displayPath} is stale; run pnpm workflow:update-learning-catalog`];
}

export function writeLearningCatalog(root: string = repoRoot()): string {
  const artifactPath = join(root, 'content-dist', 'learning-catalog.json');
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, serializeLearningCatalog(buildLearningCatalog(root)), 'utf8');
  return artifactPath;
}
