/**
 * Finance handler tests (decision-record §14 — server-enforced role; a
 * client-claimed role is never trusted).
 */
import { describe, expect, it } from 'vitest';
import {
  createFakeAdapter,
  createMockDb,
  fakeLogger,
  handlerRequest,
  bearerHeaders,
  ORDER_ROW,
  PAYMENT_ROW,
} from '../_shared/testing.ts';
import { handleFinance } from './handler.ts';

const REFUND_ROW = {
  id: 'ref-1',
  payment_id: 'pay-1',
  provider: 'ecpay',
  provider_refund_ref: null,
  amount_minor: 79000,
  currency: 'TWD',
  status: 'requested',
  reason_code: null,
  requested_by: 'user-1',
  provider_status_code: null,
  requested_at: '2026-08-16T11:00:00Z',
  completed_at: null,
};

const PRIMARY_REFUND_TRANSACTION = {
  refund_id: 'ref-1',
  refund_status: 'succeeded',
  payment_status: 'refunded',
  order_status: 'refunded',
  entitlement_revoked: true,
  already_confirmed: false,
};

function setup(overrides: Record<string, unknown> = {}) {
  const mock = createMockDb({
    'auth:getUser': { data: { id: 'user-1' } },
    finance_roles: { data: [{ role: 'finance_viewer' }] },
    orders: { data: [{}] },
    payments: { data: [] },
    refunds: { data: [] },
    book_entitlement: { data: [] },
    payment_events: { data: [] },
    order_email_outbox: { data: [] },
    admin_audit_log: { data: [] },
    scheduled_job_health: { data: [] },
    'rpc:finance_status_counts': {
      data: {
        matched: 0,
        mismatched: 0,
        pendingVerification: 0,
        succeeded: 0,
        failed: 0,
        unprocessedEvents: 0,
        processingErrors: 0,
        duplicatePayments: 0,
        refundRequested: 0,
        refundProcessing: 0,
        refundFailed: 0,
        emailPending: 0,
        emailDead: 0,
      },
    },
    ...overrides,
  });
  return {
    mock,
    deps: {
      db: mock.db,
      log: fakeLogger(),
      adapters: { ecpay: createFakeAdapter(), paypal: createFakeAdapter('paypal') },
      now: () => new Date('2026-08-16T12:00:00Z'),
    },
  };
}

describe('finance handler', () => {
  it('finance_viewer can read the read model', async () => {
    const { mock, deps } = setup({
      orders: { data: [{ id: 'ord-1', status: 'paid', amount_minor: 79000, currency: 'TWD' }] },
      payments: {
        data: [
          { id: 'pay-1', status: 'succeeded', reconciliation_status: 'matched' },
          { id: 'pay-2', status: 'duplicate_success', reconciliation_status: 'mismatch' },
        ],
      },
      refunds: { data: [{ id: 'ref-1', status: 'processing' }, { id: 'ref-2', status: 'failed' }] },
      payment_events: {
        data: [
          { id: 'evt-1', processing_result: null },
          { id: 'evt-2', processing_result: 'processing_error' },
        ],
      },
      order_email_outbox: { data: [{ id: 'mail-1', status: 'pending' }, { id: 'mail-2', status: 'dead' }] },
      admin_audit_log: { data: [{ id: 1, action: 'refund.requested' }] },
      scheduled_job_health: {
        data: [{ job_name: 'repair', last_succeeded_at: '2026-08-16T11:59:00Z' }],
      },
      'rpc:finance_status_counts': {
        data: {
          matched: 501,
          mismatched: 7,
          pendingVerification: 3,
          succeeded: 497,
          failed: 11,
          unprocessedEvents: 503,
          processingErrors: 9,
          duplicatePayments: 4,
          refundRequested: 6,
          refundProcessing: 8,
          refundFailed: 10,
          emailPending: 207,
          emailDead: 12,
        },
      },
    });
    const result = await handleFinance(
      handlerRequest('GET', 'https://test.supabase.co/functions/v1/finance', '', bearerHeaders('jwt-1')),
      deps,
    );
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.orders).toHaveLength(1);
    expect(body.payments).toHaveLength(2);
    expect(body.paymentEvents).toHaveLength(2);
    expect(body.emailOutbox).toHaveLength(2);
    expect(body.auditLog).toHaveLength(1);
    expect(body.scheduledJobHealth).toEqual([
      { job_name: 'repair', last_succeeded_at: '2026-08-16T11:59:00Z' },
    ]);
    expect(mock.callsFor('order_email_outbox', 'select')[0]?.args[0]).not.toContain('recipient_email');
    expect(mock.callsFor('admin_audit_log', 'select')[0]?.args[0]).not.toContain('before_state');
    expect(mock.callsFor('admin_audit_log', 'select')[0]?.args[0]).not.toContain('after_state');
    // Counts come from an exact DB aggregate, not the bounded display samples.
    expect(body.reconciliation).toEqual({
      matched: 501,
      mismatched: 7,
      pendingVerification: 3,
      succeeded: 497,
      failed: 11,
    });
    expect(body.operations).toEqual({
      unprocessedEvents: 503,
      processingErrors: 9,
      duplicatePayments: 4,
      refundRequested: 6,
      refundProcessing: 8,
      refundFailed: 10,
      emailPending: 207,
      emailDead: 12,
    });
    expect(typeof body.generatedAt).toBe('string');
  });

  it('fails closed when the exact-count RPC is missing or malformed', async () => {
    const { deps } = setup({
      'rpc:finance_status_counts': { data: { unprocessedEvents: 1 } },
    });

    const result = await handleFinance(
      handlerRequest('GET', 'https://test.supabase.co/functions/v1/finance', '', bearerHeaders('jwt-1')),
      deps,
    );

    expect(result.status).toBe(502);
    expect(JSON.parse(result.body)).toEqual({ error: 'finance status counts read failed' });
  });

  it('non-finance user → 403', async () => {
    const { deps } = setup({ finance_roles: { data: null } });
    const result = await handleFinance(
      handlerRequest('GET', 'https://test.supabase.co/functions/v1/finance', '', bearerHeaders('jwt-1')),
      deps,
    );
    expect(result.status).toBe(403);
  });

  it('a client-claimed role is ignored (role comes only from finance_roles)', async () => {
    const { mock, deps } = setup({ finance_roles: { data: null } });
    // The request "claims" admin in the body/header; the DB has no role → 403.
    const result = await handleFinance(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/finance',
        JSON.stringify({ action: 'request_refund', paymentId: 'pay-1', role: 'finance_admin' }),
        bearerHeaders('jwt-1'),
      ),
      deps,
    );
    expect(result.status).toBe(403);
    // The role lookup is scoped only by the verified user id — never a client value.
    const roleEq = mock.callsFor('finance_roles', 'eq')[0];
    expect(roleEq).toBeDefined();
    expect(roleEq.args).toEqual(['user_id', 'user-1']);
    expect(mock.callsFor('refunds', 'insert').length).toBe(0);
  });

  it('finance_viewer cannot POST operational actions', async () => {
    const { deps } = setup();
    const result = await handleFinance(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/finance',
        JSON.stringify({ action: 'request_refund', paymentId: 'pay-1' }),
        bearerHeaders('jwt-1'),
      ),
      deps,
    );
    expect(result.status).toBe(403);
  });

  it('finance_admin request_refund uses the atomic refund + audit transaction', async () => {
    const { mock, deps } = setup({
      finance_roles: { data: [{ role: 'finance_admin' }] },
      'rpc:request_full_refund': {
        data: { outcome: 'created', refund: REFUND_ROW, payment: PAYMENT_ROW },
      },
    });
    const result = await handleFinance(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/finance',
        JSON.stringify({ action: 'request_refund', paymentId: 'pay-1', reasonCode: 'duplicate_charge' }),
        bearerHeaders('jwt-1'),
      ),
      deps,
    );
    expect(result.status).toBe(201);
    expect(mock.rpcCalls('request_full_refund')).toHaveLength(1);
    expect(mock.rpcCalls('request_full_refund')[0].args[0]).toEqual({
      p_payment_id: 'pay-1',
      p_actor: 'user-1',
      p_reason_code: 'duplicate_charge',
    });
    expect(mock.callsFor('refunds', 'insert')).toHaveLength(0);
    expect(mock.callsFor('admin_audit_log', 'insert')).toHaveLength(0);
  });

  it('rejects a refund request for a non-refundable Payment without provider side effects', async () => {
    const { mock, deps } = setup({
      finance_roles: { data: [{ role: 'finance_admin' }] },
      'rpc:request_full_refund': {
        data: { outcome: 'not_refundable', payment_status: 'failed' },
      },
    });

    const result = await handleFinance(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/finance',
        JSON.stringify({ action: 'request_refund', paymentId: 'pay-1' }),
        bearerHeaders('jwt-1'),
      ),
      deps,
    );

    expect(result.status).toBe(409);
    expect(JSON.parse(result.body)).toMatchObject({ reason: 'payment_not_refundable' });
    expect(mock.callsFor('refunds', 'insert')).toHaveLength(0);
    expect(deps.adapters.paypal.refund).not.toHaveBeenCalled();
  });

  it('replays an existing refund request without creating or dispatching another refund', async () => {
    const { mock, deps } = setup({
      finance_roles: { data: [{ role: 'finance_admin' }] },
      'rpc:request_full_refund': {
        data: { outcome: 'existing', refund: { ...REFUND_ROW, status: 'processing' }, payment: PAYMENT_ROW },
      },
    });

    const result = await handleFinance(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/finance',
        JSON.stringify({ action: 'request_refund', paymentId: 'pay-1' }),
        bearerHeaders('jwt-1'),
      ),
      deps,
    );

    expect(result.status).toBe(202);
    expect(JSON.parse(result.body)).toMatchObject({ status: 'processing' });
    expect(mock.rpcCalls('request_full_refund')).toHaveLength(1);
    expect(deps.adapters.paypal.refund).not.toHaveBeenCalled();
  });

  it('replays a definitively failed refund with the same 409 terminal response', async () => {
    const { deps } = setup({
      finance_roles: { data: [{ role: 'finance_admin' }] },
      'rpc:request_full_refund': {
        data: { outcome: 'existing', refund: { ...REFUND_ROW, status: 'failed' }, payment: PAYMENT_ROW },
      },
    });

    const result = await handleFinance(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/finance',
        JSON.stringify({ action: 'request_refund', paymentId: 'pay-1' }),
        bearerHeaders('jwt-1'),
      ),
      deps,
    );

    expect(result.status).toBe(409);
    expect(JSON.parse(result.body)).toMatchObject({
      status: 'failed',
      reason: 'provider_refund_rejected',
      replayed: true,
    });
    expect(deps.adapters.paypal.refund).not.toHaveBeenCalled();
  });

  it('finance_admin request_refund on a PayPal payment → executes the provider refund and confirms it (entitlement revoked)', async () => {
    const paypalPayment = {
      id: 'pay-1',
      order_id: 'ord-1',
      provider: 'paypal',
      provider_merchant_ref: 'BJH202608160001',
      provider_payment_ref: 'CAPTURE-1',
      amount_minor: 1999,
      currency: 'USD',
      method: 'credit',
      status: 'succeeded',
      provider_status_code: null,
      provider_status_message: null,
      created_at: '2026-08-16T08:00:00Z',
      paid_at: '2026-08-16T11:00:00Z',
      last_verified_at: null,
      provider_fee_amount_minor: null,
      reconciliation_status: null,
    };
    const mock = createMockDb({
      'auth:getUser': { data: { id: 'user-1' } },
      finance_roles: { data: [{ role: 'finance_admin' }] },
      orders: { data: { ...ORDER_ROW, status: 'paid', currency: 'USD', amount_minor: 1999 } },
      refunds: { data: { ...REFUND_ROW, provider: 'paypal', amount_minor: 1999, currency: 'USD' } },
      book_entitlement: { data: null },
      'rpc:request_full_refund': {
        data: {
          outcome: 'created',
          refund: { ...REFUND_ROW, provider: 'paypal', amount_minor: 1999, currency: 'USD' },
          payment: paypalPayment,
        },
      },
      'rpc:finalize_refund_success_audited': { data: PRIMARY_REFUND_TRANSACTION },
    });
    const paypalAdapter = createFakeAdapter('paypal');
    paypalAdapter.refund.mockResolvedValue({
      ok: true,
      status: 'succeeded',
      providerRefundRef: 'REFUND-1',
      rawStatusCode: 'COMPLETED',
    });
    const deps = {
      db: mock.db,
      log: fakeLogger(),
      adapters: { ecpay: createFakeAdapter(), paypal: paypalAdapter },
      now: () => new Date('2026-08-16T12:00:00Z'),
    };
    const result = await handleFinance(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/finance',
        JSON.stringify({ action: 'request_refund', paymentId: 'pay-1' }),
        bearerHeaders('jwt-1'),
      ),
      deps,
    );
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toMatchObject({ status: 'succeeded', payment_status: 'refunded' });

    // The provider refund was executed with the capture id (full refund).
    expect(paypalAdapter.refund).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: 'pay-1',
        providerPaymentRef: 'CAPTURE-1',
        amount: { amount: 1999, currency: 'USD' },
      }),
    );
    // Provider reference, refund fact, payment/order state, and entitlement
    // revocation are committed in one locked database transaction.
    expect(mock.rpcCalls('finalize_refund_success_audited')).toHaveLength(1);
    expect(mock.rpcCalls('finalize_refund_success_audited')[0].args[0]).toMatchObject({
      p_refund_id: 'ref-1',
      p_provider_refund_ref: 'REFUND-1',
      p_provider_status_code: 'COMPLETED',
      p_actor: 'user-1',
    });
    expect(mock.callsFor('refunds', 'update')).toHaveLength(0);
    expect(mock.callsFor('book_entitlement', 'update')).toHaveLength(0);
  });

  it('B3: finance_admin request_refund on a PayPal payment with an ambiguous transport result → processing + provider ref/status persisted (not terminal failed)', async () => {
    const paypalPayment = {
      id: 'pay-1',
      order_id: 'ord-1',
      provider: 'paypal',
      provider_merchant_ref: 'BJH202608160001',
      provider_payment_ref: 'CAPTURE-1',
      amount_minor: 1999,
      currency: 'USD',
      method: 'credit',
      status: 'succeeded',
      provider_status_code: null,
      provider_status_message: null,
      created_at: '2026-08-16T08:00:00Z',
      paid_at: '2026-08-16T11:00:00Z',
      last_verified_at: null,
      provider_fee_amount_minor: null,
      reconciliation_status: null,
    };
    const mock = createMockDb({
      'auth:getUser': { data: { id: 'user-1' } },
      finance_roles: { data: [{ role: 'finance_admin' }] },
      orders: { data: { ...ORDER_ROW, status: 'paid', currency: 'USD', amount_minor: 1999 } },
      refunds: {
        data: { ...REFUND_ROW, provider: 'paypal', amount_minor: 1999, currency: 'USD' },
        singleData: [{
          ...REFUND_ROW,
          provider: 'paypal',
          amount_minor: 1999,
          currency: 'USD',
          status: 'processing',
          provider_status_code: 'TRANSPORT_UNAVAILABLE',
        }],
      },
      book_entitlement: { data: null },
      'rpc:request_full_refund': {
        data: {
          outcome: 'created',
          refund: { ...REFUND_ROW, provider: 'paypal', amount_minor: 1999, currency: 'USD' },
          payment: paypalPayment,
        },
      },
    });
    const paypalAdapter = createFakeAdapter('paypal');
    // Ambiguous transport failure after dispatch — the provider may have
    // processed the refund. Must NOT become a terminal failed refund (§21/B3).
    paypalAdapter.refund.mockResolvedValue({ ok: true, status: 'pending', rawStatusCode: 'TRANSPORT_UNAVAILABLE' });
    const deps = {
      db: mock.db,
      log: fakeLogger(),
      adapters: { ecpay: createFakeAdapter(), paypal: paypalAdapter },
      now: () => new Date('2026-08-16T12:00:00Z'),
    };
    const result = await handleFinance(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/finance',
        JSON.stringify({ action: 'request_refund', paymentId: 'pay-1' }),
        bearerHeaders('jwt-1'),
      ),
      deps,
    );
    expect(result.status).toBe(202);
    expect(JSON.parse(result.body)).toMatchObject({ status: 'processing' });

    // Provider ref/status and the recoverable processing transition are one
    // database write, so a failure cannot leave a half-updated refund fact.
    const persistUpdate = mock.callsFor('refunds', 'update')[0];
    expect(persistUpdate.args[0]).toMatchObject({
      provider_status_code: 'TRANSPORT_UNAVAILABLE',
      status: 'processing',
    });
    expect(mock.callsFor('refunds', 'update')).toHaveLength(1);
    // Entitlement is NEVER revoked on an ambiguous (non-confirmed) refund.
    expect(mock.callsFor('book_entitlement', 'update').length).toBe(0);
  });

  it('marks a definitive PayPal refund rejection failed so repair never re-dispatches it', async () => {
    const paypalPayment = {
      ...PAYMENT_ROW,
      provider: 'paypal',
      provider_payment_ref: 'CAPTURE-1',
      amount_minor: 1999,
      currency: 'USD',
      method: 'paypal',
      status: 'succeeded',
    };
    const mock = createMockDb({
      'auth:getUser': { data: { id: 'user-1' } },
      finance_roles: { data: [{ role: 'finance_admin' }] },
      refunds: {
        data: { ...REFUND_ROW, provider: 'paypal', amount_minor: 1999, currency: 'USD' },
        singleData: [{
          ...REFUND_ROW,
          provider: 'paypal',
          amount_minor: 1999,
          currency: 'USD',
          status: 'failed',
          provider_status_code: 'UNPROCESSABLE_ENTITY',
        }],
      },
      'rpc:request_full_refund': {
        data: {
          outcome: 'created',
          refund: { ...REFUND_ROW, provider: 'paypal', amount_minor: 1999, currency: 'USD' },
          payment: paypalPayment,
        },
      },
    });
    const paypalAdapter = createFakeAdapter('paypal');
    paypalAdapter.refund.mockResolvedValue({
      ok: false,
      status: 'failed',
      rawStatusCode: 'UNPROCESSABLE_ENTITY',
    });
    const deps = {
      db: mock.db,
      log: fakeLogger(),
      adapters: { ecpay: createFakeAdapter(), paypal: paypalAdapter },
      now: () => new Date('2026-08-16T12:00:00Z'),
    };

    const result = await handleFinance(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/finance',
        JSON.stringify({ action: 'request_refund', paymentId: 'pay-1' }),
        bearerHeaders('jwt-1'),
      ),
      deps,
    );

    expect(result.status).toBe(409);
    expect(JSON.parse(result.body)).toMatchObject({ status: 'failed' });
    expect(mock.callsFor('refunds', 'update')[0].args[0]).toMatchObject({
      status: 'failed',
      provider_status_code: 'UNPROCESSABLE_ENTITY',
    });
  });

  it.each([
    { providerResult: { ok: true, status: 'pending', rawStatusCode: 'PENDING' } },
    { providerResult: { ok: false, status: 'failed', rawStatusCode: 'UNPROCESSABLE_ENTITY' } },
  ] as const)(
    'does not let a stale $providerResult.status provider result downgrade a concurrently succeeded refund',
    async ({ providerResult }) => {
      const paypalPayment = {
        ...PAYMENT_ROW,
        provider: 'paypal',
        provider_payment_ref: 'CAPTURE-1',
        amount_minor: 1999,
        currency: 'USD',
        method: 'paypal',
        status: 'succeeded',
      };
      const finalRefund = {
        ...REFUND_ROW,
        provider: 'paypal',
        amount_minor: 1999,
        currency: 'USD',
        status: 'succeeded',
        provider_refund_ref: 'REFUND-FINAL',
        provider_status_code: 'COMPLETED',
        completed_at: '2026-08-16T12:00:00Z',
      };
      const mock = createMockDb({
        'auth:getUser': { data: { id: 'user-1' } },
        finance_roles: { data: [{ role: 'finance_admin' }] },
        refunds: { data: finalRefund, singleData: [null, finalRefund] },
        'rpc:request_full_refund': {
          data: {
            outcome: 'created',
            refund: { ...REFUND_ROW, provider: 'paypal', amount_minor: 1999, currency: 'USD' },
            payment: paypalPayment,
          },
        },
      });
      const paypalAdapter = createFakeAdapter('paypal');
      paypalAdapter.refund.mockResolvedValue(providerResult);

      const result = await handleFinance(
        handlerRequest(
          'POST',
          'https://test.supabase.co/functions/v1/finance',
          JSON.stringify({ action: 'request_refund', paymentId: 'pay-1' }),
          bearerHeaders('jwt-1'),
        ),
        {
          db: mock.db,
          log: fakeLogger(),
          adapters: { ecpay: createFakeAdapter(), paypal: paypalAdapter },
          now: () => new Date('2026-08-16T12:00:00Z'),
        },
      );

      expect(result.status).toBe(200);
      expect(JSON.parse(result.body)).toMatchObject({
        status: 'succeeded',
        refund: { status: 'succeeded', provider_refund_ref: 'REFUND-FINAL' },
      });
      expect(mock.callsFor('refunds', 'in')).toContainEqual({
        table: 'refunds',
        method: 'in',
        args: ['status', ['requested', 'processing']],
      });
    },
  );

  it('does not let a finance action assert refund success without provider evidence', async () => {
    const { mock, deps } = setup({
      finance_roles: { data: [{ role: 'finance_admin' }] },
    });
    const result = await handleFinance(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/finance',
        JSON.stringify({ action: 'confirm_refund', refundId: 'ref-1' }),
        bearerHeaders('jwt-1'),
      ),
      deps,
    );
    expect(result.status).toBe(400);
    expect(mock.rpcCalls('finalize_refund_success_audited')).toHaveLength(0);
    expect(mock.rpcCalls('finalize_refund_success')).toHaveLength(0);
  });

  it('unauthenticated → 401', async () => {
    const { deps } = setup();
    const result = await handleFinance(
      handlerRequest('GET', 'https://test.supabase.co/functions/v1/finance'),
      deps,
    );
    expect(result.status).toBe(401);
  });
});
