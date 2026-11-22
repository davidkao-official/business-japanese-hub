import { describe, expect, it } from 'vitest';
import { createFakeAdapter, createMockDb, fakeLogger, handlerRequest } from '../_shared/testing.ts';
import { handleFinance } from './handler.ts';

function setup(role = 'finance_admin') {
  const mock = createMockDb({
    'auth:getUser': { data: { id: 'admin-1' } },
    finance_roles: { data: [{ role }] },
    plus_ecpay_finance_open_case: { data: [{ id: 'case-1', reason: 'refund' }] },
    'rpc:request_plus_ecpay_finance_case': { data: 'case-1' },
  });
  const adapters = { ecpay: createFakeAdapter(), paypal: createFakeAdapter('paypal') };
  const handle = (body: unknown, method = 'POST') => handleFinance(
    handlerRequest(method, 'https://test.example/finance?scope=plus', JSON.stringify(body), {
      authorization: 'Bearer valid',
    }),
    { db: mock.db, log: fakeLogger(), adapters },
  );
  return { mock, handle, adapters };
}

describe('Plus financial operations', () => {
  it('allows a viewer to inspect the bounded Plus queue separately from Book commerce', async () => {
    const { mock, handle } = setup('finance_viewer');
    const result = await handle(null, 'GET');
    expect(JSON.parse(result.body)).toEqual({ cases: [{ id: 'case-1', reason: 'refund' }] });
    expect(mock.callsFor('payments')).toHaveLength(0);
    expect(mock.callsFor('plus_ecpay_finance_open_case', 'limit')[0].args).toEqual([200]);
  });

  it.each(['refund', 'reversal', 'dispute'])(
    'binds a %s request to the authenticated admin without executing money or access changes', async reason => {
      const { mock, handle, adapters } = setup();
      const result = await handle({
        action: 'request_plus_finance_case', sourceEventId: 'charge-1', reason,
        actor: 'forged-actor', outcome: 'confirmed', amount: 1,
      });
      expect(result.status).toBe(200);
      expect(mock.rpcCalls('request_plus_ecpay_finance_case')[0].args[0]).toEqual({
        p_source_event_id: 'charge-1', p_reason: reason, p_actor: 'admin-1',
      });
      expect(mock.rpcCalls('record_plus_membership_event')).toHaveLength(0);
      expect(mock.rpcCalls('confirm_plus_ecpay_financial_outcome')).toHaveLength(0);
      expect(adapters.ecpay.refund).not.toHaveBeenCalled();
    },
  );

  it('rejects a viewer mutation before any RPC', async () => {
    const { mock, handle } = setup('finance_viewer');
    expect((await handle({ action: 'request_plus_finance_case', sourceEventId: 'charge-1', reason: 'refund' })).status)
      .toBe(403);
    expect(mock.rpcCalls('request_plus_ecpay_finance_case')).toHaveLength(0);
  });

  it('exposes no browser action for confirming a financial outcome', async () => {
    const { mock, handle } = setup();
    expect((await handle({ action: 'confirm_plus_ecpay_financial_outcome' })).status).toBe(400);
    expect(mock.rpcCalls('confirm_plus_ecpay_financial_outcome')).toHaveLength(0);
  });

  it('rejects invalid/unverified charges and queue read errors', async () => {
    const { mock, handle } = setup();
    mock.setRoute('rpc:request_plus_ecpay_finance_case', { error: 'verified charge required' });
    expect((await handle({ action: 'request_plus_finance_case', sourceEventId: 'bad', reason: 'refund' })).status)
      .toBe(409);
    mock.setRoute('plus_ecpay_finance_open_case', { error: 'offline' });
    expect((await handle(null, 'GET')).status).toBe(502);
  });
});
