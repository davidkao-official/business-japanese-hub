import { describe, expect, it } from 'vitest';
import { sampleBook } from './fixtures/sample-book';
import { isBook, validateBook, validateChapter, validateContentBlock } from './validate';
import type { ContentIssue } from './validate';
import type { Book, ContentBlock } from './types';

/** Deep-clone a JSON-safe value so tests can mutate it without touching the fixture. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function bookAt(book: unknown): Book {
  return book as Book;
}

/** Returns a chapter's block as a mutable record so tests can corrupt it. */
function blockAt(book: unknown, chapterIndex: number, blockIndex: number): Record<string, unknown> {
  return bookAt(book).chapters[chapterIndex]!.blocks[blockIndex] as unknown as Record<string, unknown>;
}

/** Asserts a book is valid and returns the validated value. */
function expectValid(input: unknown): Book {
  const result = validateBook(input);
  if (!result.ok) {
    const details = result.issues.map((i) => `${i.path} [${i.code}] ${i.message}`).join('\n');
    throw new Error(`expected validation to pass but got issues:\n${details}`);
  }
  return result.value;
}

/** Asserts a book is invalid and returns the resulting issues. */
function expectInvalid(input: unknown): { ok: false; issues: ContentIssue[] } {
  const result = validateBook(input);
  if (result.ok) {
    throw new Error('expected validation to fail but it passed');
  }
  return result;
}

/** Asserts that `issues` contains an issue with the given path and code. */
function expectIssue(issues: ContentIssue[], path: string, code: string): void {
  const match = issues.find((i) => i.path === path && i.code === code);
  expect(match, `expected an issue at "${path}" with code "${code}", got: ${JSON.stringify(issues)}`).toBeDefined();
}

describe('validateBook', () => {
  it('accepts the sample fixture with no issues', () => {
    const validated = expectValid(sampleBook);
    expect(validated).toEqual(sampleBook);
  });

  it('exposes isBook as a type guard for the fixture', () => {
    expect(isBook(sampleBook)).toBe(true);
  });

  it('rejects non-object roots', () => {
    for (const bad of [null, undefined, 42, 'hello', true, []]) {
      const result = expectInvalid(bad);
      expectIssue(result.issues, '$', 'invalid_root');
    }
  });

  it('rejects a missing schemaVersion', () => {
    const book = clone(sampleBook);
    delete (book as unknown as Record<string, unknown>).schemaVersion;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.schemaVersion', 'missing_field');
  });

  it('rejects an unsupported schema version', () => {
    const book = clone(sampleBook);
    (book as unknown as { schemaVersion: number }).schemaVersion = 2;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.schemaVersion', 'schema_version_mismatch');
  });

  it('rejects a wrong-typed schemaVersion', () => {
    const book = clone(sampleBook);
    (book as unknown as { schemaVersion: unknown }).schemaVersion = '1';
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.schemaVersion', 'wrong_type');
  });

  it('rejects a missing book id', () => {
    const book = clone(sampleBook);
    delete (book as unknown as Record<string, unknown>).id;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.id', 'missing_field');
  });

  it('rejects an empty book id', () => {
    const book = clone(sampleBook);
    (book as unknown as { id: string }).id = '';
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.id', 'empty_string');
  });

  it('rejects duplicate ids across the whole book', () => {
    const book = clone(sampleBook);
    blockAt(book, 0, 0).id = sampleBook.id;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.chapters[0].blocks[0].id', 'duplicate_id');
  });

  it('rejects a block missing its type discriminator', () => {
    const book = clone(sampleBook);
    delete blockAt(book, 0, 1).type;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.chapters[0].blocks[1].type', 'missing_discriminator');
  });

  it('rejects an unknown block type', () => {
    const book = clone(sampleBook);
    blockAt(book, 0, 1).type = 'sparkle';
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.chapters[0].blocks[1].type', 'unknown_block_type');
  });

  it('rejects a paragraph missing its required text', () => {
    const book = clone(sampleBook);
    delete blockAt(book, 0, 1).text;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.chapters[0].blocks[1].text', 'missing_field');
  });

  it('rejects a paragraph whose text is the wrong type', () => {
    const book = clone(sampleBook);
    blockAt(book, 0, 1).text = 42;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.chapters[0].blocks[1].text', 'wrong_type');
  });

  it('rejects a callout with an invalid kind', () => {
    const book = clone(sampleBook);
    blockAt(book, 0, 2).kind = 'info2';
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.chapters[0].blocks[2].kind', 'invalid_enum');
  });

  it('rejects a heading with an out-of-range level', () => {
    const book = clone(sampleBook);
    blockAt(book, 0, 0).level = 5;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.chapters[0].blocks[0].level', 'invalid_enum');
  });

  it('rejects a table row whose width does not match the columns', () => {
    const book = clone(sampleBook);
    const table = blockAt(book, 1, 4);
    const rows = table.rows as unknown[][];
    (rows[0] as unknown[]).push('extra');
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.chapters[1].blocks[4].rows[0]', 'row_width_mismatch');
  });

  it('rejects a dialogue missing its lines', () => {
    const book = clone(sampleBook);
    delete blockAt(book, 1, 2).lines;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.chapters[1].blocks[2].lines', 'missing_field');
  });

  it('rejects a dialogue line missing its speaker', () => {
    const book = clone(sampleBook);
    const dialogue = blockAt(book, 1, 2);
    const lines = dialogue.lines as unknown[];
    delete (lines[0] as Record<string, unknown>).speaker;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.chapters[1].blocks[2].lines[0].speaker', 'missing_field');
  });

  it('rejects an exercise missing its question', () => {
    const book = clone(sampleBook);
    delete blockAt(book, 2, 1).question;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.chapters[2].blocks[1].question', 'missing_field');
  });

  it('rejects a chapter with an empty blocks array', () => {
    const book = clone(sampleBook);
    (bookAt(book).chapters[1] as unknown as { blocks: unknown[] }).blocks = [];
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.chapters[1].blocks', 'missing_items');
  });

  it('rejects a book with no chapters', () => {
    const book = clone(sampleBook);
    (book as unknown as { chapters: unknown[] }).chapters = [];
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.chapters', 'missing_items');
  });

  it('rejects duplicate chapter slugs', () => {
    const book = clone(sampleBook);
    (bookAt(book).chapters[1] as unknown as { slug: string }).slug = bookAt(book).chapters[0]!.slug;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.chapters[1].slug', 'duplicate_slug');
  });

  it('rejects a table of contents entry referencing an unknown chapter', () => {
    const book = clone(sampleBook);
    bookAt(book).tableOfContents!.entries[0]!.chapterId = 'does-not-exist';
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.tableOfContents.entries[0].chapterId', 'reference_not_found');
  });

  it('rejects navigation referencing an unknown chapter', () => {
    const book = clone(sampleBook);
    (bookAt(book).chapters[0] as unknown as { navigation: { next: string } }).navigation = { next: 'missing-chapter' };
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.chapters[0].navigation.next', 'reference_not_found');
  });

  it('rejects an empty authors array', () => {
    const book = clone(sampleBook);
    (book as unknown as { authors: unknown[] }).authors = [];
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.authors', 'missing_items');
  });

  it('rejects an invalid difficulty level', () => {
    const book = clone(sampleBook);
    (bookAt(book).difficulty as { level: number }).level = 9;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.difficulty.level', 'invalid_enum');
  });

  it('reports precise paths for deeply nested problems', () => {
    const book = clone(sampleBook);
    const dialogue = blockAt(book, 1, 2);
    const lines = dialogue.lines as unknown[];
    (lines[1] as Record<string, unknown>).text = true;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.chapters[1].blocks[2].lines[1].text', 'wrong_type');
  });

  it('is deterministic: the same input always yields the same issue list', () => {
    const book = clone(sampleBook);
    blockAt(book, 0, 1).text = 42;
    blockAt(book, 0, 0).level = 9;
    const first = validateBook(book);
    const second = validateBook(book);
    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
    if (!first.ok && !second.ok) {
      expect(second.issues).toEqual(first.issues);
    }
  });

  it('attaches a readable message that mentions the offending field', () => {
    const book = clone(sampleBook);
    delete blockAt(book, 0, 1).text;
    const result = expectInvalid(book);
    const issue = result.issues.find((i) => i.path === '$.chapters[0].blocks[1].text');
    expect(issue).toBeDefined();
    expect(issue?.message).toContain('text');
  });

  // --- finite numbers ---
  it('rejects price.amount: Infinity', () => {
    const book = clone(sampleBook);
    (bookAt(book).price as { amount: number }).amount = Infinity;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.price.amount', 'invalid_number');
  });

  it('rejects price.amount: NaN', () => {
    const book = clone(sampleBook);
    (bookAt(book).price as { amount: number }).amount = NaN;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.price.amount', 'invalid_number');
  });

  it('rejects a heading level of NaN', () => {
    const book = clone(sampleBook);
    blockAt(book, 0, 0).level = NaN;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.chapters[0].blocks[0].level', 'invalid_number');
  });

  it('rejects a chapter order of NaN', () => {
    const book = clone(sampleBook);
    (bookAt(book).chapters[0] as unknown as { order: number }).order = NaN;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.chapters[0].order', 'invalid_number');
  });

  // --- required string arrays ---
  it('rejects an empty do array on doDont', () => {
    const book = clone(sampleBook);
    blockAt(book, 1, 3).do = [];
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.chapters[1].blocks[3].do', 'missing_items');
  });

  it('rejects an empty dont array on doDont', () => {
    const book = clone(sampleBook);
    blockAt(book, 1, 3).dont = [];
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.chapters[1].blocks[3].dont', 'missing_items');
  });

  it('rejects an empty points array on a comparison row', () => {
    const book = clone(sampleBook);
    const comparison = blockAt(book, 0, 4);
    const rows = comparison.rows as { points: string[] }[];
    rows[0]!.points = [];
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.chapters[0].blocks[4].rows[0].points', 'missing_items');
  });

  // --- documented formats ---
  it('rejects a book slug that is not a single URL-safe segment', () => {
    const book = clone(sampleBook);
    (book as unknown as { slug: string }).slug = 'sales/intro';
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.slug', 'invalid_format');
  });

  it('rejects a chapter slug that is not URL-safe', () => {
    const book = clone(sampleBook);
    (bookAt(book).chapters[1] as unknown as { slug: string }).slug = 'keigo basics';
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.chapters[1].slug', 'invalid_format');
  });

  it('rejects a non-BCP-47 book language', () => {
    const book = clone(sampleBook);
    (book as unknown as { language: string }).language = 'ja_JP';
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.language', 'invalid_format');
  });

  it('rejects a releasedAt that is not a date-only ISO 8601 value', () => {
    const book = clone(sampleBook);
    (bookAt(book).publication as { releasedAt: string }).releasedAt = '2026-02-30';
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.publication.releasedAt', 'invalid_format');
  });

  it('rejects a currency that is not an uppercase ISO 4217 code', () => {
    const book = clone(sampleBook);
    (bookAt(book).price as { currency: string }).currency = 'jpy';
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.price.currency', 'invalid_format');
  });

  // --- whole-tree JSON safety ---
  it('rejects a forward-compatible unknown property containing a BigInt', () => {
    const book = clone(sampleBook);
    (book as unknown as Record<string, unknown>).futureMetadata = { expiresAt: 1n };
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.futureMetadata.expiresAt', 'not_json_safe');
  });

  it('rejects a forward-compatible unknown property containing a function', () => {
    const book = clone(sampleBook);
    (book as unknown as Record<string, unknown>).futureMetadata = { compute: () => 1 };
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.futureMetadata.compute', 'not_json_safe');
  });

  it('rejects a forward-compatible unknown property containing undefined', () => {
    const book = clone(sampleBook);
    (book as unknown as Record<string, unknown>).futureMetadata = { note: undefined };
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.futureMetadata.note', 'not_json_safe');
  });

  it('rejects a cyclic object', () => {
    const book = clone(sampleBook);
    const extra: Record<string, unknown> = {};
    extra.self = extra;
    (book as unknown as Record<string, unknown>).futureMetadata = extra;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.futureMetadata.self', 'not_json_safe');
  });

  it('accepts a valid unknown JSON-safe property (forward compatibility)', () => {
    const book = clone(sampleBook);
    (book as unknown as Record<string, unknown>).futureMetadata = {
      note: 'ok',
      score: 5,
      tags: ['a', 'b'],
      nested: { enabled: true, count: 0, nullable: null },
    };
    const result = expectValid(book);
    // The unknown property is preserved, not stripped.
    expect((result as unknown as Record<string, unknown>).futureMetadata).toEqual({
      note: 'ok',
      score: 5,
      tags: ['a', 'b'],
      nested: { enabled: true, count: 0, nullable: null },
    });
  });
});

describe('validateChapter / validateContentBlock', () => {
  it('validates a chapter in isolation', () => {
    const result = validateChapter(sampleBook.chapters[0]!);
    expect(result.ok).toBe(true);
  });

  it('rejects a chapter whose blocks contain an unknown block type', () => {
    const chapter = clone(sampleBook.chapters[0]!);
    const blocks = (chapter as unknown as { blocks: unknown[] }).blocks;
    (blocks[0] as Record<string, unknown>).type = 'bogus';
    const result = validateChapter(chapter);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expectIssue(result.issues, '$.blocks[0].type', 'unknown_block_type');
    }
  });

  it('validates a content block in isolation', () => {
    const paragraph: ContentBlock = sampleBook.chapters[0]!.blocks[1]!;
    const result = validateContentBlock(paragraph);
    expect(result.ok).toBe(true);
  });

  it('rejects a content block with a missing discriminator', () => {
    const block = clone(sampleBook.chapters[0]!.blocks[0]!);
    delete (block as unknown as Record<string, unknown>).type;
    const result = validateContentBlock(block);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expectIssue(result.issues, '$.type', 'missing_discriminator');
    }
  });
});
