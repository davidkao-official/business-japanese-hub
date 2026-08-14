/**
 * Preview-boundary derivation for the authoring workflow (GitHub issue #10).
 *
 * The Preview-boundary contract (docs/ui-ux-research.md §4.2) states that a
 * book's public preview is an ORDERED PREFIX of its chapters (down to an
 * ordered block prefix inside a chapter), expressed as BOOK-LEVEL GENERIC
 * metadata — never as `if bookId === firstBook` or a second renderer. The
 * exact metadata field name and shape are finalized by the content-model
 * follow-up; this module is the INTERFACE layer that interprets the boundary
 * and derives the preview payload that a single Universal Reader entitlement
 * gate can consume.
 *
 * Pure data logic: no filesystem, no React, deterministic. A boundary that
 * does not resolve against a validated book is reported as a structured issue
 * (never thrown), mirroring the validator's contract in src/content/validate.ts.
 * Callers must pass a book that already passed `validateBook`.
 */

import type { Book, Chapter } from '../content/types';

/**
 * A preview boundary: where the free preview ends and paid content begins.
 *
 * - `chapter`: the whole book from chapter 1 up to and including `chapterId`
 *   is preview; every later chapter is paid.
 * - `block`: the preview extends into `chapterId` up to and including
 *   `blockId`; the blocks after it (and every later chapter) are paid.
 */
export type PreviewBoundary =
  | { kind: 'chapter'; chapterId: string }
  | { kind: 'block'; chapterId: string; blockId: string };

/** A single boundary problem. `path` mirrors the validator's `$.` paths. */
export interface PreviewIssue {
  path: string;
  message: string;
}

/** The exact point where paid content begins (the entitlement gate cut point). */
export interface PaidStart {
  chapterId: string;
  blockId: string;
}

/** The derived preview payload for one book. */
export interface PreviewContent {
  /** The boundary this payload was derived from. */
  boundary: PreviewBoundary;
  /** Ordered preview chapters — a strict prefix of `book.chapters`. */
  chapters: Chapter[];
  /**
   * Where paid content begins. `null` means the preview covers the whole book
   * (nothing is hidden), so the entitlement gate exposes everything.
   */
  paidStart: PaidStart | null;
  /** `true` when some content is hidden behind the boundary. */
  isPartial: boolean;
}

export type PreviewResult =
  | { ok: true; value: PreviewContent }
  | { ok: false; issues: PreviewIssue[] };

/**
 * Derives the preview payload for a validated book and a boundary.
 *
 * Deterministic and pure: the input book is never mutated (preview chapters
 * are freshly built slices, and a `block` boundary clones the boundary chapter
 * with a sliced `blocks` array). A boundary that names an unknown chapter or a
 * block outside the named chapter returns a structured failure.
 */
export function derivePreview(book: Book, boundary: PreviewBoundary): PreviewResult {
  const issues: PreviewIssue[] = [];

  const chapterIndex = book.chapters.findIndex((chapter) => chapter.id === boundary.chapterId);
  if (chapterIndex === -1) {
    issues.push({
      path: '$.preview.boundary.chapterId',
      message: `references unknown chapter id ${JSON.stringify(boundary.chapterId)}; the boundary must name an existing chapter`,
    });
    return { ok: false, issues };
  }

  let boundaryChapter = book.chapters[chapterIndex]!;
  let paidStart: PaidStart | null = null;

  if (boundary.kind === 'block') {
    const blockIndex = boundaryChapter.blocks.findIndex((block) => block.id === boundary.blockId);
    if (blockIndex === -1) {
      issues.push({
        path: '$.preview.boundary.blockId',
        message: `references unknown block id ${JSON.stringify(boundary.blockId)} in chapter ${JSON.stringify(boundary.chapterId)}`,
      });
      return { ok: false, issues };
    }
    if (blockIndex + 1 < boundaryChapter.blocks.length) {
      paidStart = { chapterId: boundary.chapterId, blockId: boundaryChapter.blocks[blockIndex + 1]!.id };
    } else if (chapterIndex + 1 < book.chapters.length) {
      paidStart = nextChapterStart(book, chapterIndex + 1);
    }
    boundaryChapter = {
      ...boundaryChapter,
      blocks: boundaryChapter.blocks.slice(0, blockIndex + 1),
    };
  } else if (chapterIndex + 1 < book.chapters.length) {
    paidStart = nextChapterStart(book, chapterIndex + 1);
  }

  return {
    ok: true,
    value: {
      boundary,
      chapters: [...book.chapters.slice(0, chapterIndex), boundaryChapter],
      paidStart,
      isPartial: paidStart !== null,
    },
  };
}

/**
 * The paid-content start of the chapter at `index`. Requires a validated book:
 * chapters' `blocks` are non-empty, so the first block id always exists.
 */
function nextChapterStart(book: Book, index: number): PaidStart {
  const chapter = book.chapters[index]!;
  return { chapterId: chapter.id, blockId: chapter.blocks[0]!.id };
}
