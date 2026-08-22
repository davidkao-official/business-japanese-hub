/**
 * Domain types for user-scoped persistence (ownership, reading state, bookmarks).
 *
 * The persistence layer stores ONLY user-scoped state. Book content never lives
 * here — it ships as static data in `src/content/`, keyed by the stable ids
 * (Book.id / Chapter.id / BlockBase.id) defined in docs/content-model.md §2.
 *
 * These types are provider-agnostic: the entitlement boundary is defined by the
 * `UserStateRepository` interface (see ./repository.ts), and Supabase is just
 * one replaceable adapter (see ./supabase.ts).
 */

import type { EntitlementStatus, PaymentProvider } from '../payments/contract';

/**
 * Who granted an entitlement. `manual` = operator/service-role; payment providers
 * follow the relaxed provider representation in
 * supabase/migrations/0003_compliance_finance.sql (decision-record §9.3).
 */
export type EntitlementProvider = 'manual' | PaymentProvider;

/** Server-authoritative record that a user may read a book. */
export interface Entitlement {
  /** Stable `Book.id` from the content model. */
  bookId: string;
  provider: EntitlementProvider;
  /** Opaque provider reference (operator note / ECPay transaction id). */
  providerRef?: string | null;
  /** ISO-8601 timestamp of the grant (server-authoritative). */
  grantedAt: string;
  /**
   * 'active' | 'revoked'. The DB column is NOT NULL (default 'active'); the
   * production repository returns only active rows, while this remains optional
   * for provider-neutral test and alternate repository implementations.
   */
  status?: EntitlementStatus;
  /** Provider-neutral source Order id (payment grants); null for manual grants. */
  sourceOrderId?: string | null;
  /** ISO-8601 timestamp of revocation (e.g. refund), null while active. */
  revokedAt?: string | null;
  /** Normalized revocation reason, e.g. 'refund'. */
  revocationReason?: string | null;
}

/**
 * A user's last-read location in a book. The resume anchor follows
 * docs/ui-ux-research.md §4.4: stable `Chapter.id` + block identity + optional
 * offset; on reflow/edit the Reader falls back to the nearest stable block or
 * the chapter start.
 */
export interface ReadingState {
  /** Stable `Book.id`. */
  bookId: string;
  /** Stable `Chapter.id` — the resume anchor. */
  chapterId: string;
  /** Stable `BlockBase.id` within `chapterId`; null/undefined = chapter start. */
  blockId?: string | null;
  /** Optional intra-block offset (renderer-level detail, persisted opaquely). */
  offset?: number | null;
  /** ISO-8601 timestamp of the last save (server-authoritative). */
  updatedAt: string;
}

/** An anchor-ready, user-created reading marker. */
export interface Bookmark {
  /** Provider-assigned identity (DB-generated id). */
  id: string | number;
  bookId: string;
  chapterId: string;
  blockId?: string | null;
  offset?: number | null;
  /** ISO-8601 creation timestamp (server-authoritative). */
  createdAt: string;
}

/** Client-supplied shape for persisting a reading location. */
export interface SaveReadingStateInput {
  bookId: string;
  chapterId: string;
  blockId?: string | null;
  offset?: number | null;
}

/** Client-supplied shape for creating a bookmark. */
export interface SaveBookmarkInput {
  bookId: string;
  chapterId: string;
  blockId?: string | null;
  offset?: number | null;
}
