import { describe, expect, it } from 'vitest';
import bookJsonRaw from '../../books/keigo-essentials/book.json?raw';
import manifestJsonRaw from '../../books/keigo-essentials/manifest.json?raw';
import { sampleBook } from '../content/fixtures/sample-book';
import { BLOCK_TYPES } from '../content/types';
import { validateBook } from '../content/validate';
import { derivePreview } from './preview';

/**
 * Guards the committed authoring artifacts (books/keigo-essentials/): the
 * sample authoring book must always validate, exercise every block type, and
 * stay structurally in sync with the content-model fixture.
 */

interface AuthoringManifest {
  book?: string;
  preview?: { boundary?: { kind?: string; chapterId?: string } };
}

function parseAuthoringBook(): unknown {
  return JSON.parse(bookJsonRaw) as unknown;
}

function parseManifest(): AuthoringManifest {
  return JSON.parse(manifestJsonRaw) as AuthoringManifest;
}

describe('authoring sample book (books/keigo-essentials)', () => {
  it('passes full content validation', () => {
    const result = validateBook(parseAuthoringBook());
    if (!result.ok) {
      throw new Error(
        'authoring book failed validation:\n' +
          result.issues.map((issue) => `${issue.path} [${issue.code}] ${issue.message}`).join('\n'),
      );
    }
    expect(result.ok).toBe(true);
  });

  it('exercises every supported block type', () => {
    const result = validateBook(parseAuthoringBook());
    if (!result.ok) return;
    const used = new Set(result.value.chapters.flatMap((chapter) => chapter.blocks.map((block) => block.type)));
    for (const type of BLOCK_TYPES) {
      expect(used.has(type), `the authoring book is missing a block of type "${type}"`).toBe(true);
    }
    expect(used.size).toBe(BLOCK_TYPES.length);
  });

  it('stays structurally in sync with the content-model fixture (ids, slugs, order)', () => {
    const result = validateBook(parseAuthoringBook());
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

  it('declares a preview boundary in manifest.json that resolves to a real split', () => {
    const result = validateBook(parseAuthoringBook());
    const manifest = parseManifest();
    if (!result.ok) return;

    const boundary = manifest.preview?.boundary;
    expect(boundary).toBeDefined();
    if (boundary?.kind !== 'chapter' || boundary.chapterId === undefined) {
      throw new Error('expected a chapter preview boundary in manifest.json');
    }

    const preview = derivePreview(result.value, { kind: 'chapter', chapterId: boundary.chapterId });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    // The sample book's manifest previews chapter 1 for free; chapter 2 onward is paid.
    expect(preview.value.paidStart).toEqual({ chapterId: 'ch-2', blockId: 'ch2-blk-01' });
    expect(preview.value.isPartial).toBe(true);
  });
});
