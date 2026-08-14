import { describe, expect, it } from 'vitest';
import { sampleBook } from '../content/fixtures/sample-book';
import { derivePreview } from './preview';

/**
 * Chapter layout of the sample fixture:
 *   ch-1 (7 blocks: ch1-blk-01..07), ch-2 (6 blocks: ch2-blk-01..06),
 *   ch-3 (5 blocks: ch3-blk-01..05).
 */
const book = sampleBook;

describe('derivePreview (chapter boundary)', () => {
  it('previews chapters 1..boundary chapter and marks the next chapter as paid', () => {
    const result = derivePreview(book, { kind: 'chapter', chapterId: 'ch-2' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.chapters.map((chapter) => chapter.id)).toEqual(['ch-1', 'ch-2']);
    expect(result.value.chapters[0]!.blocks).toHaveLength(7);
    expect(result.value.chapters[1]!.blocks).toHaveLength(6);
    expect(result.value.paidStart).toEqual({ chapterId: 'ch-3', blockId: 'ch3-blk-01' });
    expect(result.value.isPartial).toBe(true);
  });

  it('a boundary at the last chapter makes the whole book preview (nothing paid)', () => {
    const result = derivePreview(book, { kind: 'chapter', chapterId: 'ch-3' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.chapters.map((chapter) => chapter.id)).toEqual(['ch-1', 'ch-2', 'ch-3']);
    expect(result.value.paidStart).toBeNull();
    expect(result.value.isPartial).toBe(false);
  });

  it('rejects a boundary naming an unknown chapter', () => {
    const result = derivePreview(book, { kind: 'chapter', chapterId: 'ch-99' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.path).toBe('$.preview.boundary.chapterId');
    expect(result.issues[0]!.message).toContain('unknown chapter id');
  });
});

describe('derivePreview (block boundary)', () => {
  it('truncates the boundary chapter to the boundary block and marks the next block as paid', () => {
    const result = derivePreview(book, { kind: 'block', chapterId: 'ch-2', blockId: 'ch2-blk-04' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.chapters.map((chapter) => chapter.id)).toEqual(['ch-1', 'ch-2']);
    expect(result.value.chapters[1]!.blocks.map((block) => block.id)).toEqual([
      'ch2-blk-01',
      'ch2-blk-02',
      'ch2-blk-03',
      'ch2-blk-04',
    ]);
    expect(result.value.paidStart).toEqual({ chapterId: 'ch-2', blockId: 'ch2-blk-05' });
    expect(result.value.isPartial).toBe(true);
  });

  it('a block boundary at the very last block of the book makes the whole book preview', () => {
    const result = derivePreview(book, { kind: 'block', chapterId: 'ch-3', blockId: 'ch3-blk-05' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.chapters).toHaveLength(3);
    expect(result.value.paidStart).toBeNull();
    expect(result.value.isPartial).toBe(false);
  });

  it('rejects a block boundary naming a block in the wrong chapter', () => {
    const result = derivePreview(book, { kind: 'block', chapterId: 'ch-1', blockId: 'ch2-blk-01' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]!.path).toBe('$.preview.boundary.blockId');
    expect(result.issues[0]!.message).toContain('unknown block id');
  });
});

describe('derivePreview (purity and determinism)', () => {
  it('never mutates the input book', () => {
    const chaptersBefore = book.chapters.map((chapter) => chapter.blocks.length);
    derivePreview(book, { kind: 'block', chapterId: 'ch-2', blockId: 'ch2-blk-04' });
    expect(book.chapters.map((chapter) => chapter.blocks.length)).toEqual(chaptersBefore);
    expect(book.chapters.map((chapter) => chapter.id)).toEqual(['ch-1', 'ch-2', 'ch-3']);
  });

  it('is deterministic: identical inputs yield identical payloads', () => {
    const boundary = { kind: 'block', chapterId: 'ch-2', blockId: 'ch2-blk-03' } as const;
    const first = derivePreview(book, boundary);
    const second = derivePreview(book, boundary);
    expect(first).toEqual(second);
  });
});
