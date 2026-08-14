import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { grantEntitlement } from './grant';

describe('grantEntitlement (server/operator path)', () => {
  it('calls the grant_entitlement RPC with the mapped arguments', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = { rpc } as unknown as SupabaseClient;

    await grantEntitlement(client, {
      userId: 'user-1',
      bookId: 'book-a',
      provider: 'manual',
    });

    expect(rpc).toHaveBeenCalledWith('grant_entitlement', {
      p_user_id: 'user-1',
      p_book_id: 'book-a',
      p_provider: 'manual',
      p_provider_ref: null,
    });
  });

  it('passes an ecpay provider ref through', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = { rpc } as unknown as SupabaseClient;

    await grantEntitlement(client, {
      userId: 'user-1',
      bookId: 'book-a',
      provider: 'ecpay',
      providerRef: 'txn-123',
    });

    expect(rpc).toHaveBeenCalledWith('grant_entitlement', {
      p_user_id: 'user-1',
      p_book_id: 'book-a',
      p_provider: 'ecpay',
      p_provider_ref: 'txn-123',
    });
  });

  it('throws on an RPC error (e.g. privilege revocation)', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'permission denied for function' } });
    const client = { rpc } as unknown as SupabaseClient;

    await expect(
      grantEntitlement(client, { userId: 'user-1', bookId: 'book-a', provider: 'manual' }),
    ).rejects.toThrow('grantEntitlement: permission denied for function');
  });
});
