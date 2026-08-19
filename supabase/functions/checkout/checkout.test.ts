/**
 * Checkout handler tests (decision-record §3.4/§4.6/§8.3/§25).
 *
 * Injected fake Env / DbClient / ECPay adapter — no network, no DB, no Deno.
 *
 * #25 remediation coverage: jurisdiction is an explicit consumer declaration
 * (never locale-derived) that fails closed when unresolved; TW requires granted
 * prior consent; JP reads the server-authoritative platform_tax_config and
 * blocks paid checkout when unresolved; the client can never override tax
 * status; the immutable jurisdiction + tax snapshot is persisted on the Order.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createMockDb,
  createFakeAdapter,
  testEnv,
  fakeLogger,
  handlerRequest,
  bearerHeaders,
  PAYMENT_ROW,
  type MockRoute,
} from '../_shared/testing.ts';
import { handleCheckout } from './handler.ts';
import type { ConsentSubmission } from '../../../src/lib/payments/contract.ts';

const TW_CONSENT: ConsentSubmission = {
  jurisdiction: 'TW',
  locale: 'zh-TW',
  noticeVersion: 'tw-7day-removal-notice-v1',
  consentVersion: 'tw-digital-content-consent-v1',
  consentGranted: true,
  noticeTextSnapshot: 'notice text',
  consentTextSnapshot: 'consent text',
};

const JP_CONSENT: ConsentSubmission = {
  ...TW_CONSENT,
  jurisdiction: 'JP',
  locale: 'ja',
};

const CATALOG_TWD = {
  book_id: 'book-a',
  slug: 'keigo-essentials',
  currency: 'TWD',
  amount_minor: 79000,
  published_revision: 'keigo-essentials@e1-r1',
  released_at: '2026-01-01T00:00:00Z',
};

const CHECKOUT_URL = 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5';

/** Server-authoritative Japan tax status (default resolved so JP tests proceed). */
function jpTax(value: string): { platform_tax_config: MockRoute } {
  return { platform_tax_config: { data: { id: 1, key: 'japan_consumption_tax_status', value } } };
}

function setup(initial: Record<string, unknown> = {}, routes: Record<string, MockRoute> = {}) {
  const mock = createMockDb({
    'auth:getUser': { data: { id: 'user-1' } },
    catalog: { data: CATALOG_TWD },
    orders: { data: { id: 'ord-1' } },
    order_compliance: { data: null },
    payments: { data: PAYMENT_ROW },
    ...jpTax('taxable'),
    ...routes,
  });
  const adapter = createFakeAdapter();
  adapter.createCheckout.mockResolvedValue({
    kind: 'form-post',
    action: CHECKOUT_URL,
    fields: { MerchantTradeNo: 'BJH123456789', CheckMacValue: 'MAC' },
    provider: 'ecpay',
    merchantReference: 'BJH123456789',
  });
  return {
    mock,
    adapter,
    log: fakeLogger(),
    deps: {
      env: testEnv(),
      db: mock.db,
      adapters: { ecpay: adapter, paypal: createFakeAdapter('paypal') },
      log: fakeLogger(),
      now: () => new Date('2026-08-16T12:00:00Z'),
      random: () => 0.5,
      ...initial,
    },
  };
}

describe('checkout handler — jurisdiction + consent + tax gates (#25 remediation)', () => {
  it('no consent → refused as unresolved jurisdiction (fail closed, before any insert)', async () => {
    const { mock, deps } = setup();
    const result = await handleCheckout(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/checkout/books/book-a',
        JSON.stringify({ bookId: 'book-a' }),
        bearerHeaders('jwt-1'),
      ),
      deps,
    );
    expect(result.status).toBe(422);
    expect(JSON.parse(result.body)).toMatchObject({ reason: 'jurisdiction_required' });
    expect(mock.callsFor('orders', 'insert').length).toBe(0);
    expect(mock.callsFor('payments', 'insert').length).toBe(0);
  });

  it('malformed consent (unknown jurisdiction) → refused as unresolved', async () => {
    const { mock, deps } = setup();
    const result = await handleCheckout(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/checkout/books/book-a',
        JSON.stringify({ bookId: 'book-a', consent: { ...TW_CONSENT, jurisdiction: 'XX' } }),
        bearerHeaders('jwt-1'),
      ),
      deps,
    );
    expect(result.status).toBe(422);
    expect(JSON.parse(result.body)).toMatchObject({ reason: 'jurisdiction_required' });
    expect(mock.callsFor('orders', 'insert').length).toBe(0);
  });

  it('TW with granted consent → order + order_compliance + payment created, instruction returned', async () => {
    const { mock, adapter, deps } = setup();
    const result = await handleCheckout(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/checkout/books/book-a',
        JSON.stringify({ bookId: 'book-a', consent: TW_CONSENT }),
        bearerHeaders('jwt-1'),
      ),
      deps,
    );

    expect(result.status).toBe(200);
    const body = JSON.parse(result.body) as { orderId: string; paymentId: string; instruction: { action: string } };
    expect(body.orderId).toBe('ord-1');
    expect(body.paymentId).toBe('pay-1');
    expect(body.instruction.action).toBe(CHECKOUT_URL);

    const orderInsert = mock.callsFor('orders', 'insert')[0];
    expect(orderInsert.args[0]).toMatchObject({
      user_id: 'user-1',
      book_id: 'book-a',
      amount_minor: 79000,
      currency: 'TWD',
      status: 'pending',
      jurisdiction: 'TW',
      japan_tax_status_snapshot: 'unresolved',
    });
    expect(mock.callsFor('order_compliance', 'insert').length).toBe(1);
    const complianceInsert = mock.callsFor('order_compliance', 'insert')[0];
    expect(complianceInsert.args[0]).toMatchObject({ order_id: 'ord-1', jurisdiction: 'TW', consent_granted: true });

    const paymentInsert = mock.callsFor('payments', 'insert')[0];
    expect(paymentInsert.args[0]).toMatchObject({
      order_id: 'ord-1',
      provider: 'ecpay',
      amount_minor: 79000,
      currency: 'TWD',
      method: 'credit',
      status: 'created',
    });
    expect(adapter.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ord-1',
        paymentId: 'pay-1',
        amount: { amount: 79000, currency: 'TWD' },
        locale: 'CHT',
        returnUrl: 'https://test.supabase.co/functions/v1/ecpay-callback',
        orderResultUrl: 'https://test.supabase.co/functions/v1/ecpay-browser-return',
      }),
    );
    // created → pending transition after the provider instruction was built.
    const paymentUpdate = mock.callsFor('payments', 'update')[0];
    expect(paymentUpdate.args[0]).toMatchObject({ status: 'pending' });
  });

  it('ja UI locale + TW declaration is still TW (locale never determines jurisdiction)', async () => {
    const { mock, deps } = setup();
    const result = await handleCheckout(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/checkout/books/book-a',
        JSON.stringify({ bookId: 'book-a', consent: { ...TW_CONSENT, locale: 'ja' } }),
        bearerHeaders('jwt-1'),
      ),
      deps,
    );
    expect(result.status).toBe(200);
    const orderInsert = mock.callsFor('orders', 'insert')[0];
    expect(orderInsert.args[0]).toMatchObject({ jurisdiction: 'TW' });
    const complianceInsert = mock.callsFor('order_compliance', 'insert')[0];
    expect(complianceInsert.args[0]).toMatchObject({ jurisdiction: 'TW', locale: 'ja' });
  });

  it('TW without consent → refused (fail closed)', async () => {
    const { mock, deps } = setup();
    const result = await handleCheckout(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/checkout/books/book-a',
        JSON.stringify({ bookId: 'book-a' }),
        bearerHeaders('jwt-1'),
      ),
      deps,
    );
    expect(result.status).toBe(422);
    expect(JSON.parse(result.body)).toMatchObject({ reason: 'jurisdiction_required' });
    expect(mock.callsFor('orders', 'insert').length).toBe(0);
  });

  it('TW with denied consent → refused', async () => {
    const { mock, deps } = setup();
    const result = await handleCheckout(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/checkout/books/book-a',
        JSON.stringify({ bookId: 'book-a', consent: { ...TW_CONSENT, consentGranted: false } }),
        bearerHeaders('jwt-1'),
      ),
      deps,
    );
    expect(result.status).toBe(422);
    expect(JSON.parse(result.body)).toMatchObject({ reason: 'consent_required' });
    expect(mock.callsFor('orders', 'insert').length).toBe(0);
  });

  it('JP + unresolved platform tax status → paid checkout blocked (no order/payment)', async () => {
    const { mock, deps } = setup({}, jpTax('unresolved'));
    const result = await handleCheckout(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/checkout/books/book-a',
        JSON.stringify({ bookId: 'book-a', consent: JP_CONSENT }),
        bearerHeaders('jwt-1'),
      ),
      deps,
    );
    expect(result.status).toBe(422);
    expect(JSON.parse(result.body)).toMatchObject({ reason: 'tax_status_unresolved' });
    expect(mock.callsFor('orders', 'insert').length).toBe(0);
    expect(mock.callsFor('payments', 'insert').length).toBe(0);
    expect(mock.callsFor('order_compliance', 'insert').length).toBe(0);
  });

  it('JP + taxable → proceeds and persists the authoritative tax snapshot (TWD currency)', async () => {
    const { mock, deps } = setup();
    const result = await handleCheckout(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/checkout/books/book-a',
        JSON.stringify({ bookId: 'book-a', consent: JP_CONSENT }),
        bearerHeaders('jwt-1'),
      ),
      deps,
    );
    expect(result.status).toBe(200);
    // Pin the server-authoritative lookup key (the tax gate reads
    // platform_tax_config.japan_consumption_tax_status, never the client).
    expect(mock.callsFor('platform_tax_config', 'eq')[0].args).toEqual([
      'key',
      'japan_consumption_tax_status',
    ]);
    const orderInsert = mock.callsFor('orders', 'insert')[0];
    expect(orderInsert.args[0]).toMatchObject({
      jurisdiction: 'JP',
      japan_tax_status_snapshot: 'taxable',
      currency: 'TWD',
    });
    const complianceInsert = mock.callsFor('order_compliance', 'insert')[0];
    expect(complianceInsert.args[0]).toMatchObject({ jurisdiction: 'JP', consent_granted: true });
  });

  it('JP + exempt → proceeds and persists the exempt snapshot', async () => {
    const { mock, deps } = setup({}, jpTax('exempt'));
    const result = await handleCheckout(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/checkout/books/book-a',
        JSON.stringify({ bookId: 'book-a', consent: JP_CONSENT }),
        bearerHeaders('jwt-1'),
      ),
      deps,
    );
    expect(result.status).toBe(200);
    const orderInsert = mock.callsFor('orders', 'insert')[0];
    expect(orderInsert.args[0]).toMatchObject({ jurisdiction: 'JP', japan_tax_status_snapshot: 'exempt' });
  });

  it('client cannot override the tax status (server reads platform_tax_config only)', async () => {
    // Config is unresolved; even an injected taxable field in the body is ignored.
    const { mock, deps } = setup({}, jpTax('unresolved'));
    const result = await handleCheckout(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/checkout/books/book-a',
        JSON.stringify({
          bookId: 'book-a',
          consent: JP_CONSENT,
          japanConsumptionTaxStatus: 'taxable',
        }),
        bearerHeaders('jwt-1'),
      ),
      deps,
    );
    expect(result.status).toBe(422);
    expect(JSON.parse(result.body)).toMatchObject({ reason: 'tax_status_unresolved' });
    expect(mock.callsFor('orders', 'insert').length).toBe(0);

    // Config is exempt; an injected taxable field cannot change the snapshot.
    const exemptSetup = setup({}, jpTax('exempt'));
    const exemptResult = await handleCheckout(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/checkout/books/book-a',
        JSON.stringify({
          bookId: 'book-a',
          consent: JP_CONSENT,
          japanConsumptionTaxStatus: 'taxable',
        }),
        bearerHeaders('jwt-1'),
      ),
      exemptSetup.deps,
    );
    expect(exemptResult.status).toBe(200);
    const orderInsert = exemptSetup.mock.callsFor('orders', 'insert')[0];
    expect(orderInsert.args[0]).toMatchObject({ japan_tax_status_snapshot: 'exempt' });
  });

  it('JP tax gate fails closed when the config query rejects (transport → unresolved)', async () => {
    const { deps } = setup({}, jpTax('taxable'));
    const base = deps.db;
    const rejectingDb = {
      auth: base.auth,
      rpc: base.rpc,
      from: (table: string) => {
        if (table === 'platform_tax_config') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => {
                  throw new Error('transport down');
                },
              }),
            }),
          };
        }
        return base.from(table);
      },
    } as unknown as typeof base;
    const result = await handleCheckout(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/checkout/books/book-a',
        JSON.stringify({ bookId: 'book-a', consent: JP_CONSENT }),
        bearerHeaders('jwt-1'),
      ),
      { ...deps, db: rejectingDb },
    );
    expect(result.status).toBe(422);
    expect(JSON.parse(result.body)).toMatchObject({ reason: 'tax_status_unresolved' });
  });

  it('ignores client-supplied price tampering (amount/currency come from catalog only)', async () => {
    const { mock, deps } = setup();
    const result = await handleCheckout(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/checkout/books/book-a',
        JSON.stringify({
          bookId: 'book-a',
          consent: TW_CONSENT,
          amount: 1,
          currency: 'USD',
          status: 'succeeded',
          providerMerchantRef: 'HACKED-REF',
        }),
        bearerHeaders('jwt-1'),
      ),
      deps,
    );
    expect(result.status).toBe(200);
    const orderInsert = mock.callsFor('orders', 'insert')[0];
    expect(orderInsert.args[0]).toMatchObject({ amount_minor: 79000, currency: 'TWD', status: 'pending' });
    const paymentInsert = mock.callsFor('payments', 'insert')[0];
    expect(paymentInsert.args[0]).toMatchObject({ amount_minor: 79000, currency: 'TWD' });
    // The server-generated merchant ref must be used, never a client value.
    expect(String(paymentInsert.args[0]).indexOf('HACKED-REF')).toBe(-1);
  });

  it('non-TWD catalog amount → UnsupportedCurrencyForProvider surfaces as refusal', async () => {
    const { deps } = setup({});
    const mock = createMockDb({
      'auth:getUser': { data: { id: 'user-1' } },
      catalog: { data: { ...CATALOG_TWD, currency: 'JPY', amount_minor: 880 } },
      orders: { data: { id: 'ord-1' } },
      order_compliance: { data: null },
      payments: { data: PAYMENT_ROW },
    });
    const result = await handleCheckout(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/checkout/books/book-a',
        JSON.stringify({ bookId: 'book-a', consent: TW_CONSENT }),
        bearerHeaders('jwt-1'),
      ),
      { ...deps, db: mock.db },
    );
    expect(result.status).toBe(422);
    expect(JSON.parse(result.body)).toMatchObject({ reason: 'unsupported_currency' });
    // No order/payment rows may be created for an unpayable book.
    expect(mock.callsFor('orders', 'insert').length).toBe(0);
    expect(mock.callsFor('payments', 'insert').length).toBe(0);
  });

  it('unknown book (no released catalog row) → 404', async () => {
    const { deps } = setup({});
    const mock = createMockDb({
      'auth:getUser': { data: { id: 'user-1' } },
      catalog: { data: null },
    });
    const result = await handleCheckout(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/checkout/books/book-a',
        JSON.stringify({ bookId: 'book-a', consent: TW_CONSENT }),
        bearerHeaders('jwt-1'),
      ),
      { ...deps, db: mock.db },
    );
    expect(result.status).toBe(404);
  });

  it('unauthenticated → 401', async () => {
    const { deps } = setup();
    const result = await handleCheckout(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/checkout/books/book-a',
        JSON.stringify({ bookId: 'book-a', consent: TW_CONSENT }),
      ),
      deps,
    );
    expect(result.status).toBe(401);
  });

  it('method not POST → 405', async () => {
    const { deps } = setup();
    const result = await handleCheckout(
      handlerRequest('GET', 'https://test.supabase.co/functions/v1/checkout/books/book-a'),
      deps,
    );
    expect(result.status).toBe(405);
  });

  it('re-uses the generated adapter for a locale mapping check (ja → JPN)', async () => {
    const { adapter, deps } = setup({});
    const mock = createMockDb({
      'auth:getUser': { data: { id: 'user-1' } },
      catalog: { data: CATALOG_TWD },
      orders: { data: { id: 'ord-1' } },
      order_compliance: { data: null },
      payments: { data: PAYMENT_ROW },
      ...jpTax('taxable'),
    });
    const result = await handleCheckout(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/checkout/books/book-a',
        JSON.stringify({
          bookId: 'book-a',
          consent: { ...JP_CONSENT, jurisdiction: 'JP', locale: 'ja' },
        }),
        bearerHeaders('jwt-1'),
      ),
      { ...deps, db: mock.db },
    );
    expect(result.status).toBe(200);
    expect(adapter.createCheckout).toHaveBeenCalledWith(expect.objectContaining({ locale: 'JPN' }));
    expect(vi.isMockFunction(adapter.createCheckout)).toBe(true);
  });
});

describe('checkout handler — currency → provider routing (§21)', () => {
  const CATALOG_USD = {
    book_id: 'book-usd',
    slug: 'usd-book',
    currency: 'USD',
    amount_minor: 1999,
    published_revision: 'usd-book@e1-r1',
    released_at: '2026-01-01T00:00:00Z',
  };

  function usdSetup(routes: Record<string, unknown> = {}) {
    const mock = createMockDb({
      'auth:getUser': { data: { id: 'user-1' } },
      catalog: { data: CATALOG_USD },
      orders: { data: { id: 'ord-1' } },
      order_compliance: { data: null },
      payments: { data: { ...PAYMENT_ROW, provider: 'paypal', currency: 'USD', amount_minor: 1999 } },
      ...jpTax('taxable'),
      ...routes,
    });
    const ecpayAdapter = createFakeAdapter();
    const paypalAdapter = createFakeAdapter('paypal');
    paypalAdapter.createCheckout.mockResolvedValue({
      kind: 'redirect',
      url: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1',
      provider: 'paypal',
      merchantReference: 'BJH123456789',
      providerPaymentReference: 'ORDER-1',
    });
    const deps = {
      env: testEnv(),
      db: mock.db,
      adapters: { ecpay: ecpayAdapter, paypal: paypalAdapter },
      log: fakeLogger(),
      now: () => new Date('2026-08-16T12:00:00Z'),
      random: () => 0.5,
    };
    return { mock, ecpayAdapter, paypalAdapter, deps };
  }

  it('USD catalog → PayPal adapter, redirect instruction, payment provider=paypal', async () => {
    const { mock, ecpayAdapter, paypalAdapter, deps } = usdSetup();
    const result = await handleCheckout(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/checkout/books/book-usd',
        JSON.stringify({ bookId: 'book-usd', consent: TW_CONSENT }),
        bearerHeaders('jwt-1'),
      ),
      deps,
    );
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body) as { instruction: { kind: string; url: string; providerPaymentReference: string } };
    expect(body.instruction.kind).toBe('redirect');
    expect(body.instruction.url).toContain('checkoutnow');
    expect(body.instruction.providerPaymentReference).toBe('ORDER-1');

    // The PayPal adapter is used, the ECPay adapter is NOT.
    expect(paypalAdapter.createCheckout).toHaveBeenCalledTimes(1);
    expect(ecpayAdapter.createCheckout).not.toHaveBeenCalled();
    expect(paypalAdapter.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ord-1',
        amount: { amount: 1999, currency: 'USD' },
        orderResultUrl: 'https://test.supabase.co/functions/v1/paypal-browser-return',
      }),
    );

    // Payment insert uses the routed provider and USD; the PayPal order id is
    // persisted separately from the later capture/transaction id.
    const paymentInsert = mock.callsFor('payments', 'insert')[0];
    expect(paymentInsert.args[0]).toMatchObject({
      provider: 'paypal',
      amount_minor: 1999,
      currency: 'USD',
      status: 'created',
    });
    const refUpdate = mock.callsFor('payments', 'update').find((c) => c.args[0]?.provider_checkout_ref === 'ORDER-1');
    expect(refUpdate).toBeDefined();
    expect(mock.callsFor('payments', 'update').some((c) => c.args[0]?.provider_payment_ref === 'ORDER-1')).toBe(false);
  });

  it('JPY catalog → refused as unsupported_currency before any insert (#20 untouched)', async () => {
    const { deps } = usdSetup();
    const mock = createMockDb({
      'auth:getUser': { data: { id: 'user-1' } },
      catalog: { data: { ...CATALOG_USD, currency: 'JPY', amount_minor: 880 } },
      orders: { data: { id: 'ord-1' } },
      order_compliance: { data: null },
      payments: { data: PAYMENT_ROW },
      ...jpTax('taxable'),
    });
    const result = await handleCheckout(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/checkout/books/book-usd',
        JSON.stringify({ bookId: 'book-usd', consent: TW_CONSENT }),
        bearerHeaders('jwt-1'),
      ),
      { ...deps, db: mock.db },
    );
    expect(result.status).toBe(422);
    expect(JSON.parse(result.body)).toMatchObject({ reason: 'unsupported_currency' });
    expect(mock.callsFor('orders', 'insert').length).toBe(0);
    expect(mock.callsFor('payments', 'insert').length).toBe(0);
  });

  it('TWD/ECPay checkout works when PayPal is NOT configured (ECPay-only deployment)', async () => {
    const { mock, adapter, deps } = setup({
      env: testEnv({ paypalClientId: undefined, paypalClientSecret: undefined, paypalWebhookId: undefined }),
    });
    const result = await handleCheckout(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/checkout/books/book-a',
        JSON.stringify({ bookId: 'book-a', consent: TW_CONSENT }),
        bearerHeaders('jwt-1'),
      ),
      deps,
    );
    expect(result.status).toBe(200);
    // The ECPay adapter is used and the payment is created as TWD/ecpay.
    expect(adapter.createCheckout).toHaveBeenCalledTimes(1);
    expect(mock.callsFor('payments', 'insert')[0].args[0]).toMatchObject({
      provider: 'ecpay',
      currency: 'TWD',
      amount_minor: 79000,
    });
  });

  it('USD checkout with PayPal NOT configured → refused BEFORE any insert (no silent fallback)', async () => {
    const { deps } = usdSetup();
    const mock = createMockDb({
      'auth:getUser': { data: { id: 'user-1' } },
      catalog: { data: CATALOG_USD },
      orders: { data: { id: 'ord-1' } },
      order_compliance: { data: null },
      payments: { data: PAYMENT_ROW },
      ...jpTax('taxable'),
    });
    const result = await handleCheckout(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/checkout/books/book-usd',
        JSON.stringify({ bookId: 'book-usd', consent: TW_CONSENT }),
        bearerHeaders('jwt-1'),
      ),
      {
        ...deps,
        env: testEnv({ paypalClientId: undefined, paypalClientSecret: undefined, paypalWebhookId: undefined }),
        db: mock.db,
      },
    );
    expect(result.status).toBe(422);
    expect(JSON.parse(result.body)).toMatchObject({ reason: 'provider_configuration_unavailable' });
    // Fail closed BEFORE creating any Order / Payment row.
    expect(mock.callsFor('orders', 'insert').length).toBe(0);
    expect(mock.callsFor('payments', 'insert').length).toBe(0);
    expect(mock.callsFor('order_compliance', 'insert').length).toBe(0);
  });

  it('TWD checkout with ECPay NOT configured → refused BEFORE any insert', async () => {
    const { mock, deps } = setup();
    const result = await handleCheckout(
      handlerRequest(
        'POST',
        'https://test.supabase.co/functions/v1/checkout/books/book-a',
        JSON.stringify({ bookId: 'book-a', consent: TW_CONSENT }),
        bearerHeaders('jwt-1'),
      ),
      {
        ...deps,
        env: testEnv({ ecpayMerchantId: undefined, ecpayHashKey: undefined, ecpayHashIV: undefined }),
      },
    );
    expect(result.status).toBe(422);
    expect(JSON.parse(result.body)).toMatchObject({ reason: 'provider_configuration_unavailable' });
    expect(mock.callsFor('orders', 'insert')).toHaveLength(0);
    expect(mock.callsFor('payments', 'insert')).toHaveLength(0);
  });
});
