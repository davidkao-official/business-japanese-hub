import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { SupabaseUserStateRepository } from './supabase';

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
const url = 'https://issue197-identity.invalid';
const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;

function base64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function makeJwt(subject: string): string {
  return `${base64Url({ alg: 'none', typ: 'JWT' })}.${base64Url({
    sub: subject === 'anon' ? undefined : subject,
    role: subject === 'anon' ? 'anon' : 'authenticated',
    exp: expiresAt,
    iss: `${url}/auth/v1`,
  })}.SYNTHETIC_INVALID_SIGNATURE`;
}

const apiKey = makeJwt('anon');

function session(userId: string) {
  return {
    access_token: makeJwt(userId),
    refresh_token: `SYNTHETIC-NOT-A-CREDENTIAL-${userId.slice(0, 1)}`,
    expires_at: expiresAt,
    expires_in: 60 * 60,
    token_type: 'bearer',
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-10-01T00:00:00.000Z',
    },
  };
}

function ownerForBearer(value: string | null): string | null {
  if (value === `Bearer ${makeJwt(userA)}`) return userA;
  if (value === `Bearer ${makeJwt(userB)}`) return userB;
  if (value === `Bearer ${apiKey}`) return 'anonymous-key';
  return null;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function testRepository() {
  const storageKey = 'sb-issue197-identity-auth-token';
  const values = new Map<string, string>([[storageKey, JSON.stringify(session(userA))]]);
  const sdkRead = deferred();
  const traceReads = { active: false };
  const storage: SupportedStorage = {
    getItem(key) {
      const value = values.get(key) ?? null;
      if (traceReads.active && key === storageKey) sdkRead.resolve();
      return value;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
  const intercepted: Array<{
    targetUserId: string | null;
    bearerUserId: string | null;
    onConflict: string | null;
    anchor: unknown;
  }> = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const requestUrl = new URL(String(input));
    expect(requestUrl.origin).toBe(url);
    expect(requestUrl.pathname).toBe('/rest/v1/reading_state');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const bearerUserId = ownerForBearer(new Headers(init?.headers).get('Authorization'));
    intercepted.push({
      targetUserId: typeof body.user_id === 'string' ? body.user_id : null,
      bearerUserId,
      onConflict: requestUrl.searchParams.get('on_conflict'),
      anchor: {
        book_id: body.book_id,
        chapter_id: body.chapter_id,
        block_id: body.block_id,
        offset: body.offset,
      },
    });

    // A modeled transport rejection only; this is not a DB/RLS test.
    if (body.user_id !== bearerUserId) {
      return new Response(JSON.stringify({ message: 'synthetic owner mismatch' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(null, { status: 204 });
  };
  const client = createClient(url, apiKey, {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch },
  });

  return {
    client,
    values,
    storageKey,
    sdkRead,
    traceReads,
    intercepted,
    repository: new SupabaseUserStateRepository(client),
    switchToB() {
      values.set(storageKey, JSON.stringify(session(userB)));
    },
  };
}

describe('Supabase reading-state initiator identity', () => {
  it('keeps target A when the real SDK reads stored session B before request dispatch', async () => {
    const rig = testRepository();
    const initialized = deferred();
    const subscription = rig.client.auth.onAuthStateChange((event) => {
      if (event === 'INITIAL_SESSION') initialized.resolve();
    }).data.subscription;
    try {
      await initialized.promise;
      await rig.client.auth.getSession();

      rig.traceReads.active = true;
      const save = rig.repository.saveReadingState({
        bookId: 'synthetic-book',
        chapterId: 'chapter-from-A',
        blockId: 'anchor-from-A',
        offset: 17,
      }, userA);
      rig.switchToB();
      // Synchronize on actual SDK storage read, not a hand-written request chain.
      await rig.sdkRead.promise;
      await expect(save).rejects.toThrow('saveReadingState: synthetic owner mismatch');
      expect(rig.intercepted).toEqual([{
        targetUserId: userA,
        bearerUserId: userB,
        onConflict: 'user_id,book_id',
        anchor: {
          book_id: 'synthetic-book',
          chapter_id: 'chapter-from-A',
          block_id: 'anchor-from-A',
          offset: 17,
        },
      }]);
    } finally {
      subscription.unsubscribe();
      await rig.client.auth.dispose();
    }
  });

  it('keeps an in-flight request at A if storage changes after the SDK read', async () => {
    const rig = testRepository();
    const initialized = deferred();
    const subscription = rig.client.auth.onAuthStateChange((event) => {
      if (event === 'INITIAL_SESSION') initialized.resolve();
    }).data.subscription;
    try {
      await initialized.promise;
      await rig.client.auth.getSession();

      rig.traceReads.active = true;
      const save = rig.repository.saveReadingState({
        bookId: 'synthetic-book',
        chapterId: 'chapter-from-A',
        blockId: 'anchor-from-A',
        offset: 17,
      }, userA);
      await rig.sdkRead.promise;
      rig.switchToB();

      await expect(save).resolves.toBeUndefined();
      expect(rig.intercepted).toHaveLength(1);
      expect(rig.intercepted[0]).toMatchObject({ targetUserId: userA, bearerUserId: userA });
    } finally {
      subscription.unsubscribe();
      await rig.client.auth.dispose();
    }
  });
});
