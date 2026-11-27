import { describe, expect, it } from 'vitest';
import {
  applyEcpayEncodeSubstitutions,
  canonicalCheckMacString,
  ecpayCheckMac,
  ecpayUrlEncode,
  sha256Hex,
  verifyCheckMac,
} from './checkmac';

/** Test-only ECPay stage credentials (decision-record §16). */
const HASH_KEY = '5294y06JbISpM5x9';
const HASH_IV = 'v77hoKGq4kWxNNIS';

/**
 * Independent known-answer vectors generated with Python hashlib/quote_plus
 * (safe='-_.!*()', explicitly escape '~') as a reference implementation of
 * §5 (sort → join → HashKey/HashIV → urlencode+substitutions → lowercase →
 * SHA-256 → uppercase) — NOT by the module under test.
 */
const V1_PARAMS: Record<string, string> = {
  MerchantID: '2000132',
  MerchantTradeNo: 'BJH202608160001',
  MerchantTradeDate: '2026/08/16 10:30:00',
  PaymentType: 'aio',
  TotalAmount: '790',
  TradeDesc: 'Business Japanese Hub book purchase',
  ItemName: 'Keigo Essentials',
  ReturnURL: 'https://example.com/functions/v1/ecpay-callback',
  ChoosePayment: 'Credit',
  EncryptType: '1',
  NeedExtraPaidInfo: 'N',
  Language: 'JPN',
};
const V1_EXPECTED = '8B2C6C7D8A23ADA24E53590BCC11E05F5E217E9259FEDF46B74846BD6A92FCB8';

/** Contains reserved URL characters and a CheckMacValue that must be excluded. */
const V2_PARAMS: Record<string, string> = {
  MerchantID: '2000132',
  MerchantTradeNo: 'BJH-2026_08.16!001*',
  TotalAmount: '79000',
  ItemName: 'Keigo & Business (100%) [Re:零]',
  ReturnURL: 'https://example.com/cb?a=1&b=2',
  CheckMacValue: 'FORGED_VALUE_SHOULD_BE_EXCLUDED',
};
const V2_EXPECTED = 'A85531E94A003BB2213A4A76377E952FA964EA0D95BE8FE9CFC685882E9DD831';

/** Callback-shape params (allowlisted evidence fields). */
const V3_PARAMS: Record<string, string> = {
  MerchantID: '2000132',
  MerchantTradeNo: 'BJHQ202608160003',
  TradeNo: '2026081612345678901',
  TradeAmt: '790',
  PaymentDate: '2026/08/16 10:31:00',
  PaymentType: 'Credit_CreditCard',
  RtnCode: '1',
  RtnMsg: 'Succeeded',
  SimulatePaid: '0',
};
const V3_EXPECTED = 'C263110D1DE7A845820E8BCE2F253226A2A9D3C841E546703FB9C50847853D79';

/** QueryTradeInfo-shape params. */
const V4_PARAMS: Record<string, string> = {
  MerchantID: '2000132',
  MerchantTradeNo: 'BJH202608160001',
  TimeStamp: '1755320400',
};
const V4_EXPECTED = '045553C490F82007F9FB59257E47C2A86F53A60BEA98DAF79386DB17EAC8ABD4';

/** Official public AIO test credentials; all expected hashes below are published by ECPay. */
const OFFICIAL_HASH_KEY = 'pwFHCqoQZGmho4w6';
const OFFICIAL_HASH_IV = 'EkRm7iFT261dpevs';
const OFFICIAL_VECTORS: { name: string; params: Record<string, string>; expected: string }[] = [
  {
    name: 'developer documentation checkout example with spaces',
    // https://developers.ecpay.com.tw/2902/
    params: {
      TradeDesc: '促銷方案',
      PaymentType: 'aio',
      MerchantTradeDate: '2023/03/12 15:30:23',
      MerchantTradeNo: 'ecpay20230312153023',
      MerchantID: '3002607',
      ReturnURL: 'https://www.ecpay.com.tw/receive.php',
      ItemName: 'Apple iphone 15',
      TotalAmount: '30000',
      ChoosePayment: 'ALL',
      EncryptType: '1',
    },
    expected: '6C51C9E6888DE861FD62FB1DD17029FC742634498FD813DC43D4243B5685B840',
  },
  // Official vectors: https://github.com/ECPay/ECPay-API-Skill/blob/e8cc595d7ca40b54ba8ccd4799f9fd3b0fe11f44/test-vectors/checkmacvalue.json
  {
    name: 'apostrophe',
    params: { MerchantID: '3002607', ItemName: "Tom's Shop", TotalAmount: '100' },
    expected: 'CF0A3D4901D99459D8641516EC57210700E8A5C9AB26B1D021301E9CB93EF78D',
  },
  {
    name: 'tilde',
    params: { MerchantID: '3002607', ItemName: 'Test~Product', TotalAmount: '200' },
    expected: 'CEEAE01D2F9A8E74D4AC0DCE7735B046D73F35A5EC99558A31A2EE03159DA1C9',
  },
  {
    name: 'spaces',
    params: { MerchantID: '3002607', ItemName: 'My Test Product', TotalAmount: '300' },
    expected: '7712A5E6EDC3B57086063C88568084C66CE882A21D40E74DE5ACA3B478C6F316',
  },
  {
    name: 'callback with PaymentDate and TradeDate spaces',
    params: {
      MerchantID: '3002607',
      MerchantTradeNo: 'Test1234567890',
      RtnCode: '1',
      RtnMsg: 'Succeeded',
      TradeNo: '2301011234567890',
      TradeAmt: '100',
      PaymentDate: '2025/01/01 12:05:00',
      PaymentType: 'Credit_CreditCard',
      TradeDate: '2025/01/01 12:00:00',
      SimulatePaid: '0',
    },
    expected: '2AB536D86AFF8E1086744D59175040A32538C96B1C28C4135B551BD728E913B8',
  },
];

describe('official ECPay SHA-256 vectors', () => {
  it.each(OFFICIAL_VECTORS)('generates and verifies $name', async ({ params, expected }) => {
    await expect(ecpayCheckMac(params, OFFICIAL_HASH_KEY, OFFICIAL_HASH_IV)).resolves.toBe(expected);
    await expect(verifyCheckMac(
      { ...params, CheckMacValue: expected }, OFFICIAL_HASH_KEY, OFFICIAL_HASH_IV, expected,
    )).resolves.toBe(true);
    await expect(verifyCheckMac(
      { ...params, TotalAmount: '999' }, OFFICIAL_HASH_KEY, OFFICIAL_HASH_IV, expected,
    )).resolves.toBe(false);
  });
});

describe('ecpayCheckMac (§5 canonicalization)', () => {
  it('matches the independent known-answer vector V1', async () => {
    await expect(ecpayCheckMac(V1_PARAMS, HASH_KEY, HASH_IV)).resolves.toBe(V1_EXPECTED);
  });

  it('matches V2 and correctly excludes CheckMacValue', async () => {
    await expect(ecpayCheckMac(V2_PARAMS, HASH_KEY, HASH_IV)).resolves.toBe(V2_EXPECTED);
    // Adding a CheckMacValue must not change the digest.
    const withMac = { ...V1_PARAMS, CheckMacValue: 'ANYTHING' };
    await expect(ecpayCheckMac(withMac, HASH_KEY, HASH_IV)).resolves.toBe(V1_EXPECTED);
  });

  it('matches the callback-shape vector V3', async () => {
    await expect(ecpayCheckMac(V3_PARAMS, HASH_KEY, HASH_IV)).resolves.toBe(V3_EXPECTED);
  });

  it('matches the query-shape vector V4', async () => {
    await expect(ecpayCheckMac(V4_PARAMS, HASH_KEY, HASH_IV)).resolves.toBe(V4_EXPECTED);
  });

  it('is independent of key insertion order (keys are sorted)', async () => {
    const reversed: Record<string, string> = {};
    for (const key of Object.keys(V1_PARAMS).reverse()) {
      reversed[key] = V1_PARAMS[key];
    }
    await expect(ecpayCheckMac(reversed, HASH_KEY, HASH_IV)).resolves.toBe(V1_EXPECTED);
  });

  it('returns a 64-char uppercase hex digest', async () => {
    const digest = await ecpayCheckMac(V1_PARAMS, HASH_KEY, HASH_IV);
    expect(digest).toMatch(/^[0-9A-F]{64}$/);
  });
});

describe('ecpayUrlEncode (§5 encoding)', () => {
  it('passes the safe characters through unchanged', () => {
    expect(ecpayUrlEncode('a-b_c.d!e*f(g)h')).toBe('a-b_c.d!e*f(g)h');
  });

  it('escapes reserved URL characters', () => {
    expect(ecpayUrlEncode('a & b=c')).toBe('a+%26+b%3dc');
    expect(ecpayUrlEncode('100%')).toBe('100%25');
  });

  it('escapes apostrophes and tildes and distinguishes spaces from literal plus signs', () => {
    expect(ecpayUrlEncode("Tom's Shop~ +%20")).toBe('tom%27s+shop%7e+%2b%2520');
  });
});

describe('applyEcpayEncodeSubstitutions (§5 documented substitution table)', () => {
  it('maps the .NET-style escapes to the safe characters', () => {
    expect(applyEcpayEncodeSubstitutions('%2d%5f%2e%21%2a%28%29')).toBe('-_.!*()');
  });

  it('leaves lower and upper hex forms both normalized', () => {
    expect(applyEcpayEncodeSubstitutions('%2D %2d')).toBe('- -');
  });

  it('leaves unrelated escapes untouched', () => {
    expect(applyEcpayEncodeSubstitutions('%20%26%3D')).toBe('%20%26%3D');
  });
});

describe('canonicalCheckMacString (pipeline golden)', () => {
  it('produces the documented HashKey/HashIV + lowercase + urlencoded string', async () => {
    await expect(canonicalCheckMacString(V1_PARAMS, HASH_KEY, HASH_IV)).resolves.toBe(
      'hashkey%3d5294y06jbispm5x9%26choosepayment%3dcredit%26encrypttype%3d1' +
        '%26itemname%3dkeigo+essentials%26language%3djpn%26merchantid%3d2000132' +
        '%26merchanttradedate%3d2026%2f08%2f16+10%3a30%3a00' +
        '%26merchanttradeno%3dbjh202608160001%26needextrapaidinfo%3dn' +
        '%26paymenttype%3daio%26returnurl%3dhttps%3a%2f%2fexample.com%2ffunctions%2fv1' +
        '%2fecpay-callback%26totalamount%3d790' +
        '%26tradedesc%3dbusiness+japanese+hub+book+purchase' +
        '%26hashiv%3dv77hokgq4kwxnnis',
    );
  });

  it('sorts mixed-case keys like the official PHP SDK strcasecmp, without changing their names', async () => {
    // No lower-case-key vector in the official vector set above. Ordering source:
    // https://github.com/ECPay/SDK_PHP/blob/ac385aa38c6ae10ad515f33dac4667106182c282/src/Services/ArrayService.php
    await expect(canonicalCheckMacString(
      { MerchantID: '3002607', gwsr: '123', Z: 'last', a: 'first', A: 'second' },
      OFFICIAL_HASH_KEY, OFFICIAL_HASH_IV,
    )).resolves.toBe(
      'hashkey%3dpwfhcqoqzgmho4w6%26a%3dfirst%26a%3dsecond%26gwsr%3d123' +
        '%26merchantid%3d3002607%26z%3dlast%26hashiv%3dekrm7ift261dpevs',
    );
  });
});

describe('verifyCheckMac', () => {
  it('accepts a correct expected value', async () => {
    await expect(verifyCheckMac(V1_PARAMS, HASH_KEY, HASH_IV, V1_EXPECTED)).resolves.toBe(true);
  });

  it('is case-insensitive', async () => {
    await expect(verifyCheckMac(V1_PARAMS, HASH_KEY, HASH_IV, V1_EXPECTED.toLowerCase())).resolves.toBe(true);
  });

  it('rejects a wrong expected value', async () => {
    await expect(verifyCheckMac(V1_PARAMS, HASH_KEY, HASH_IV, V2_EXPECTED)).resolves.toBe(false);
  });

  it('rejects missing / empty expected values', async () => {
    await expect(verifyCheckMac(V1_PARAMS, HASH_KEY, HASH_IV, undefined)).resolves.toBe(false);
    await expect(verifyCheckMac(V1_PARAMS, HASH_KEY, HASH_IV, '')).resolves.toBe(false);
  });
});

describe('sha256Hex', () => {
  it('computes the known SHA-256 of "hello"', async () => {
    await expect(sha256Hex('hello')).resolves.toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });
});
