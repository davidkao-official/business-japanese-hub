/**
 * Supabase adapter for the `UserStateRepository` interface.
 *
 * This is the concrete, replaceable adapter behind the provider-agnostic
 * entitlement boundary (see ./repository.ts). It talks to Supabase Postgres via
 * RLS-protected tables (supabase/migrations/0001_accounts.sql); row ownership is
 * enforced server-side by `auth.uid() = user_id`, so a client can never read or
 * write another user's rows, and can never self-grant ownership.
 *
 * The client is injected (constructor) so tests use a mocked client and never
 * touch the network.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserStateRepository } from './repository';
import type {
  Bookmark,
  Entitlement,
  ReadingState,
  SaveBookmarkInput,
  SaveReadingStateInput,
} from './types';

/* ------------------------------------------------------------------------- *
 * Row shapes (snake_case, as returned by Postgres / PostgREST)
 * ------------------------------------------------------------------------- */

interface EntitlementRow {
  book_id: string;
  /** Provider-neutral; widened per approved adapter (manual/ecpay/newebpay/stripe/paypal, §9.2). */
  provider: string;
  provider_ref: string | null;
  granted_at: string;
}

interface ReadingStateRow {
  book_id: string;
  chapter_id: string;
  block_id: string | null;
  offset: number | null;
  updated_at: string;
}

interface BookmarkRow {
  id: number | string;
  book_id: string;
  chapter_id: string;
  block_id: string | null;
  offset: number | null;
  created_at: string;
}

/* ------------------------------------------------------------------------- *
 * Mappers
 * ------------------------------------------------------------------------- */

function mapEntitlementRow(row: EntitlementRow): Entitlement {
  return {
    bookId: row.book_id,
    provider: row.provider as Entitlement['provider'],
    providerRef: row.provider_ref,
    grantedAt: row.granted_at,
  };
}

function mapReadingStateRow(row: ReadingStateRow): ReadingState {
  return {
    bookId: row.book_id,
    chapterId: row.chapter_id,
    blockId: row.block_id,
    offset: row.offset,
    updatedAt: row.updated_at,
  };
}

function mapBookmarkRow(row: BookmarkRow): Bookmark {
  return {
    id: row.id,
    bookId: row.book_id,
    chapterId: row.chapter_id,
    blockId: row.block_id,
    offset: row.offset,
    createdAt: row.created_at,
  };
}

/** Stable error wrapping so callers can react without depending on PostgREST types. */
function toRepositoryError(operation: string, message: string): Error {
  return new Error(`${operation}: ${message}`);
}

export class SupabaseUserStateRepository implements UserStateRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getEntitlement(bookId: string): Promise<Entitlement | null> {
    const { data, error } = await this.client
      .from('book_entitlement')
      .select('book_id, provider, provider_ref, granted_at')
      .eq('book_id', bookId)
      .maybeSingle();

    if (error) {
      throw toRepositoryError('getEntitlement', error.message);
    }
    if (!data) return null;
    return mapEntitlementRow(data as EntitlementRow);
  }

  async getReadingState(bookId: string): Promise<ReadingState | null> {
    const { data, error } = await this.client
      .from('reading_state')
      .select('book_id, chapter_id, block_id, offset, updated_at')
      .eq('book_id', bookId)
      .maybeSingle();

    if (error) {
      throw toRepositoryError('getReadingState', error.message);
    }
    if (!data) return null;
    return mapReadingStateRow(data as ReadingStateRow);
  }

  async saveReadingState(state: SaveReadingStateInput): Promise<void> {
    // `user_id` is intentionally omitted: the table defaults it to `auth.uid()`
    // and RLS (`with check (auth.uid() = user_id)`) rejects any other value.
    const { error } = await this.client
      .from('reading_state')
      .upsert(
        {
          book_id: state.bookId,
          chapter_id: state.chapterId,
          block_id: state.blockId ?? null,
          offset: state.offset ?? null,
        },
        { onConflict: 'user_id,book_id' },
      );

    if (error) {
      throw toRepositoryError('saveReadingState', error.message);
    }
  }

  async listBookmarks(bookId: string): Promise<Bookmark[]> {
    const { data, error } = await this.client
      .from('bookmark')
      .select('id, book_id, chapter_id, block_id, offset, created_at')
      .eq('book_id', bookId)
      .order('created_at', { ascending: false });

    if (error) {
      throw toRepositoryError('listBookmarks', error.message);
    }
    return (data as BookmarkRow[] | null)?.map(mapBookmarkRow) ?? [];
  }

  async saveBookmark(input: SaveBookmarkInput): Promise<Bookmark> {
    const { data, error } = await this.client
      .from('bookmark')
      .insert({
        book_id: input.bookId,
        chapter_id: input.chapterId,
        block_id: input.blockId ?? null,
        offset: input.offset ?? null,
      })
      .select('id, book_id, chapter_id, block_id, offset, created_at')
      .single();

    if (error) {
      throw toRepositoryError('saveBookmark', error.message);
    }
    return mapBookmarkRow(data as BookmarkRow);
  }
}
