import { describe, expect, it } from 'vitest';
import {
  bearerHeaders,
  createMockDb,
  fakeLogger,
  handlerRequest,
} from '../_shared/testing.ts';
import { handleLibraryLearningEvidence, type LibraryLearningCatalog } from './handler.ts';

const EVENT_ID = '20000000-0000-4000-8000-000000000001';
const catalog: LibraryLearningCatalog = {
  schemaVersion: 1,
  books: [
    {
      bookId: 'book-a',
      releaseId: 'book-a@r3',
      chapters: [
        {
          chapterId: 'chapter-one',
          access: 'public',
          skillIds: ['workplace-greeting', 'request-clarification'],
        },
        { chapterId: 'chapter-two', access: 'public', skillIds: [] },
      ],
    },
  ],
};

function setup(routes: Record<string, unknown> = {}) {
  const mock = createMockDb({
    'auth:getUser': { data: { id: 'user-1' } },
    'rpc:record_library_learning_evidence': { data: 2 },
    ...routes,
  });
  return { mock, deps: { db: mock.db, log: fakeLogger(), catalog } };
}

async function call(value: unknown, routes: Record<string, unknown> = {}) {
  const { mock, deps } = setup(routes);
  const result = await handleLibraryLearningEvidence(
    handlerRequest(
      'POST',
      'https://test.supabase.co/functions/v1/library-learning-evidence',
      JSON.stringify(value),
      bearerHeaders('jwt-1'),
    ),
    deps,
  );
  return { result, mock };
}

describe('library-learning-evidence handler', () => {
  it('requires POST and a verified user', async () => {
    const { deps } = setup();
    const noAuth = await handleLibraryLearningEvidence(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/library-learning-evidence',
        JSON.stringify({ bookId: 'book-a', chapterId: 'chapter-one', eventId: EVENT_ID }),
      ),
      deps,
    );
    const wrongMethod = await handleLibraryLearningEvidence(
      handlerRequest('GET', 'https://test.supabase.co/functions/v1/library-learning-evidence'),
      deps,
    );
    expect(noAuth.status).toBe(401);
    expect(wrongMethod.status).toBe(405);
  });

  it.each(['userId', 'skillIds', 'releaseId', 'recordedAt', 'sourceProduct'])(
    'rejects the forged/derived %s field before persistence',
    async (field) => {
      const { result, mock } = await call({
        bookId: 'book-a',
        chapterId: 'chapter-one',
        eventId: EVENT_ID,
        [field]: field === 'skillIds' ? ['error-reporting'] : 'forged',
      });
      expect(result.status).toBe(400);
      expect(mock.rpcCalls('record_library_learning_evidence')).toHaveLength(0);
    },
  );

  it('rejects malformed UUIDs and unknown authoritative book/chapter references', async () => {
    const badEvent = await call({ bookId: 'book-a', chapterId: 'chapter-one', eventId: 'not-uuid' });
    const badBook = await call({ bookId: 'book-x', chapterId: 'chapter-one', eventId: EVENT_ID });
    const badChapter = await call({ bookId: 'book-a', chapterId: 'chapter-x', eventId: EVENT_ID });
    expect(badEvent.result.status).toBe(400);
    expect(badBook.result.status).toBe(400);
    expect(badChapter.result.status).toBe(400);
  });

  it('derives immutable release and skill references from the published catalog', async () => {
    const { result, mock } = await call({
      bookId: 'book-a',
      chapterId: 'chapter-one',
      eventId: EVENT_ID,
    });
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ recorded: 2 });
    expect(mock.rpcCalls('record_library_learning_evidence')[0]?.args[0]).toEqual({
      p_user_id: 'user-1',
      p_book_id: 'book-a',
      p_release_id: 'book-a@r3',
      p_chapter_id: 'chapter-one',
      p_source_event_id: EVENT_ID,
      p_skill_ids: ['workplace-greeting', 'request-clarification'],
    });
  });

  it('exact-matches bounded authoritative IDs without imposing a slug format', async () => {
    const { mock } = setup({ 'rpc:record_library_learning_evidence': { data: 1 } });
    const result = await handleLibraryLearningEvidence(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/library-learning-evidence',
        JSON.stringify({ bookId: 'Book/Stable:1', chapterId: 'Chapter_A', eventId: EVENT_ID }),
        bearerHeaders('jwt-1'),
      ),
      {
        db: mock.db,
        log: fakeLogger(),
        catalog: {
          schemaVersion: 1,
          books: [
            {
              bookId: 'Book/Stable:1',
              releaseId: 'release@1',
              chapters: [
                { chapterId: 'Chapter_A', access: 'public', skillIds: ['error-reporting'] },
              ],
            },
          ],
        },
      },
    );
    expect(result.status).toBe(200);
    expect(mock.rpcCalls('record_library_learning_evidence')[0]?.args[0]).toMatchObject({
      p_book_id: 'Book/Stable:1',
      p_chapter_id: 'Chapter_A',
    });
  });

  it('accepts a valid untagged chapter without fabricating evidence', async () => {
    const { result, mock } = await call({
      bookId: 'book-a',
      chapterId: 'chapter-two',
      eventId: EVENT_ID,
    });
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ recorded: 0 });
    expect(mock.rpcCalls('record_library_learning_evidence')).toHaveLength(0);
  });

  it('requires active server-authoritative entitlement for an entitled chapter', async () => {
    const entitledCatalog: LibraryLearningCatalog = {
      schemaVersion: 1,
      books: [
        {
          bookId: 'paid-book',
          releaseId: 'paid-book@r1',
          chapters: [
            { chapterId: 'paid-chapter', access: 'entitled', skillIds: ['meeting-disagreement'] },
          ],
        },
      ],
    };
    const unowned = setup({ book_entitlement: { data: null } });
    const denied = await handleLibraryLearningEvidence(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/library-learning-evidence',
        JSON.stringify({ bookId: 'paid-book', chapterId: 'paid-chapter', eventId: EVENT_ID }),
        bearerHeaders('jwt-1'),
      ),
      { ...unowned.deps, catalog: entitledCatalog },
    );
    expect(denied.status).toBe(403);
    expect(unowned.mock.rpcCalls('record_library_learning_evidence')).toHaveLength(0);
    expect(unowned.mock.callsFor('book_entitlement', 'eq').map((call) => call.args)).toEqual([
      ['user_id', 'user-1'],
      ['book_id', 'paid-book'],
      ['status', 'active'],
    ]);

    const owned = setup({
      book_entitlement: { data: { book_id: 'paid-book' } },
      'rpc:record_library_learning_evidence': { data: 1 },
    });
    const recorded = await handleLibraryLearningEvidence(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/library-learning-evidence',
        JSON.stringify({ bookId: 'paid-book', chapterId: 'paid-chapter', eventId: EVENT_ID }),
        bearerHeaders('jwt-1'),
      ),
      { ...owned.deps, catalog: entitledCatalog },
    );
    expect(recorded.status).toBe(200);
    expect(owned.mock.rpcCalls('record_library_learning_evidence')).toHaveLength(1);
  });

  it('rejects a catalog that omits the authoritative chapter access classification', async () => {
    const { mock } = setup();
    const result = await handleLibraryLearningEvidence(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/library-learning-evidence',
        JSON.stringify({ bookId: 'book-a', chapterId: 'chapter-one', eventId: EVENT_ID }),
        bearerHeaders('jwt-1'),
      ),
      {
        db: mock.db,
        log: fakeLogger(),
        catalog: {
          schemaVersion: 1,
          books: [
            {
              bookId: 'book-a',
              releaseId: 'book-a@r1',
              chapters: [{ chapterId: 'chapter-one', skillIds: ['error-reporting'] }],
            },
          ],
        } as never,
      },
    );
    expect(result.status).toBe(500);
    expect(mock.rpcCalls('record_library_learning_evidence')).toHaveLength(0);
  });

  it('reports an idempotent replay as zero new rows', async () => {
    const { result } = await call(
      { bookId: 'book-a', chapterId: 'chapter-one', eventId: EVENT_ID },
      { 'rpc:record_library_learning_evidence': { data: 0 } },
    );
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ recorded: 0 });
  });

  it('fails closed on persistence errors or malformed catalog data', async () => {
    const failed = await call(
      { bookId: 'book-a', chapterId: 'chapter-one', eventId: EVENT_ID },
      { 'rpc:record_library_learning_evidence': { error: 'database unavailable' } },
    );
    const { mock } = setup();
    const invalidCatalog = await handleLibraryLearningEvidence(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/library-learning-evidence',
        JSON.stringify({ bookId: 'book-a', chapterId: 'chapter-one', eventId: EVENT_ID }),
        bearerHeaders('jwt-1'),
      ),
      { db: mock.db, log: fakeLogger(), catalog: { schemaVersion: 1, books: 'forged' } as never },
    );
    expect(failed.result.status).toBe(502);
    expect(invalidCatalog.status).toBe(500);
  });
});
