import { describe, expect, it } from 'vitest';
import {
  EcpayPaymentProviderAdapter,
  EcpayReconciliationNotAutomatedError,
  InvalidCheckMacValueError,
  QUERY_TRADE_INFO_TIMEOUT_MS,
  canonicalVerifiedPayload,
  ecpayPaymentVerified,
  formatMerchantTradeDate,
  parseFormUrlEncoded,
  toEcpayLanguage,
  type EcpayAdapterConfig,
  type EcpayPaymentVerifiedArgs,
  type EcpayTransport,
} from './adapter';
import { ecpayCheckMac, sha256Hex } from './checkmac';
import { ECPAY_URLS } from './urls';
import { UnsupportedCurrencyForProvider, type CheckoutInstruction, type CreateCheckoutInput, type VerifiedProviderEvent } from '../contract';

/** Test-only ECPay stage credentials (decision-record §16). */
const HASH_KEY = '5294y06JbISpM5x9';
const HASH_IV = 'v77hoKGq4kWxNNIS';
const MERCHANT_ID = '2000132';

/** Narrow a checkout instruction to the ECPay form-post variant. */
function asForm(instruction: CheckoutInstruction): Extract<CheckoutInstruction, { kind: 'form-post' }> {
  expect(instruction.kind).toBe('form-post');
  return instruction as Extract<CheckoutInstruction, { kind: 'form-post' }>;
}

function makeAdapter(overrides?: Partial<EcpayAdapterConfig>): EcpayPaymentProviderAdapter {
  return new EcpayPaymentProviderAdapter({
    merchantId: MERCHANT_ID,
    hashKey: HASH_KEY,
    hashIV: HASH_IV,
    env: 'stage',
    now: () => new Date(2026, 7, 16, 10, 30, 0), // local 2026/08/16 10:30:00
    ...overrides,
  });
}

function makeCheckoutInput(overrides?: Partial<CreateCheckoutInput>): CreateCheckoutInput {
  return {
    orderId: 'order-1',
    paymentId: 'pay-1',
    merchantReference: 'BJH202608160001',
    amount: { amount: 79000, currency: 'TWD' },
    itemNameSnapshot: 'Keigo Essentials',
    locale: 'JPN',
    returnUrl: 'https://example.com/functions/v1/ecpay-callback',
    orderResultUrl: 'https://example.com/functions/v1/ecpay-browser-return',
    ...overrides,
  };
}

/** Sign an unsigned form with a valid CheckMacValue. */
async function signedForm(fields: Record<string, string>): Promise<Record<string, string>> {
  const checkMacValue = await ecpayCheckMac(fields, HASH_KEY, HASH_IV);
  return { ...fields, CheckMacValue: checkMacValue };
}

const BASE_CALLBACK: Record<string, string> = {
  MerchantID: MERCHANT_ID,
  MerchantTradeNo: 'BJH202608160001',
  TradeNo: '2026081612345678901',
  TradeAmt: '790',
  PaymentDate: '2026/08/16 10:31:00',
  PaymentType: 'Credit_CreditCard',
  RtnCode: '1',
  RtnMsg: 'Succeeded',
  SimulatePaid: '0',
};

/** A verified event as `verifyCallback` would produce it (TWD 790 → 79000 minor). */
const VERIFIED_EVENT: VerifiedProviderEvent = {
  provider: 'ecpay',
  providerMerchantRef: 'BJH202608160001',
  providerPaymentRef: '2026081612345678901',
  eventFingerprint: 'x'.repeat(64),
  status: 'succeeded',
  amount: { amount: 79000, currency: 'TWD' },
  paidAt: '2026/08/16 10:31:00',
  rawStatusCode: '1',
};

interface FakeRequest {
  form: Record<string, string>;
  timeoutMs: number;
}

/** A transport that records requests and responds per-test (or throws on error). */
function fakeTransport(
  respond: (form: Record<string, string>) => Promise<{ status: number; body: string }> | { status: number; body: string },
  onError = false,
): { transport: EcpayTransport; requests: FakeRequest[] } {
  const requests: FakeRequest[] = [];
  return {
    requests,
    transport: {
      async post(_url, form, timeoutMs) {
        requests.push({ form, timeoutMs });
        if (onError) {
          throw new Error('ECPay network failure');
        }
        const r = await respond(form);
        return { status: r.status, body: r.body };
      },
    },
  };
}

async function queryResponseBody(fields: Record<string, string>): Promise<string> {
  const checkMacValue = await ecpayCheckMac(fields, HASH_KEY, HASH_IV);
  return new URLSearchParams({ ...fields, CheckMacValue: checkMacValue }).toString();
}

describe('EcpayPaymentProviderAdapter.createCheckout', () => {
  it('builds the §4.2 AioCheckOut form with a valid CheckMacValue and integer TWD TotalAmount', async () => {
    const adapter = makeAdapter();
    const instruction = asForm(await adapter.createCheckout(makeCheckoutInput()));

    expect(instruction.action).toBe(ECPAY_URLS.stage.checkout);
    expect(instruction.provider).toBe('ecpay');
    expect(instruction.merchantReference).toBe('BJH202608160001');
    expect(instruction.fields).toMatchObject({
      MerchantID: MERCHANT_ID,
      MerchantTradeNo: 'BJH202608160001',
      MerchantTradeDate: '2026/08/16 10:30:00',
      PaymentType: 'aio',
      TotalAmount: '790', // canonical 79000 minor units → integer TWD 790 (§8.1.5)
      TradeDesc: 'Business Japanese Hub book purchase',
      ItemName: 'Keigo Essentials',
      ReturnURL: 'https://example.com/functions/v1/ecpay-callback',
      ChoosePayment: 'Credit',
      EncryptType: '1',
      OrderResultURL: 'https://example.com/functions/v1/ecpay-browser-return',
      NeedExtraPaidInfo: 'N',
      Language: 'JPN',
    });

    const { CheckMacValue, ...rest } = instruction.fields;
    expect(CheckMacValue).toMatch(/^[0-9A-F]{64}$/);
    await expect(ecpayCheckMac(rest, HASH_KEY, HASH_IV)).resolves.toBe(CheckMacValue);
  });

  it('uses the production AioCheckOut URL when env=prod', async () => {
    const adapter = makeAdapter({ env: 'prod' });
    const instruction = asForm(await adapter.createCheckout(makeCheckoutInput()));
    expect(instruction.action).toBe(ECPAY_URLS.prod.checkout);
  });

  it('throws UnsupportedCurrencyForProvider for a non-TWD amount', async () => {
    const adapter = makeAdapter();
    await expect(
      adapter.createCheckout(makeCheckoutInput({ amount: { amount: 880, currency: 'JPY' } })),
    ).rejects.toBeInstanceOf(UnsupportedCurrencyForProvider);
  });

  it('throws for a TWD amount that is not a whole number of dollars', async () => {
    const adapter = makeAdapter();
    await expect(
      adapter.createCheckout(makeCheckoutInput({ amount: { amount: 79050, currency: 'TWD' } })),
    ).rejects.toThrow(/positive whole-number TWD/);
  });
});

describe('EcpayPaymentProviderAdapter.verifyCallback', () => {
  it('returns a normalized succeeded event for a valid paid callback', async () => {
    const adapter = makeAdapter();
    const form = await signedForm(BASE_CALLBACK);
    const event = await adapter.verifyCallback({ form, provider: 'ecpay' });

    expect(event.provider).toBe('ecpay');
    expect(event.providerMerchantRef).toBe('BJH202608160001');
    expect(event.providerPaymentRef).toBe('2026081612345678901');
    expect(event.status).toBe('succeeded');
    expect(event.amount).toEqual({ amount: 79000, currency: 'TWD' }); // TradeAmt 790 → canonical minor units
    expect(event.paidAt).toBe('2026/08/16 10:31:00');
    expect(event.rawStatusCode).toBe('1');
    await expect(sha256Hex(canonicalVerifiedPayload(form))).resolves.toBe(event.eventFingerprint);
  });

  it('rejects a forged CheckMacValue', async () => {
    const adapter = makeAdapter();
    const form = await signedForm({ ...BASE_CALLBACK, TradeAmt: '791' });
    // Tamper AFTER signing: the stored mac no longer matches the tampered payload.
    form.TradeAmt = '790';
    await expect(adapter.verifyCallback({ form, provider: 'ecpay' })).rejects.toBeInstanceOf(
      InvalidCheckMacValueError,
    );
  });

  it('rejects a callback with the wrong configured MerchantID', async () => {
    const adapter = makeAdapter();
    const form = await signedForm({ ...BASE_CALLBACK, MerchantID: '9999999' });
    await expect(adapter.verifyCallback({ form, provider: 'ecpay' })).rejects.toThrow(/MerchantID mismatch/);
  });

  it('rejects a missing CheckMacValue', async () => {
    const adapter = makeAdapter();
    const form = { ...BASE_CALLBACK };
    delete form.CheckMacValue;
    await expect(adapter.verifyCallback({ form, provider: 'ecpay' })).rejects.toThrow(/missing CheckMacValue/);
  });

  it('rejects a callback missing a required evidence field', async () => {
    const adapter = makeAdapter();
    const withoutTradeNo = { ...BASE_CALLBACK };
    delete withoutTradeNo.TradeNo;
    const form = await signedForm(withoutTradeNo); // valid mac, but the field is absent
    await expect(adapter.verifyCallback({ form, provider: 'ecpay' })).rejects.toThrow(/required field 'TradeNo'/);
  });

  it('returns a failed event for a valid RtnCode != 1 callback', async () => {
    const adapter = makeAdapter();
    const form = await signedForm({ ...BASE_CALLBACK, RtnCode: '10200047', RtnMsg: '授權失敗' });
    const event = await adapter.verifyCallback({ form, provider: 'ecpay' });
    expect(event.status).toBe('failed');
    expect(event.rawStatusCode).toBe('10200047');
  });

  it('returns an unknown event for SimulatePaid=1 even when RtnCode=1 (§4.4)', async () => {
    const adapter = makeAdapter();
    const form = await signedForm({ ...BASE_CALLBACK, SimulatePaid: '1' });
    const event = await adapter.verifyCallback({ form, provider: 'ecpay' });
    expect(event.status).toBe('unknown');
  });

  it('rejects a request for a different provider', async () => {
    const adapter = makeAdapter();
    const form = await signedForm(BASE_CALLBACK);
    await expect(adapter.verifyCallback({ body: JSON.stringify(form), headers: {}, provider: 'paypal' })).rejects.toThrow(
      /cannot verify provider 'paypal'/,
    );
  });
});

describe('EcpayPaymentProviderAdapter.confirmPayment', () => {
  it('confirms a paid query (TradeStatus=1) with a valid response CheckMacValue', async () => {
    const queryFields = {
      MerchantID: MERCHANT_ID,
      MerchantTradeNo: 'BJH202608160001',
      TradeNo: '2026081612345678901',
      TradeAmt: '790',
      PaymentType: 'Credit_CreditCard',
      TradeDate: '2026/08/16',
      TradeStatus: '1',
    };
    const { transport, requests } = fakeTransport(async () => ({
      status: 200,
      body: await queryResponseBody(queryFields),
    }));
    const adapter = makeAdapter({ transport });
    const snapshot = await adapter.confirmPayment(VERIFIED_EVENT);

    expect(snapshot.provider).toBe('ecpay');
    expect(snapshot.merchantReference).toBe('BJH202608160001');
    expect(snapshot.providerPaymentReference).toBe('2026081612345678901');
    expect(snapshot.status).toBe('succeeded');
    expect(snapshot.amount).toEqual({ amount: 79000, currency: 'TWD' });
    expect(snapshot.paidAt).toBe(VERIFIED_EVENT.paidAt);
    expect(snapshot.rawStatusCode).toBe('1');

    // The QueryTradeInfo request itself is signed and targets the right merchant/ref.
    expect(requests).toHaveLength(1);
    expect(requests[0].timeoutMs).toBe(QUERY_TRADE_INFO_TIMEOUT_MS);
    expect(requests[0].form.MerchantID).toBe(MERCHANT_ID);
    expect(requests[0].form.MerchantTradeNo).toBe('BJH202608160001');
    const { CheckMacValue: reqMac, ...reqRest } = requests[0].form;
    await expect(ecpayCheckMac(reqRest, HASH_KEY, HASH_IV)).resolves.toBe(reqMac);
  });

  it('returns pending for TradeStatus=0 (not terminal)', async () => {
    const queryFields = {
      MerchantID: MERCHANT_ID,
      MerchantTradeNo: 'BJH202608160001',
      TradeNo: '2026081612345678901',
      TradeAmt: '790',
      TradeStatus: '0',
    };
    const { transport } = fakeTransport(async () => ({
      status: 200,
      body: await queryResponseBody(queryFields),
    }));
    const adapter = makeAdapter({ transport });
    const snapshot = await adapter.confirmPayment(VERIFIED_EVENT);
    expect(snapshot.status).toBe('pending');
  });

  it('fails closed to unknown on a network error', async () => {
    const { transport } = fakeTransport(() => ({ status: 200, body: '' }), true);
    const adapter = makeAdapter({ transport });
    const snapshot = await adapter.confirmPayment(VERIFIED_EVENT);
    expect(snapshot.status).toBe('unknown');
    expect(snapshot.rawStatusCode).toBe('QUERY_UNAVAILABLE');
  });

  it('fails closed to unknown on a non-200 HTTP status', async () => {
    const { transport } = fakeTransport(() => ({ status: 403, body: '' }));
    const adapter = makeAdapter({ transport });
    const snapshot = await adapter.confirmPayment(VERIFIED_EVENT);
    expect(snapshot.status).toBe('unknown');
    expect(snapshot.rawStatusCode).toBe('QUERY_HTTP_403');
  });

  it('fails closed to unknown when the query response CheckMacValue is invalid', async () => {
    const { transport } = fakeTransport(() => ({
      status: 200,
      body: new URLSearchParams({
        MerchantID: MERCHANT_ID,
        MerchantTradeNo: 'BJH202608160001',
        TradeStatus: '1',
        CheckMacValue: 'FORGED',
      }).toString(),
    }));
    const adapter = makeAdapter({ transport });
    const snapshot = await adapter.confirmPayment(VERIFIED_EVENT);
    expect(snapshot.status).toBe('unknown');
    expect(snapshot.rawStatusCode).toBe('QUERY_CHECKMAC_INVALID');
  });

  it('never confirms a simulated query (SimulatePaid=1) even with TradeStatus=1', async () => {
    const queryFields = {
      MerchantID: MERCHANT_ID,
      MerchantTradeNo: 'BJH202608160001',
      TradeNo: '2026081612345678901',
      TradeAmt: '790',
      TradeStatus: '1',
      SimulatePaid: '1',
    };
    const { transport } = fakeTransport(async () => ({
      status: 200,
      body: await queryResponseBody(queryFields),
    }));
    const adapter = makeAdapter({ transport });
    const snapshot = await adapter.confirmPayment(VERIFIED_EVENT);
    expect(snapshot.status).toBe('unknown');
    expect(snapshot.rawStatusCode).toBe('SIMULATED_PAYMENT');
  });
});

describe('ecpayPaymentVerified (§4.4 success predicate truth table)', () => {
  const base: EcpayPaymentVerifiedArgs = {
    callbackCheckMacValid: true,
    queryCheckMacValid: true,
    configuredMerchantId: MERCHANT_ID,
    merchantTradeNoExistsLocally: true,
    localAmount: { amount: 79000, currency: 'TWD' },
    callback: {
      merchantId: MERCHANT_ID,
      merchantTradeNo: 'BJH202608160001',
      tradeNo: 'TN1',
      tradeAmt: '790',
      rtnCode: '1',
      simulatePaid: '0',
    },
    query: {
      merchantTradeNo: 'BJH202608160001',
      tradeNo: 'TN1',
      tradeAmt: '790',
      tradeStatus: '1',
    },
  };

  const cases: Array<[string, (args: EcpayPaymentVerifiedArgs) => void, boolean]> = [
    ['all conditions hold', (a) => a, true],
    ['invalid callback checkmac', (a) => void (a.callbackCheckMacValid = false), false],
    ['invalid query checkmac', (a) => void (a.queryCheckMacValid = false), false],
    ['merchant trade no not found locally', (a) => void (a.merchantTradeNoExistsLocally = false), false],
    ['callback merchant id mismatch', (a) => void (a.callback.merchantId = '9999999'), false],
    ['callback amount mismatch', (a) => void (a.callback.tradeAmt = '791'), false],
    ['rtn_code != 1', (a) => void (a.callback.rtnCode = '0'), false],
    ['simulate_paid == 1', (a) => void (a.callback.simulatePaid = '1'), false],
    ['query merchant trade no mismatch', (a) => void (a.query.merchantTradeNo = 'OTHER'), false],
    ['query trade no mismatch', (a) => void (a.query.tradeNo = 'OTHER'), false],
    ['query amount mismatch', (a) => void (a.query.tradeAmt = '791'), false],
    ['query trade status != 1', (a) => void (a.query.tradeStatus = '0'), false],
    ['local amount currency not TWD', (a) => void (a.localAmount = { amount: 880, currency: 'JPY' }), false],
    ['local amount not a whole number of TWD', (a) => void (a.localAmount = { amount: 79050, currency: 'TWD' }), false],
  ];

  for (const [label, mutate, expected] of cases) {
    it(`is ${expected} when ${label}`, () => {
      const args: EcpayPaymentVerifiedArgs = {
        callbackCheckMacValid: base.callbackCheckMacValid,
        queryCheckMacValid: base.queryCheckMacValid,
        configuredMerchantId: base.configuredMerchantId,
        merchantTradeNoExistsLocally: base.merchantTradeNoExistsLocally,
        localAmount: { ...base.localAmount },
        callback: { ...base.callback },
        query: { ...base.query },
      };
      mutate(args);
      expect(ecpayPaymentVerified(args)).toBe(expected);
    });
  }
});

describe('EcpayPaymentProviderAdapter.refund / reconcile (MVP policy)', () => {
  it('returns the documented MVP manual-refund no-op', async () => {
    const adapter = makeAdapter();
    const result = await adapter.refund({
      paymentId: 'pay-1',
      providerPaymentRef: '2026081612345678901',
      amount: { amount: 79000, currency: 'TWD' },
      merchantReference: 'BJH202608160001',
    });
    expect(result).toEqual({ ok: false, status: 'failed', rawStatusCode: 'MVP_MANUAL_REFUND' });
  });

  it('reconcile is not automated in MVP and throws a typed error', async () => {
    const adapter = makeAdapter();
    await expect(adapter.reconcile({ from: '2026-08-15', to: '2026-08-16' })).rejects.toBeInstanceOf(
      EcpayReconciliationNotAutomatedError,
    );
  });
});

describe('pure helpers', () => {
  it('toEcpayLanguage normalizes case and rejects unknowns', () => {
    expect(toEcpayLanguage('JPN')).toBe('JPN');
    expect(toEcpayLanguage('cht')).toBe('CHT');
    expect(toEcpayLanguage('Eng')).toBe('ENG');
    expect(() => toEcpayLanguage('ja')).toThrow(/CHT \| JPN \| ENG/);
  });

  it('formatMerchantTradeDate produces yyyy/MM/dd HH:mm:ss', () => {
    expect(formatMerchantTradeDate(new Date(2026, 7, 16, 10, 30, 0))).toBe('2026/08/16 10:30:00');
  });

  it('parseFormUrlEncoded decodes x-www-form-urlencoded bodies', () => {
    expect(parseFormUrlEncoded('a=1&b=hello+world&c=x%26y')).toEqual({
      a: '1',
      b: 'hello world',
      c: 'x&y',
    });
  });
});
