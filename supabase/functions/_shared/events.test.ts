import { describe, expect, it } from 'vitest';
import type { VerifiedProviderEvent } from '../../../src/lib/payments/contract.ts';
import { completePaymentEvent } from './events.ts';
import { createMockDb } from './testing.ts';

const EVENT: VerifiedProviderEvent = {
  provider: 'paypal',
  providerMerchantRef: 'MERCHANT-1',
  eventFingerprint: 'fingerprint-1',
  status: 'succeeded',
};

describe('payment event processing ledger', () => {
  it('correlates a durable callback receipt with its Payment and result', async () => {
    const mock = createMockDb({ 'rpc:complete_payment_event_outcome': { data: 'succeeded' } });

    await completePaymentEvent(
      mock.db,
      EVENT,
      'pay-1',
      'succeeded',
      '2026-08-16T12:00:00Z',
    );

    expect(mock.rpcCalls('complete_payment_event_outcome')[0].args[0]).toEqual({
      p_provider: 'paypal',
      p_event_fingerprint: 'fingerprint-1',
      p_payment_id: 'pay-1',
      p_processing_result: 'succeeded',
      p_processed_at: '2026-08-16T12:00:00Z',
    });
  });

  it('accepts a terminal outcome returned by the locked RPC instead of overwriting it', async () => {
    const mock = createMockDb({ 'rpc:complete_payment_event_outcome': { data: 'succeeded' } });
    await expect(
      completePaymentEvent(mock.db, EVENT, 'pay-1', 'processing_error', '2026-08-16T12:01:00Z'),
    ).resolves.toBeUndefined();
  });

  it('surfaces a ledger update failure so a callback is not acknowledged', async () => {
    const mock = createMockDb({ 'rpc:complete_payment_event_outcome': { error: 'write failed' } });

    await expect(
      completePaymentEvent(mock.db, EVENT, null, 'processing_error', '2026-08-16T12:00:00Z'),
    ).rejects.toThrow(/payment event outcome update failed/);
  });
});
