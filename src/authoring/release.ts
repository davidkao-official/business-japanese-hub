import type { Book } from '../content/types';
import { validateBook } from '../content/validate';
import type { PreviewBoundary as AccessBoundary } from '../lib/entitlement';
import { derivePreview } from './preview';
import type { PreviewBoundary as AuthoredBoundary } from './preview';

export interface ReleaseSnapshot {
  schema?: unknown;
  descriptor?: { id?: unknown; slug?: unknown; contentHash?: unknown };
  catalog?: { order?: unknown };
  preview?: { boundary?: unknown; chapters?: unknown; paidStart?: unknown; isPartial?: unknown };
  book?: unknown;
}

export type ReleaseValidationResult =
  | { ok: true; book: Book; order: number; previewBoundary?: AccessBoundary }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBoundary(value: unknown): AuthoredBoundary | null {
  if (!isRecord(value) || typeof value.chapterId !== 'string') return null;
  if (value.kind === 'chapter') return { kind: 'chapter', chapterId: value.chapterId };
  if (value.kind === 'block' && typeof value.blockId === 'string') {
    return { kind: 'block', chapterId: value.chapterId, blockId: value.blockId };
  }
  return null;
}

/** One fail-closed structural contract shared by web build and server catalog sync. */
export function validateReleaseSnapshot(snapshot: ReleaseSnapshot, slug: string): ReleaseValidationResult {
  if (snapshot.schema !== 'publish-snapshot-v1') {
    return { ok: false, reason: 'unsupported snapshot schema' };
  }
  const { id, slug: descriptorSlug, contentHash } = snapshot.descriptor ?? {};
  if (descriptorSlug !== slug || typeof id !== 'string' || typeof contentHash !== 'string') {
    return { ok: false, reason: 'invalid descriptor identity' };
  }
  if (!/^[a-f0-9]{64}$/.test(contentHash) || !id.endsWith(`-${contentHash.slice(0, 12)}`)) {
    return { ok: false, reason: 'invalid content-addressed revision identity' };
  }

  const validatedBook = validateBook(snapshot.book);
  if (!validatedBook.ok) {
    const issue = validatedBook.issues[0];
    return {
      ok: false,
      reason: `invalid Book: ${issue?.path ?? '$'} ${issue?.message ?? 'unknown error'}`,
    };
  }
  const book = validatedBook.value;
  if (book.slug !== slug) return { ok: false, reason: 'release slug does not match Book slug' };
  if (book.publication?.status === 'published' && book.price === undefined) {
    return { ok: false, reason: 'published Book requires explicit price/access metadata' };
  }

  const order = snapshot.catalog?.order ?? Number.MAX_SAFE_INTEGER;
  if (typeof order !== 'number' || !Number.isSafeInteger(order) || order < 0) {
    return { ok: false, reason: 'catalog.order must be a non-negative integer' };
  }

  const boundary = readBoundary(snapshot.preview?.boundary);
  if (!boundary) return { ok: false, reason: 'release has an invalid preview boundary' };
  const derived = derivePreview(book, boundary);
  if (!derived.ok) {
    return { ok: false, reason: `invalid preview boundary: ${derived.issues[0]?.message ?? 'unknown error'}` };
  }
  if (JSON.stringify(snapshot.preview) !== JSON.stringify(derived.value)) {
    return { ok: false, reason: 'stored preview payload does not match the released Book and boundary' };
  }
  if (book.price?.tier === 'paid') {
    if (!derived.value.isPartial) return { ok: false, reason: 'paid Book preview exposes the complete Book' };
    return {
      ok: true,
      book,
      order,
      previewBoundary:
        boundary.kind === 'block'
          ? { chapterId: boundary.chapterId, blockId: boundary.blockId }
          : { chapterId: boundary.chapterId },
    };
  }
  if (derived.value.isPartial) {
    return { ok: false, reason: 'a non-paid Book cannot publish a partial preview' };
  }
  return { ok: true, book, order };
}
