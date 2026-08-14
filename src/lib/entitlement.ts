/**
 * Entitlement gate — a pure, provider-agnostic "can this user read this
 * position?" primitive.
 *
 * Enforces the security property from issue #7: unowned paid content cannot be
 * unlocked by editing client state. The three inputs are:
 *
 *  1. `tier`            — book-level `Price.tier` (static content bundle).
 *  2. `owned`           — server-authoritative entitlement flag, fetched via
 *                         `UserStateRepository#getEntitlement` (RLS-protected;
 *                         a client cannot self-grant — see
 *                         supabase/migrations/0001_accounts.sql).
 *  3. `previewBoundary` — book-level generic preview metadata, per the
 *                         Preview-boundary contract (docs/ui-ux-research.md
 *                         §4.2): an ordered chapter prefix, optionally narrowed
 *                         to an ordered block prefix inside the final chapter.
 *                         The exact field shape on `Book` is finalized by the
 *                         content-model lane (#3); this gate accepts the shape
 *                         explicitly so it stays independent of that field.
 *
 * Read access policy:
 *  - `tier: 'free'`      → readable by everyone (public preview, no friction).
 *  - `tier: 'preview'`   → the whole book is a preview; readable by everyone.
 *  - `tier: 'paid'`      → readable when `owned`, or when the requested
 *                          position falls inside the preview prefix.
 *
 * The function is conservative by design: any malformed reference (unknown
 * chapter / block, missing boundary) DENIES access rather than risking a
 * spurious unlock. Integration with the Universal Reader gate is a bounded
 * follow-up for #5; this file only defines and tests the primitive.
 */
import type { PriceTier } from '../content/types';

/** A position within a book, keyed by stable content-model ids. */
export interface ReadingPosition {
  chapterId: string;
  /** Omit to mean "start of the chapter". */
  blockId?: string;
}

/**
 * Book-level preview boundary. `preview` is an ordered chapter prefix; when
 * `blockId` is set on the boundary chapter, only blocks up to and including it
 * (in chapter order) are previewable.
 */
export interface PreviewBoundary {
  /** Last chapter included in the preview (inclusive). */
  chapterId: string;
  /** Optional last block included in the preview (inclusive) within `chapterId`. */
  blockId?: string;
}

/** Ordered chapter → block structure (a projection of `Book.chapters`). */
export interface ChapterOrderRef {
  id: string;
  blocks: { id: string }[];
}

export interface CanReadInput {
  tier: PriceTier;
  /** Server-authoritative ownership for this book (from `book_entitlement`). */
  owned: boolean;
  position: ReadingPosition;
  /** Ordered chapters/blocks of the book, from the static content bundle. */
  chapters: ChapterOrderRef[];
  /** Only meaningful for `tier: 'paid'`; absent ⇒ no preview is offered. */
  previewBoundary?: PreviewBoundary;
}

/**
 * Index of a block within a chapter's ordered block list.
 * `-1` represents "before the first block" (chapter start).
 * Returns `null` when the id is unknown or malformed (deny-by-default).
 * Only `undefined` is treated as "chapter start"; any other supplied value
 * (including `''` or `null`) must resolve to a real block or be denied.
 */
function blockIndex(chapter: ChapterOrderRef, blockId: string | undefined): number | null {
  if (blockId === undefined) return -1;
  const index = chapter.blocks.findIndex((block) => block.id === blockId);
  return index === -1 ? null : index;
}

export function canRead(input: CanReadInput): boolean {
  const { tier, owned, position, chapters, previewBoundary } = input;

  if (tier === 'free') return true;
  if (owned) return true;
  if (tier === 'preview') return true;

  // tier === 'paid' and not owned: only the preview prefix is readable.
  if (!previewBoundary) return false;

  const boundaryChapterIndex = chapters.findIndex(
    (chapter) => chapter.id === previewBoundary.chapterId,
  );
  if (boundaryChapterIndex === -1) return false; // malformed boundary → deny

  const positionChapterIndex = chapters.findIndex(
    (chapter) => chapter.id === position.chapterId,
  );
  if (positionChapterIndex === -1) return false; // unknown chapter → deny

  if (positionChapterIndex < boundaryChapterIndex) return true; // fully earlier chapter
  if (positionChapterIndex > boundaryChapterIndex) return false; // beyond the prefix

  // Same chapter as the boundary: the preview is a block prefix.
  const boundaryChapter = chapters[boundaryChapterIndex];
  // Only `undefined` means "no block prefix → whole boundary chapter is
  // previewable". A supplied but malformed id (`''`, `null`, unknown) falls
  // through to `blockIndex`, which denies by default.
  if (previewBoundary.blockId === undefined) return true;

  const boundaryIndex = blockIndex(boundaryChapter, previewBoundary.blockId);
  if (boundaryIndex === null) return false; // malformed boundary block → deny

  const positionIndex = blockIndex(boundaryChapter, position.blockId);
  if (positionIndex === null) return false; // malformed position block → deny

  return positionIndex <= boundaryIndex;
}
