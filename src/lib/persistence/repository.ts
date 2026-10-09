/**
 * Provider-agnostic entitlement boundary.
 *
 * This interface is the single seam between the app and any server-authoritative
 * user-state store (Supabase today, anything else tomorrow). Consumers depend on
 * this interface — never on a concrete adapter — so the payment provider can be
 * swapped without touching reading/ownership code paths.
 *
 * Every method is scoped to the currently authenticated user. Reads and writes
 * are authorized by the store's row-level security, not by client-supplied
 * identity. Reading-state saves also carry the initiating user's captured ID
 * as the upsert target; RLS rejects a target that differs from auth.uid().
 * See supabase/migrations/0001_accounts.sql and docs/accounts-and-entitlement.md.
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

  /**
   * Persist the initiating user's last-read location (upsert per user+book).
   * The ID fixes the target row across session changes; RLS still authorizes it.
   */
  saveReadingState(state: SaveReadingStateInput, initiatingUserId: string): Promise<void>;

  /** The user's bookmarks for a book, newest first. */
  listBookmarks(bookId: string): Promise<Bookmark[]>;

  /** Create a bookmark and return the persisted record (server-assigned id/timestamp). */
  saveBookmark(input: SaveBookmarkInput): Promise<Bookmark>;
}
