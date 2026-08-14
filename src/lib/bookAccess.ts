/**
 * Book-level access helpers for the storefront / detail / library surfaces.
 *
 * These are pure, book-agnostic functions over the content model + the
 * provider-agnostic entitlement gate. They encode the CTA state matrix from
 * docs/ui-ux-research.md §8.3 and the deny-by-default tier resolution.
 */

import type { Book, PriceTier } from '../content/types';
import type { PreviewBoundary, ChapterOrderRef } from '../lib/entitlement';
import type { ReadingState } from '../lib/persistence/types';

/** Deny-by-default tier: a book without a declared price is treated as paid. */
export function tierOf(book: Book): PriceTier {
  return book.price?.tier ?? 'paid';
}

/**
 * Whether a book offers a public preview (試し読み):
 * free / preview tiers are entirely public; a paid book offers one only when
 * a preview boundary is declared.
 */
export function offersPreview(tier: PriceTier, previewBoundary?: PreviewBoundary): boolean {
  return tier === 'free' || tier === 'preview' || previewBoundary !== undefined;
}

/** Ordered chapter → block projection the entitlement gate consumes. */
export function toChapterOrderRefs(book: Book): ChapterOrderRef[] {
  return book.chapters.map((chapter) => ({
    id: chapter.id,
    blocks: chapter.blocks.map((block) => ({ id: block.id })),
  }));
}

/**
 * Reader href that resumes a persisted reading state. Unknown / stale chapter
 * ids fall back to the book's reader entry (deny-by-default: never crash, never
 * point at a missing chapter).
 */
export function resumeHref(book: Book, chapterId: string | undefined): string {
  const chapter = chapterId ? book.chapters.find((c) => c.id === chapterId) : undefined;
  return chapter ? `/books/${book.slug}/read/${chapter.slug}` : `/books/${book.slug}/read`;
}

/** The primary / secondary CTA kinds for a book in a given ownership state. */
export type BookCtaKind = 'purchase' | 'preview' | 'start' | 'continue' | 'toc';

export interface BookCtaState {
  primary: BookCtaKind;
  secondary?: BookCtaKind;
}

/**
 * The §8.3 CTA matrix:
 *
 *   Unowned + preview        → 購入する / 試し読み
 *   Unowned + no preview     → 購入する / —
 *   Owned + unread           → 読み始める / 目次を見る
 *   Owned + progress         → 続きを読む / 目次を見る
 *
 * Free / preview-tier books are readable by everyone (no ownership concept):
 * the primary action is 読み始める. `previewBoundary` is the gate-shaped
 * registry metadata (see src/reader/catalog.ts), never a Book field.
 */
export function bookCtaState(
  book: Book,
  owned: boolean,
  readingState: ReadingState | null,
  previewBoundary?: PreviewBoundary,
): BookCtaState {
  const tier = tierOf(book);

  if (tier === 'free' || tier === 'preview') {
    return { primary: 'start', secondary: 'toc' };
  }

  if (owned) {
    return readingState
      ? { primary: 'continue', secondary: 'toc' }
      : { primary: 'start', secondary: 'toc' };
  }

  return offersPreview(tier, previewBoundary)
    ? { primary: 'purchase', secondary: 'preview' }
    : { primary: 'purchase' };
}
