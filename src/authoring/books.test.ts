import { describe, expect, it } from 'vitest';
import keigoBookJsonRaw from '../../books/keigo-essentials/book.json?raw';
import keigoManifestJsonRaw from '../../books/keigo-essentials/manifest.json?raw';
import emailBookJsonRaw from '../../books/email-manners/book.json?raw';
import emailManifestJsonRaw from '../../books/email-manners/manifest.json?raw';
import { sampleBook } from '../content/fixtures/sample-book';
import { secondBook } from '../content/fixtures/second-book';
import { paidKeigoBook } from '../content/fixtures/paid-test-books';
import { BLOCK_TYPES } from '../content/types';
import { validateBook } from '../content/validate';
import { derivePreview } from './preview';

/**
 * Guards the committed authoring artifacts (books/<slug>/): every authoring
 * book must validate, exercise every block type, and stay structurally in sync
 * with its content-model fixture. The Prototype books are `tier: 'free'` and
 * therefore declare no preview boundary; preview-boundary resolution is guarded
 * against the paid synthetic fixture instead.
 */

interface AuthoringManifest {
  book?: string;
  preview?: { boundary?: { kind?: string; chapterId?: string } };
}

function parseBook(raw: string): unknown {
  return JSON.parse(raw) as unknown;
}

function parseManifest(raw: string): AuthoringManifest {
  return JSON.parse(raw) as AuthoringManifest;
}

function assertValid(raw: string): void {
  const result = validateBook(parseBook(raw));
  if (!result.ok) {
    throw new Error(
      'authoring book failed validation:\n' +
        result.issues.map((issue) => `${issue.path} [${issue.code}] ${issue.message}`).join('\n'),
    );
  }
  expect(result.ok).toBe(true);
}

describe('authoring sample book (books/keigo-essentials)', () => {
  it('passes full content validation', () => {
    assertValid(keigoBookJsonRaw);
  });

  it('exercises every supported block type', () => {
    const result = validateBook(parseBook(keigoBookJsonRaw));
    if (!result.ok) return;
    const used = new Set(
      result.value.chapters.flatMap((chapter) => chapter.blocks.map((block) => block.type)),
    );
    for (const type of BLOCK_TYPES) {
      expect(used.has(type), `the authoring book is missing a block of type "${type}"`).toBe(true);
    }
    expect(used.size).toBe(BLOCK_TYPES.length);
  });

  it('stays structurally in sync with the content-model fixture (ids, slugs, order)', () => {
    const result = validateBook(parseBook(keigoBookJsonRaw));
    if (!result.ok) return;
    const skeleton = (book: typeof sampleBook) =>
      book.chapters.map((chapter) => ({
        id: chapter.id,
        slug: chapter.slug,
        order: chapter.order,
        blocks: chapter.blocks.map((block) => block.id),
      }));
    expect(skeleton(result.value)).toEqual(skeleton(sampleBook));
  });
});

describe('authoring sample book (books/email-manners)', () => {
  it('passes full content validation', () => {
    assertValid(emailBookJsonRaw);
  });

  it('stays structurally in sync with the content-model fixture (ids, slugs, order)', () => {
    const result = validateBook(parseBook(emailBookJsonRaw));
    if (!result.ok) return;
    const skeleton = (book: typeof secondBook) =>
      book.chapters.map((chapter) => ({
        id: chapter.id,
        slug: chapter.slug,
        order: chapter.order,
        blocks: chapter.blocks.map((block) => block.id),
      }));
    expect(skeleton(result.value)).toEqual(skeleton(secondBook));
  });
});

describe('preview boundaries', () => {
  it('free Prototype books declare no preview boundary in manifest.json', () => {
    expect(parseManifest(keigoManifestJsonRaw).preview?.boundary).toBeUndefined();
    expect(parseManifest(emailManifestJsonRaw).preview?.boundary).toBeUndefined();
  });

  it('a paid book preview boundary still resolves to a real paid split (paid fixture)', () => {
    const result = validateBook(paidKeigoBook);
    if (!result.ok) return;
    const preview = derivePreview(result.value, { kind: 'chapter', chapterId: 'ch-1' });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.value.paidStart).toEqual({ chapterId: 'ch-2', blockId: 'ch2-blk-01' });
    expect(preview.value.isPartial).toBe(true);
  });
});
