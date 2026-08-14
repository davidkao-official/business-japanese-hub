import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseUserStateRepository } from './supabase';

/** Per-table mock route: `data` is returned by terminal reads; `error` rejects. */
interface Route {
  data?: unknown;
  error?: string;
}

interface RecordedCall {
  table: string;
  method: string;
  args: unknown[];
}

function makeError(message: string) {
  return { message } as { message: string };
}

/**
 * Minimal chainable mock of the postgrest query builder. Records every call so
 * tests can assert the exact payloads/queries the adapter issues, and returns
 * per-table data/error at terminal methods.
 */
function createMockClient(routes: Record<string, Route>) {
  const calls: RecordedCall[] = [];
  let currentTable = '';

  const terminal =
    (method: string) =>
    async (...args: unknown[]) => {
      calls.push({ table: currentTable, method, args });
      const route = routes[currentTable];
      if (route?.error) return { data: null, error: makeError(route.error) };
      return { data: route?.data ?? null, error: null };
    };

  const builder: Record<string, (...args: unknown[]) => unknown> = {
    select: (...args) => {
      calls.push({ table: currentTable, method: 'select', args });
      return builder;
    },
    eq: (...args) => {
      calls.push({ table: currentTable, method: 'eq', args });
      return builder;
    },
    insert: (...args) => {
      calls.push({ table: currentTable, method: 'insert', args });
      return builder;
    },
    // In the adapter `order` is always the final chain step (listBookmarks), so
    // it is terminal here — mirroring the postgrest builder that resolves the
    // whole chain when awaited.
    order: terminal('order'),
    maybeSingle: terminal('maybeSingle'),
    single: terminal('single'),
    upsert: terminal('upsert'),
  };

  const client = {
    from: (table: string) => {
      currentTable = table;
      return builder;
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

const entitlementRow = {
  book_id: 'book-a',
  provider: 'manual',
  provider_ref: null,
  granted_at: '2026-08-01T00:00:00Z',
};

describe('SupabaseUserStateRepository#getEntitlement', () => {
  it('maps a row to the domain Entitlement', async () => {
    const { client } = createMockClient({ book_entitlement: { data: entitlementRow } });
    const repo = new SupabaseUserStateRepository(client);

    await expect(repo.getEntitlement('book-a')).resolves.toEqual({
      bookId: 'book-a',
      provider: 'manual',
      providerRef: null,
      grantedAt: '2026-08-01T00:00:00Z',
    });
  });

  it('returns null when the user does not own the book', async () => {
    const { client } = createMockClient({});
    const repo = new SupabaseUserStateRepository(client);

    await expect(repo.getEntitlement('book-a')).resolves.toBeNull();
  });

  it('scopes the query to the requested book id', async () => {
    const { client, calls } = createMockClient({ book_entitlement: { data: entitlementRow } });
    await new SupabaseUserStateRepository(client).getEntitlement('book-a');

    const eqCall = calls.find((call) => call.method === 'eq');
    expect(eqCall).toBeDefined();
    expect(eqCall?.args).toEqual(['book_id', 'book-a']);
  });

  it('throws a stable error on a DB error', async () => {
    const { client } = createMockClient({
      book_entitlement: { error: 'row-level security check failed' },
    });
    const repo = new SupabaseUserStateRepository(client);

    await expect(repo.getEntitlement('book-a')).rejects.toThrow(
      'getEntitlement: row-level security check failed',
    );
  });
});

describe('SupabaseUserStateRepository#getReadingState', () => {
  it('maps a row including null block/offset', async () => {
    const { client } = createMockClient({
      reading_state: {
        data: {
          book_id: 'book-a',
          chapter_id: 'ch-2',
          block_id: null,
          offset: null,
          updated_at: '2026-08-02T00:00:00Z',
        },
      },
    });
    const repo = new SupabaseUserStateRepository(client);

    await expect(repo.getReadingState('book-a')).resolves.toEqual({
      bookId: 'book-a',
      chapterId: 'ch-2',
      blockId: null,
      offset: null,
      updatedAt: '2026-08-02T00:00:00Z',
    });
  });

  it('returns null when no reading state exists yet', async () => {
    const { client } = createMockClient({});
    const repo = new SupabaseUserStateRepository(client);

    await expect(repo.getReadingState('book-a')).resolves.toBeNull();
  });
});

describe('SupabaseUserStateRepository#saveReadingState', () => {
  it('upserts by (user_id, book_id) with the mapped payload', async () => {
    const { client, calls } = createMockClient({});
    const repo = new SupabaseUserStateRepository(client);

    await repo.saveReadingState({ bookId: 'book-a', chapterId: 'ch-2', blockId: 'ch2-blk-03', offset: 12 });

    const upsertCall = calls.find((call) => call.method === 'upsert');
    expect(upsertCall).toBeDefined();
    expect(upsertCall?.args[0]).toEqual({
      book_id: 'book-a',
      chapter_id: 'ch-2',
      block_id: 'ch2-blk-03',
      offset: 12,
    });
    expect(upsertCall?.args[1]).toEqual({ onConflict: 'user_id,book_id' });
  });

  it('omits nothing: undefined block/offset become null (start-of-chapter resume)', async () => {
    const { client, calls } = createMockClient({});
    const repo = new SupabaseUserStateRepository(client);

    await repo.saveReadingState({ bookId: 'book-a', chapterId: 'ch-1', blockId: null, offset: null });

    const upsertCall = calls.find((call) => call.method === 'upsert');
    expect(upsertCall?.args[0]).toEqual({
      book_id: 'book-a',
      chapter_id: 'ch-1',
      block_id: null,
      offset: null,
    });
  });

  it('throws on a DB error', async () => {
    const { client } = createMockClient({ reading_state: { error: 'duplicate key' } });
    const repo = new SupabaseUserStateRepository(client);

    await expect(
      repo.saveReadingState({ bookId: 'book-a', chapterId: 'ch-1' }),
    ).rejects.toThrow('saveReadingState: duplicate key');
  });
});

describe('SupabaseUserStateRepository#listBookmarks', () => {
  const rows = [
    { id: 2, book_id: 'book-a', chapter_id: 'ch-2', block_id: 'ch2-blk-01', offset: 5, created_at: '2026-08-02T00:00:00Z' },
    { id: 1, book_id: 'book-a', chapter_id: 'ch-1', block_id: null, offset: null, created_at: '2026-08-01T00:00:00Z' },
  ];

  it('maps rows newest-first', async () => {
    const { client, calls } = createMockClient({ bookmark: { data: rows } });
    const repo = new SupabaseUserStateRepository(client);

    await expect(repo.listBookmarks('book-a')).resolves.toEqual([
      { id: 2, bookId: 'book-a', chapterId: 'ch-2', blockId: 'ch2-blk-01', offset: 5, createdAt: '2026-08-02T00:00:00Z' },
      { id: 1, bookId: 'book-a', chapterId: 'ch-1', blockId: null, offset: null, createdAt: '2026-08-01T00:00:00Z' },
    ]);

    const orderCall = calls.find((call) => call.method === 'order');
    expect(orderCall?.args).toEqual(['created_at', { ascending: false }]);
  });

  it('returns an empty array when there are no bookmarks', async () => {
    const { client } = createMockClient({});
    const repo = new SupabaseUserStateRepository(client);

    await expect(repo.listBookmarks('book-a')).resolves.toEqual([]);
  });
});

describe('SupabaseUserStateRepository#saveBookmark', () => {
  it('inserts with the mapped payload and returns the persisted record', async () => {
    const inserted = {
      id: 9,
      book_id: 'book-a',
      chapter_id: 'ch-2',
      block_id: 'ch2-blk-02',
      offset: 3,
      created_at: '2026-08-03T00:00:00Z',
    };
    const { client, calls } = createMockClient({ bookmark: { data: inserted } });
    const repo = new SupabaseUserStateRepository(client);

    await expect(
      repo.saveBookmark({ bookId: 'book-a', chapterId: 'ch-2', blockId: 'ch2-blk-02', offset: 3 }),
    ).resolves.toEqual({
      id: 9,
      bookId: 'book-a',
      chapterId: 'ch-2',
      blockId: 'ch2-blk-02',
      offset: 3,
      createdAt: '2026-08-03T00:00:00Z',
    });

    const insertCall = calls.find((call) => call.method === 'insert');
    expect(insertCall?.args[0]).toEqual({
      book_id: 'book-a',
      chapter_id: 'ch-2',
      block_id: 'ch2-blk-02',
      offset: 3,
    });
  });

  it('throws on a DB error', async () => {
    const { client } = createMockClient({ bookmark: { error: 'not authenticated' } });
    const repo = new SupabaseUserStateRepository(client);

    await expect(
      repo.saveBookmark({ bookId: 'book-a', chapterId: 'ch-1' }),
    ).rejects.toThrow('saveBookmark: not authenticated');
  });
});
