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

const DUPLICATE_REFUND_TRANSACTION = {
  ...PRIMARY_REFUND_TRANSACTION,
  order_status: 'paid',
  entitlement_revoked: false,
};

function setup(overrides: Record<string, unknown> = {}) {
  const mock = createMockDb({
    'auth:getUser': { data: { id: 'user-1' } },
    finance_roles: { data: [{ role: 'finance_viewer' }] },
    orders: { data: [{}] },
    payments: { data: [] },
    refunds: { data: [] },
    book_entitlement: { data: [] },
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
    const { deps } = setup({
      orders: { data: [{ id: 'ord-1', status: 'paid', amount_minor: 79000, currency: 'TWD' }] },
      payments: { data: [{ id: 'pay-1', status: 'succeeded', reconciliation_status: 'matched' }] },
    });
    const result = await handleFinance(
      handlerRequest('GET', 'https://test.supabase.co/functions/v1/finance', '', bearerHeaders('jwt-1')),
      deps,
    );
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.orders).toHaveLength(1);
    expect(body.payments).toHaveLength(1);
    expect(body.reconciliation).toMatchObject({ matched: 1, succeeded: 1 });
    expect(typeof body.generatedAt).toBe('string');
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

  it('finance_admin request_refund → refunds row + admin_audit_log entry', async () => {
    const { mock, deps } = setup({
      finance_roles: { data: [{ role: 'finance_admin' }] },
      payments: { data: PAYMENT_ROW },
      refunds: { data: { id: 'ref-1' } },
      admin_audit_log: { data: null },
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
    const refundInsert = mock.callsFor('refunds', 'insert')[0];
    expect(refundInsert.args[0]).toMatchObject({
      payment_id: 'pay-1',
      provider: 'ecpay',
      amount_minor: 79000,
      currency: 'TWD',
      status: 'requested',
      reason_code: 'duplicate_charge',
      requested_by: 'user-1',
    });
    const auditInsert = mock.callsFor('admin_audit_log', 'insert')[0];
    expect(auditInsert.args[0]).toMatchObject({
      actor: 'user-1',
      action: 'refund.requested',
      entity_type: 'refund',
      entity_id: 'pay-1',
    });
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
      payments: { data: paypalPayment },
      orders: { data: { ...ORDER_ROW, status: 'paid', currency: 'USD', amount_minor: 1999 } },
      refunds: { data: { id: 'ref-1' } },
      book_entitlement: { data: null },
      admin_audit_log: { data: null },
      'rpc:finalize_refund_success': { data: PRIMARY_REFUND_TRANSACTION },
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
    expect(mock.rpcCalls('finalize_refund_success')).toHaveLength(1);
    expect(mock.rpcCalls('finalize_refund_success')[0].args[0]).toMatchObject({
      p_refund_id: 'ref-1',
      p_provider_refund_ref: 'REFUND-1',
      p_provider_status_code: 'COMPLETED',
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
      payments: { data: paypalPayment },
      orders: { data: { ...ORDER_ROW, status: 'paid', currency: 'USD', amount_minor: 1999 } },
      refunds: { data: { id: 'ref-1' } },
      book_entitlement: { data: null },
      admin_audit_log: { data: null },
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

    // Provider ref/status are persisted BEFORE the processing transition.
    const persistUpdate = mock.callsFor('refunds', 'update')[0];
    expect(persistUpdate.args[0]).toMatchObject({ provider_status_code: 'TRANSPORT_UNAVAILABLE' });
    const processingUpdate = mock.callsFor('refunds', 'update')[1];
    expect(processingUpdate.args[0]).toMatchObject({ status: 'processing' });
    // Entitlement is NEVER revoked on an ambiguous (non-confirmed) refund.
    expect(mock.callsFor('book_entitlement', 'update').length).toBe(0);
  });

  it('finance_admin confirm_refund (primary payment) → refund succeeded + payment/order refunded + entitlement revoked', async () => {
    const { mock, deps } = setup({
      finance_roles: { data: [{ role: 'finance_admin' }] },
      refunds: { data: REFUND_ROW },
      payments: { data: { ...PAYMENT_ROW, status: 'succeeded', provider_payment_ref: 'ECPAY-TRADE-1' } },
      orders: { data: { ...ORDER_ROW, status: 'paid' } },
      book_entitlement: { data: null },
      admin_audit_log: { data: null },
      'rpc:finalize_refund_success': { data: PRIMARY_REFUND_TRANSACTION },
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
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toMatchObject({
      refund: { id: 'ref-1', status: 'succeeded' },
      payment_status: 'refunded',
      order_status: 'refunded',
      entitlement_revoked: true,
    });

    expect(mock.rpcCalls('finalize_refund_success')).toHaveLength(1);
    expect(mock.rpcCalls('finalize_refund_success')[0].args[0]).toMatchObject({ p_refund_id: 'ref-1' });
    expect(mock.callsFor('refunds', 'update')).toHaveLength(0);
    expect(mock.callsFor('payments', 'update')).toHaveLength(0);
    expect(mock.callsFor('orders', 'update')).toHaveLength(0);
    expect(mock.callsFor('book_entitlement', 'update')).toHaveLength(0);
  });

  it('finance_admin confirm_refund (duplicate_success payment) → payment refunded only; ownership preserved', async () => {
    const { mock, deps } = setup({
      finance_roles: { data: [{ role: 'finance_admin' }] },
      refunds: { data: REFUND_ROW },
      payments: { data: { ...PAYMENT_ROW, status: 'duplicate_success', provider_payment_ref: 'ECPAY-TRADE-2' } },
      orders: { data: { ...ORDER_ROW, status: 'paid' } },
      book_entitlement: { data: null },
      admin_audit_log: { data: null },
      'rpc:finalize_refund_success': { data: DUPLICATE_REFUND_TRANSACTION },
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
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toMatchObject({
      refund: { id: 'ref-1', status: 'succeeded' },
      payment_status: 'refunded',
      order_status: 'paid',
      entitlement_revoked: false,
    });

    // The duplicate refund refunds the payment but NEVER touches order/entitlement.
    expect(mock.rpcCalls('finalize_refund_success')).toHaveLength(1);
    expect(mock.callsFor('payments', 'update')).toHaveLength(0);
    expect(mock.callsFor('orders', 'update').length).toBe(0);
    expect(mock.callsFor('book_entitlement', 'update').length).toBe(0);
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
