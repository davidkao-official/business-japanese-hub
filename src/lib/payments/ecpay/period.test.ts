import { describe, expect, it } from 'vitest';
import {
  buildPeriodCancelFields,
  buildPeriodCheckoutFields,
  formatTaipeiDateTime,
  paidPeriodFor,
  parsePeriodQueryResponse,
  parseTaipeiDateTime,
  periodAuthorizationFacts,
  verifyPeriodNotification,
} from './period';
import { ecpayCheckMac } from './checkmac';

const HASH_KEY = 'pwFHCqoQZGmho4w6';
const HASH_IV = 'EkRm7iFT261dpevs';
const MERCHANT_ID = '3002607';

describe('ECPay recurring period helpers', () => {
  it('formats and parses Taipei date-time values', () => {
    const instant = new Date('2026-10-26T19:00:00.000Z');
    expect(formatTaipeiDateTime(instant)).toBe('2026/10/27 03:00:00');
    expect(parseTaipeiDateTime('2026/10/27 03:00:00')).toEqual(instant);
    expect(() => parseTaipeiDateTime('2026/02/30 00:00:00')).toThrow();
  });

  it('clamps paid periods to the target month calendar', () => {
    expect(paidPeriodFor(new Date('2026-01-31T02:00:00.000Z')).end).toEqual(
      new Date('2026-02-28T02:00:00.000Z'),
    );
    expect(paidPeriodFor(new Date('2028-01-31T02:00:00.000Z')).end).toEqual(
      new Date('2028-02-29T02:00:00.000Z'),
    );
    expect(paidPeriodFor(new Date('2026-12-15T02:00:00.000Z')).end).toEqual(
      new Date('2027-01-15T02:00:00.000Z'),
    );
  });

  it('builds signed recurring checkout fields and validates execution count', async () => {
    const fields = await buildPeriodCheckoutFields({
      merchantId: MERCHANT_ID,
      merchantTradeNo: 'plus202610270001',
      now: new Date('2026-10-26T19:00:00.000Z'),
      periodAmountTwd: 299,
      execTimes: 99,
      itemName: 'Business Japanese Hub Plus 月額',
      returnUrl: 'https://example.test/return',
      periodReturnUrl: 'https://example.test/period',
      orderResultUrl: 'https://example.test/result',
      language: 'JPN',
      hashKey: HASH_KEY,
      hashIV: HASH_IV,
    });
    expect(fields.TotalAmount).toBe('299');
    expect(fields.PeriodAmount).toBe('299');
    expect(fields.ExecTimes).toBe('99');
    expect(fields.CheckMacValue).toBe(await ecpayCheckMac(fields, HASH_KEY, HASH_IV));
    await expect(
      buildPeriodCheckoutFields({
        merchantId: MERCHANT_ID,
        merchantTradeNo: 'plus202610270002',
        now: new Date('2026-10-26T19:00:00.000Z'),
        periodAmountTwd: 299,
        execTimes: 100,
        itemName: 'Business Japanese Hub Plus 月額',
        returnUrl: 'https://example.test/return',
        periodReturnUrl: 'https://example.test/period',
        orderResultUrl: 'https://example.test/result',
        language: 'JPN',
        hashKey: HASH_KEY,
        hashIV: HASH_IV,
      }),
    ).rejects.toThrow();
  });

  it('verifies signed notifications, rejects tampering and hashes source-independent facts', async () => {
    const unsigned = {
      MerchantID: MERCHANT_ID,
      MerchantTradeNo: 'plus202610270001',
      RtnCode: '1',
      Amount: '299',
      PeriodType: 'M',
      Frequency: '1',
      ExecTimes: '99',
      gwsr: '123456789',
      ProcessDate: '2026/10/27 03:00:00',
      TotalSuccessTimes: '1',
      SimulatePaid: '0',
    };
    const form = {
      ...unsigned,
      CheckMacValue: await ecpayCheckMac(unsigned, HASH_KEY, HASH_IV),
    };
    const authorization = await verifyPeriodNotification(form, {
      merchantId: MERCHANT_ID,
      hashKey: HASH_KEY,
      hashIV: HASH_IV,
    });
    expect(authorization.sourceEventId).toBe('plus202610270001:auth:123456789');
    expect(
      await periodAuthorizationFacts({
        merchantTradeNo: authorization.merchantTradeNo,
        rtnCode: authorization.rtnCode,
        amountTwd: authorization.amountTwd,
        gwsr: authorization.gwsr,
        processAt: authorization.processAt,
      }),
    ).toBe(authorization.factsSha256);

    const tamperedAmount = { ...form, Amount: '300' };
    await expect(
      verifyPeriodNotification(tamperedAmount, {
        merchantId: MERCHANT_ID,
        hashKey: HASH_KEY,
        hashIV: HASH_IV,
      }),
    ).rejects.toThrow('invalid CheckMacValue');
    await expect(
      verifyPeriodNotification(form, {
        merchantId: 'wrong-merchant',
        hashKey: HASH_KEY,
        hashIV: HASH_IV,
      }),
    ).rejects.toThrow('unexpected MerchantID');
  });

  it('parses a period query response into callback-equivalent authorizations', async () => {
    const body = JSON.stringify({
      MerchantTradeNo: 'plus202610270001',
      RtnCode: 1,
      ExecStatus: '1',
      TotalSuccessTimes: 2,
      ExecLog: [
        {
          RtnCode: 1,
          amount: 299,
          gwsr: 222,
          process_date: '2026/11/27 03:00:00',
          auth_code: 'B',
          TradeNo: 'EC2',
        },
        {
          RtnCode: 1,
          amount: 299,
          gwsr: 111,
          process_date: '2026/10/27 03:00:00',
          auth_code: 'A',
          TradeNo: 'EC1',
        },
        {
          RtnCode: 0,
          amount: 299,
          gwsr: 333,
          process_date: '2026/10/28 03:00:00',
          auth_code: '',
          TradeNo: '',
        },
      ],
    });
    const query = await parsePeriodQueryResponse(body, 'plus202610270001');
    expect(query).toMatchObject({ merchantTradeNo: 'plus202610270001', rtnCode: '1', execStatus: '1' });
    expect(query.authorizations.map((a) => a.sourceEventId)).toEqual([
      'plus202610270001:auth:111',
      'plus202610270001:auth:222',
    ]);
    expect(query.authorizations.map((a) => a.totalSuccessTimes)).toEqual([1, 2]);

    const unsigned = {
      MerchantID: MERCHANT_ID,
      MerchantTradeNo: 'plus202610270001',
      RtnCode: '1',
      Amount: '299',
      PeriodType: 'M',
      gwsr: '111',
      ProcessDate: '2026/10/27 03:00:00',
      TotalSuccessTimes: '1',
      SimulatePaid: '0',
    };
    const form = { ...unsigned, CheckMacValue: await ecpayCheckMac(unsigned, HASH_KEY, HASH_IV) };
    const fromCallback = await verifyPeriodNotification(form, {
      merchantId: MERCHANT_ID,
      hashKey: HASH_KEY,
      hashIV: HASH_IV,
    });
    expect(query.authorizations[0].factsSha256).toBe(fromCallback.factsSha256);
  });

  it('rejects a period query response for a different order', async () => {
    const body = JSON.stringify({
      MerchantTradeNo: 'other-order',
      RtnCode: 1,
      ExecStatus: '1',
      ExecLog: [],
    });
    await expect(parsePeriodQueryResponse(body, 'plus202610270001')).rejects.toThrow(
      'unexpected MerchantTradeNo',
    );
  });

  it('signs period cancellation fields', async () => {
    const fields = await buildPeriodCancelFields({
      merchantId: MERCHANT_ID,
      merchantTradeNo: 'plus202610270001',
      now: new Date('2026-10-26T19:00:00.000Z'),
      hashKey: HASH_KEY,
      hashIV: HASH_IV,
    });
    expect(fields.Action).toBe('Cancel');
    expect(fields.CheckMacValue).toBe(await ecpayCheckMac(fields, HASH_KEY, HASH_IV));
  });
});
