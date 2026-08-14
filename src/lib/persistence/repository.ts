/**
 * Provider-agnostic entitlement boundary.
 *
 * This interface is the single seam between the app and any server-authoritative
 * user-state store (Supabase today, anything else tomorrow). Consumers depend on
 * this interface — never on a concrete adapter — so the payment provider can be
 * swapped without touching reading/ownership code paths.
 *
 * Every method is scoped to the currently authenticated user. Reads are
 * guaranteed by the store's row-level security, not by the client: a client can
 * only ever see / write its own rows (see supabase/migrations/0001_accounts.sql
 * and docs/accounts-and-entitlement.md).
 */
import type {
  Bookmark,
  Entitlement,
  ReadingState,
  SaveBookmarkInput,
  SaveReadingStateInput,
} from './types';

export interface UserStateRepository {
  /** Server-authoritative ownership for a book, or null when not owned. */
  getEntitlement(bookId: string): Promise<Entitlement | null>;

  /** The user's last-read location in a book, or null when never read. */
  getReadingState(bookId: string): Promise<ReadingState | null>;

  /** Persist the user's last-read location (upsert per user+book). */
  saveReadingState(state: SaveReadingStateInput): Promise<void>;

  /** The user's bookmarks for a book, newest first. */
  listBookmarks(bookId: string): Promise<Bookmark[]>;

  /** Create a bookmark and return the persisted record (server-assigned id/timestamp). */
  saveBookmark(input: SaveBookmarkInput): Promise<Bookmark>;
}
