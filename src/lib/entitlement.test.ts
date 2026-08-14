import { describe, expect, it } from 'vitest';
import { canRead } from './entitlement';
import type { CanReadInput } from './entitlement';

const chapters = [
  { id: 'ch-1', blocks: [{ id: 'ch1-blk-01' }, { id: 'ch1-blk-02' }, { id: 'ch1-blk-03' }] },
  { id: 'ch-2', blocks: [{ id: 'ch2-blk-01' }, { id: 'ch2-blk-02' }, { id: 'ch2-blk-03' }] },
  { id: 'ch-3', blocks: [{ id: 'ch3-blk-01' }, { id: 'ch3-blk-02' }] },
];

function input(overrides: Partial<CanReadInput>): CanReadInput {
  return {
    tier: 'paid',
    owned: false,
    position: { chapterId: 'ch-1', blockId: 'ch1-blk-01' },
    chapters,
    ...overrides,
  };
}

describe('canRead — free / preview tiers need no ownership', () => {
  it('free tier is readable by everyone, at any position', () => {
    expect(canRead(input({ tier: 'free', owned: false, position: { chapterId: 'ch-3' } }))).toBe(true);
  });

  it('free tier is readable even with an absurd (unowned, boundary-less) request', () => {
    expect(canRead(input({ tier: 'free', owned: false, chapters: [] }))).toBe(true);
  });

  it('preview tier is fully readable without ownership', () => {
    expect(canRead(input({ tier: 'preview', owned: false, position: { chapterId: 'ch-3' } }))).toBe(true);
  });
});

describe('canRead — ownership unlocks paid books anywhere', () => {
  it('owned paid content is readable beyond the preview boundary', () => {
    const base = input({ owned: true, position: { chapterId: 'ch-3', blockId: 'ch3-blk-02' } });
    // even with no boundary at all, ownership wins
    expect(canRead({ ...base, previewBoundary: undefined })).toBe(true);
  });

  it('owned paid content is readable even when the position ref is unknown to the book', () => {
    expect(
      canRead(input({ owned: true, position: { chapterId: 'does-not-exist' } })),
    ).toBe(true);
  });
});

describe('canRead — unowned paid content cannot be unlocked by editing client state', () => {
  it('denies without a preview boundary', () => {
    expect(canRead(input({ owned: false, previewBoundary: undefined }))).toBe(false);
  });

  it('allows chapters before the boundary chapter (whole prefix)', () => {
    expect(
      canRead(
        input({
          owned: false,
          position: { chapterId: 'ch-1', blockId: 'ch1-blk-03' },
          previewBoundary: { chapterId: 'ch-2' },
        }),
      ),
    ).toBe(true);
  });

  it('allows the boundary chapter itself when no block narrows it', () => {
    expect(
      canRead(
        input({
          owned: false,
          position: { chapterId: 'ch-2', blockId: 'ch2-blk-03' },
          previewBoundary: { chapterId: 'ch-2' },
        }),
      ),
    ).toBe(true);
  });

  it('denies chapters after the boundary chapter', () => {
    expect(
      canRead(
        input({
          owned: false,
          position: { chapterId: 'ch-3', blockId: 'ch3-blk-01' },
          previewBoundary: { chapterId: 'ch-2' },
        }),
      ),
    ).toBe(false);
  });

  it('respects a block-prefix boundary inside the boundary chapter', () => {
    const boundary = { chapterId: 'ch-2', blockId: 'ch2-blk-02' };
    expect(canRead(input({ owned: false, position: { chapterId: 'ch-1' }, previewBoundary: boundary }))).toBe(true);
    expect(canRead(input({ owned: false, position: { chapterId: 'ch-2', blockId: 'ch2-blk-01' }, previewBoundary: boundary }))).toBe(true);
    expect(canRead(input({ owned: false, position: { chapterId: 'ch-2', blockId: 'ch2-blk-02' }, previewBoundary: boundary }))).toBe(true);
    expect(canRead(input({ owned: false, position: { chapterId: 'ch-2', blockId: 'ch2-blk-03' }, previewBoundary: boundary }))).toBe(false);
    expect(canRead(input({ owned: false, position: { chapterId: 'ch-3', blockId: 'ch3-blk-01' }, previewBoundary: boundary }))).toBe(false);
  });

  it('treats a missing position block as the chapter start, inside a block prefix', () => {
    expect(
      canRead(
        input({
          owned: false,
          position: { chapterId: 'ch-2' },
          previewBoundary: { chapterId: 'ch-2', blockId: 'ch2-blk-02' },
        }),
      ),
    ).toBe(true);
  });
});

describe('canRead — malformed references deny by default', () => {
  const boundary = { chapterId: 'ch-2', blockId: 'ch2-blk-02' };

  it('denies when the boundary chapter is unknown', () => {
    expect(
      canRead(input({ owned: false, previewBoundary: { chapterId: 'nope' } })),
    ).toBe(false);
  });

  it('denies an empty-string boundary block id instead of granting the whole chapter', () => {
    // Regression: `previewBoundary.blockId: ''` is a supplied, malformed id and
    // must NOT be treated as an absent boundary (whole-chapter preview).
    expect(
      canRead(
        input({
          owned: false,
          position: { chapterId: 'ch-2', blockId: 'ch2-blk-03' },
          previewBoundary: { chapterId: 'ch-2', blockId: '' },
        }),
      ),
    ).toBe(false);
  });

  it('denies an empty-string boundary block id even for the chapter-start position', () => {
    expect(
      canRead(
        input({
          owned: false,
          position: { chapterId: 'ch-2' },
          previewBoundary: { chapterId: 'ch-2', blockId: '' },
        }),
      ),
    ).toBe(false);
  });

  it('denies a null boundary block id (malformed) instead of granting the whole chapter', () => {
    // `null` is outside the `blockId?: string` contract; treat it as malformed
    // and deny rather than interpreting it as "no block prefix".
    expect(
      canRead(
        input({
          owned: false,
          position: { chapterId: 'ch-2', blockId: 'ch2-blk-03' },
          previewBoundary: { chapterId: 'ch-2', blockId: null as unknown as string },
        }),
      ),
    ).toBe(false);
  });

  it('denies an empty-string position block id', () => {
    expect(
      canRead(
        input({
          owned: false,
          position: { chapterId: 'ch-2', blockId: '' },
          previewBoundary: boundary,
        }),
      ),
    ).toBe(false);
  });

  it('denies when the position chapter is unknown', () => {
    expect(
      canRead(
        input({
          owned: false,
          position: { chapterId: 'nope', blockId: 'ch2-blk-01' },
          previewBoundary: boundary,
        }),
      ),
    ).toBe(false);
  });

  it('denies when the boundary block is unknown', () => {
    expect(
      canRead(
        input({
          owned: false,
          position: { chapterId: 'ch-2', blockId: 'ch2-blk-01' },
          previewBoundary: { chapterId: 'ch-2', blockId: 'nope' },
        }),
      ),
    ).toBe(false);
  });

  it('denies when the position block is unknown', () => {
    expect(
      canRead(
        input({
          owned: false,
          position: { chapterId: 'ch-2', blockId: 'nope' },
          previewBoundary: boundary,
        }),
      ),
    ).toBe(false);
  });
});
