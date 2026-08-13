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

  it('accepts an image with an empty alt (decorative image)', () => {
    const book = clone(sampleBook);
    const image = blockAt(book, 2, 4);
    image.alt = '';
    const result = expectValid(book);
    expect(
      (result as unknown as { chapters: { blocks: { alt: string }[] }[] }).chapters[2]!.blocks[4]!
        .alt,
    ).toBe('');
  });

  it('accepts an image with a non-empty alt (informative image)', () => {
    expectValid(sampleBook); // the fixture's image block uses a non-empty alt
  });

  it('rejects an image missing its alt', () => {
    const book = clone(sampleBook);
    delete blockAt(book, 2, 4).alt;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.chapters[2].blocks[4].alt', 'missing_field');
  });

  it('rejects an image whose alt is not a string', () => {
    const book = clone(sampleBook);
    blockAt(book, 2, 4).alt = 42;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.chapters[2].blocks[4].alt', 'wrong_type');
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

  // --- finite numbers (non-finite values are data issues: both the JSON-safety
  // preflight and the schema pass report them, preserving invalid_number) ---
  it('rejects price.amount: Infinity as invalid_number (and not_json_safe)', () => {
    const book = clone(sampleBook);
    (bookAt(book).price as { amount: number }).amount = Infinity;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.price.amount', 'invalid_number');
    expectIssue(result.issues, '$.price.amount', 'not_json_safe');
  });

  it('rejects price.amount: NaN as invalid_number (and not_json_safe)', () => {
    const book = clone(sampleBook);
    (bookAt(book).price as { amount: number }).amount = NaN;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.price.amount', 'invalid_number');
    expectIssue(result.issues, '$.price.amount', 'not_json_safe');
  });

  it('rejects a heading level of NaN as invalid_number (and not_json_safe)', () => {
    const book = clone(sampleBook);
    blockAt(book, 0, 0).level = NaN;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.chapters[0].blocks[0].level', 'invalid_number');
    expectIssue(result.issues, '$.chapters[0].blocks[0].level', 'not_json_safe');
  });

  it('rejects a chapter order of NaN as invalid_number (and not_json_safe)', () => {
    const book = clone(sampleBook);
    (bookAt(book).chapters[0] as unknown as { order: number }).order = NaN;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.chapters[0].order', 'invalid_number');
    expectIssue(result.issues, '$.chapters[0].order', 'not_json_safe');
  });

  it('rejects a finite-but-out-of-range price.amount as invalid_number', () => {
    const book = clone(sampleBook);
    (bookAt(book).price as { amount: number }).amount = -1;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.price.amount', 'invalid_number');
  });

  // --- JSON-safety preflight runs before structural reads ---
  it('does not throw on a known-field throwing getter and reports not_json_safe', () => {
    const book = clone(sampleBook);
    Object.defineProperty(book, 'title', {
      enumerable: true,
      get() {
        throw new Error('title getter must never run');
      },
    });
    const result = validateBook(book); // must not throw
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expectIssue(result.issues, '$.title', 'not_json_safe');
    }
  });

  // --- array own properties are fully inspected ---
  it('rejects an array with an own toJSON property', () => {
    const book = clone(sampleBook);
    const arr: string[] = ['a'];
    (arr as unknown as Record<string, unknown>).toJSON = () => 'hacked';
    (book as unknown as Record<string, unknown>).futureMetadata = arr;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.futureMetadata.toJSON', 'not_json_safe');
  });

  it('rejects an array with a symbol-keyed property', () => {
    const book = clone(sampleBook);
    const arr: string[] = ['a'];
    (arr as unknown as Record<PropertyKey, unknown>)[Symbol('meta')] = 1;
    (book as unknown as Record<string, unknown>).futureMetadata = arr;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.futureMetadata[Symbol(meta)]', 'not_json_safe');
  });

  it('does not throw on an array accessor index and reports not_json_safe', () => {
    const book = clone(sampleBook);
    const arr: string[] = [];
    Object.defineProperty(arr, '0', {
      enumerable: true,
      get() {
        throw new Error('index getter must never run');
      },
    });
    arr.length = 1;
    (book as unknown as Record<string, unknown>).futureMetadata = arr;
    const result = validateBook(book); // must not throw
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expectIssue(result.issues, '$.futureMetadata[0]', 'not_json_safe');
    }
  });

  it('rejects an array with a custom prototype inheriting toJSON', () => {
    const book = clone(sampleBook);
    const proto = Object.create(Array.prototype) as { toJSON?: () => string };
    Object.defineProperty(proto, 'toJSON', { value: () => 'hacked', enumerable: false });
    const arr: unknown[] = [];
    Object.setPrototypeOf(arr, proto);
    (book as unknown as Record<string, unknown>).futureMetadata = arr;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.futureMetadata', 'not_json_safe');
  });

  it('does not throw on a Proxy whose reflective traps throw and reports not_json_safe', () => {
    const book = clone(sampleBook);
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error('proxy trap must not propagate');
        },
      },
    );
    (book as unknown as Record<string, unknown>).futureMetadata = hostile;
    const result = validateBook(book); // must not throw
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expectIssue(result.issues, '$', 'not_json_safe');
    }
  });

  it('does not throw on a revoked Proxy as the book root and reports not_json_safe', () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    const result = validateBook(proxy); // must not throw
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === 'not_json_safe')).toBe(true);
    }
  });

  it('does not throw on a revoked Proxy as the chapter root and reports not_json_safe', () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    const result = validateChapter(proxy); // must not throw
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === 'not_json_safe')).toBe(true);
    }
  });

  it('does not throw on a revoked Proxy as the content block root and reports not_json_safe', () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    const result = validateContentBlock(proxy); // must not throw
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === 'not_json_safe')).toBe(true);
    }
  });

  it('does not throw on a Proxy get trap during schema validation (validateBook)', () => {
    const hostile = new Proxy(clone(sampleBook), {
      get() {
        throw new Error('get trap must not propagate');
      },
    });
    const result = validateBook(hostile); // must not throw
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === 'not_json_safe')).toBe(true);
    }
  });

  it('does not throw on a Proxy get trap during schema validation (validateChapter)', () => {
    const hostile = new Proxy(clone(sampleBook.chapters[0]!), {
      get() {
        throw new Error('get trap must not propagate');
      },
    });
    const result = validateChapter(hostile); // must not throw
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === 'not_json_safe')).toBe(true);
    }
  });

  it('does not throw on a Proxy get trap during schema validation (validateContentBlock)', () => {
    const hostile = new Proxy(clone(sampleBook.chapters[0]!.blocks[0]!), {
      get() {
        throw new Error('get trap must not propagate');
      },
    });
    const result = validateContentBlock(hostile); // must not throw
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === 'not_json_safe')).toBe(true);
    }
  });

  it('does not throw on a nested Proxy get trap during schema validation', () => {
    const book = clone(sampleBook);
    const hostileChapter = new Proxy(book.chapters[0]!, {
      get() {
        throw new Error('nested get trap must not propagate');
      },
    });
    book.chapters[0] = hostileChapter as unknown as (typeof book)['chapters'][number];
    const result = validateBook(book); // must not throw
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === 'not_json_safe')).toBe(true);
    }
  });

  it('does not throw on a Proxy whose toJSON get throws during serialization (validateBook)', () => {
    const hostile = new Proxy(clone(sampleBook), {
      get(target, prop) {
        if (prop === 'toJSON') throw new Error('toJSON get must not propagate');
        return Reflect.get(target, prop, target);
      },
    });
    const result = validateBook(hostile); // must not throw
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === 'not_json_safe')).toBe(true);
    }
  });

  it('does not throw on a nested Proxy whose toJSON get throws during serialization', () => {
    const book = clone(sampleBook);
    const hostileChapter = new Proxy(book.chapters[0]!, {
      get(target, prop) {
        if (prop === 'toJSON') throw new Error('nested toJSON get must not propagate');
        return Reflect.get(target, prop, target);
      },
    });
    book.chapters[0] = hostileChapter as unknown as (typeof book)['chapters'][number];
    const result = validateBook(book); // must not throw
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === 'not_json_safe')).toBe(true);
    }
  });

  it('rejects an object with a custom own toJSON method', () => {
    const book = clone(sampleBook);
    (book as unknown as Record<string, unknown>).futureMetadata = {
      value: 'ok',
      toJSON() {
        return 'hacked';
      },
    };
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.futureMetadata.toJSON', 'not_json_safe');
  });

  it('rejects an object with a custom inherited toJSON method', () => {
    const book = clone(sampleBook);
    const proto = {
      toJSON() {
        return 'hacked';
      },
    };
    const obj = Object.create(proto) as Record<string, unknown>;
    obj.value = 'ok';
    (book as unknown as Record<string, unknown>).futureMetadata = obj;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.futureMetadata', 'not_json_safe');
  });

  it('rejects a Proxy whose toJSON get rewrites serialization (validateBook)', () => {
    const hostile = new Proxy(clone(sampleBook), {
      get(target, prop) {
        if (prop === 'toJSON') return () => ({ hacked: true });
        return Reflect.get(target, prop, target);
      },
    });
    const result = validateBook(hostile); // must not throw
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === 'not_json_safe')).toBe(true);
    }
  });

  it('rejects an otherwise transparent Proxy as unstable non-plain data', () => {
    const result = validateBook(new Proxy(clone(sampleBook), {}));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expectIssue(result.issues, '$', 'not_json_safe');
    }
  });

  it('rejects an otherwise transparent nested Proxy', () => {
    const book = clone(sampleBook);
    book.chapters[0] = new Proxy(book.chapters[0]!, {});
    const result = validateBook(book);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expectIssue(result.issues, '$', 'not_json_safe');
    }
  });

  it('rejects a Proxy whose toJSON get rewrites serialization (validateChapter)', () => {
    const hostile = new Proxy(clone(sampleBook.chapters[0]!), {
      get(target, prop) {
        if (prop === 'toJSON') return () => ({ hacked: true });
        return Reflect.get(target, prop, target);
      },
    });
    const result = validateChapter(hostile); // must not throw
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === 'not_json_safe')).toBe(true);
    }
  });

  it('rejects a Proxy whose toJSON get rewrites serialization (validateContentBlock)', () => {
    const hostile = new Proxy(clone(sampleBook.chapters[0]!.blocks[0]!), {
      get(target, prop) {
        if (prop === 'toJSON') return () => ({ hacked: true });
        return Reflect.get(target, prop, target);
      },
    });
    const result = validateContentBlock(hostile); // must not throw
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === 'not_json_safe')).toBe(true);
    }
  });

  it('rejects a nested Proxy whose toJSON get rewrites serialization', () => {
    const book = clone(sampleBook);
    const hostileChapter = new Proxy(book.chapters[0]!, {
      get(target, prop) {
        if (prop === 'toJSON') return () => ({ hacked: true });
        return Reflect.get(target, prop, target);
      },
    });
    book.chapters[0] = hostileChapter as unknown as (typeof book)['chapters'][number];
    const result = validateBook(book); // must not throw
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === 'not_json_safe')).toBe(true);
    }
  });

  it('accepts a normal dense array', () => {
    const book = clone(sampleBook);
    (book as unknown as Record<string, unknown>).futureMetadata = [{ a: 1 }, 'b', [true]];
    const result = expectValid(book);
    expect((result as unknown as Record<string, unknown>).futureMetadata).toEqual([{ a: 1 }, 'b', [true]]);
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

  it('accepts common BCP-47 language tags', () => {
    for (const tag of ['ja', 'zh-TW', 'en-US']) {
      const book = clone(sampleBook);
      (book as unknown as { language: string }).language = tag;
      expectValid(book);
    }
  });

  it('accepts a valid private-use BCP-47 tag', () => {
    const book = clone(sampleBook);
    (book as unknown as { language: string }).language = 'x-business';
    const result = expectValid(book);
    expect((result as unknown as { language: string }).language).toBe('x-business');
  });

  it('accepts registered grandfathered BCP-47 tags', () => {
    for (const tag of ['i-klingon', 'en-GB-oed', 'art-lojban', 'zh-min-nan']) {
      const book = clone(sampleBook);
      (book as unknown as { language: string }).language = tag;
      expectValid(book);
    }
  });

  it('rejects malformed suffixes on grandfathered tags', () => {
    for (const tag of ['art-lojban-a', 'zh-min-nan-a', 'zh-min-!', 'zh-min--x']) {
      const book = clone(sampleBook);
      (book as unknown as { language: string }).language = tag;
      const result = expectInvalid(book);
      expectIssue(result.issues, '$.language', 'invalid_format');
    }
  });

  it('rejects a malformed BCP-47 tag (extension singleton without subtag)', () => {
    const book = clone(sampleBook);
    (book as unknown as { language: string }).language = 'en-a';
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.language', 'invalid_format');
  });

  it('does not throw for a malformed language tag', () => {
    const book = clone(sampleBook);
    (book as unknown as { language: string }).language = 'en-a';
    const result = validateBook(book); // must not throw
    expect(result.ok).toBe(false);
  });

  it('rejects a releasedAt that is not a date-only ISO 8601 value', () => {
    const book = clone(sampleBook);
    (bookAt(book).publication as { releasedAt: string }).releasedAt = '2026-02-30';
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.publication.releasedAt', 'invalid_format');
  });

  it('accepts real date-only values in years 0000 through 0099', () => {
    for (const releasedAt of ['0000-02-29', '0099-12-31']) {
      const book = clone(sampleBook);
      (bookAt(book).publication as { releasedAt: string }).releasedAt = releasedAt;
      expectValid(book);
    }
  });

  it('rejects impossible early-year date-only values', () => {
    const book = clone(sampleBook);
    (bookAt(book).publication as { releasedAt: string }).releasedAt = '0001-02-29';
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.publication.releasedAt', 'invalid_format');
  });

  it('rejects a currency that is not an uppercase ISO 4217 code', () => {
    const book = clone(sampleBook);
    (bookAt(book).price as { currency: string }).currency = 'jpy';
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.price.currency', 'invalid_format');
  });

  it('rejects an unassigned uppercase currency identifier', () => {
    const book = clone(sampleBook);
    (bookAt(book).price as { currency: string }).currency = 'AAA';
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.price.currency', 'invalid_format');
  });

  it('accepts current ISO 4217 currency and fund identifiers', () => {
    for (const currency of ['JPY', 'USD', 'XAD', 'XTS']) {
      const book = clone(sampleBook);
      (bookAt(book).price as { currency: string }).currency = currency;
      expectValid(book);
    }
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

  it('rejects a sparse array (new Array(1))', () => {
    const book = clone(sampleBook);
    (book as unknown as Record<string, unknown>).futureMetadata = new Array(1);
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.futureMetadata[0]', 'not_json_safe');
  });

  it('rejects a sparse nested array', () => {
    const book = clone(sampleBook);
    const nested = new Array(1);
    (book as unknown as Record<string, unknown>).futureMetadata = { rows: nested };
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.futureMetadata.rows[0]', 'not_json_safe');
  });

  it('accepts a dense array in an unknown property', () => {
    const book = clone(sampleBook);
    (book as unknown as Record<string, unknown>).futureMetadata = [1, 'two', true, null];
    const result = expectValid(book);
    expect((result as unknown as Record<string, unknown>).futureMetadata).toEqual([1, 'two', true, null]);
  });

  it('does not throw on a throwing getter and reports it as not_json_safe', () => {
    const book = clone(sampleBook);
    const objectWithGetter: Record<string, unknown> = {};
    Object.defineProperty(objectWithGetter, 'danger', {
      enumerable: true,
      get() {
        throw new Error('getter must never run during validation');
      },
    });
    (book as unknown as Record<string, unknown>).futureMetadata = objectWithGetter;
    const result = validateBook(book); // must not throw
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expectIssue(result.issues, '$.futureMetadata.danger', 'not_json_safe');
    }
  });

  it('rejects a hidden non-enumerable toJSON method', () => {
    const book = clone(sampleBook);
    const objectWithToJSON: Record<string, unknown> = {};
    Object.defineProperty(objectWithToJSON, 'toJSON', {
      value: () => ({ hacked: true }),
      enumerable: false,
    });
    (book as unknown as Record<string, unknown>).futureMetadata = objectWithToJSON;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.futureMetadata.toJSON', 'not_json_safe');
  });

  it('rejects a symbol-keyed own property', () => {
    const book = clone(sampleBook);
    const symbolObject: Record<string, unknown> = {};
    (symbolObject as Record<PropertyKey, unknown>)[Symbol('meta')] = 1;
    (book as unknown as Record<string, unknown>).futureMetadata = symbolObject;
    const result = expectInvalid(book);
    expectIssue(result.issues, '$.futureMetadata[Symbol(meta)]', 'not_json_safe');
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

  it('rejects a non-object root as invalid_root (validateContentBlock)', () => {
    for (const bad of [null, undefined, 42, 'hello', true, []]) {
      const result = validateContentBlock(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expectIssue(result.issues, '$', 'invalid_root');
      }
    }
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
