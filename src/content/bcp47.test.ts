import { describe, expect, it } from 'vitest';
import { isValidBcp47Tag } from './bcp47';

describe('isValidBcp47Tag (RFC 5646 structural grammar)', () => {
  it('accepts well-formed language tags', () => {
    const valid = [
      'ja',
      'zh-TW',
      'zh-cmn',
      'zh-cmn-Hans-CN',
      'zh-yue-HK',
      'de-CH-1901',
      'en-US-u-ca-japanese',
      'x-business',
      'i-klingon',
      'en-GB-oed',
      'zh-min-nan',
    ];
    for (const tag of valid) {
      expect(isValidBcp47Tag(tag), `expected ${JSON.stringify(tag)} to be valid`).toBe(true);
    }
  });

  it('rejects malformed language tags', () => {
    const invalid = [
      'en-a', // dangling extension singleton
      'art-lojban-a', // grandfathered prefix + malformed suffix
      'zh-min-nan-a', // grandfathered prefix + malformed suffix
      'en-u-ca-u-ja', // repeated extension singleton
      'de-1901-1901', // repeated variant
      'en--US', // empty subtag
      'en_GB', // illegal character
      '', // empty
      'x', // private use with no subtag
      'x-', // private use with empty subtag
    ];
    for (const tag of invalid) {
      expect(isValidBcp47Tag(tag), `expected ${JSON.stringify(tag)} to be invalid`).toBe(false);
    }
  });

  it('is case-insensitive', () => {
    expect(isValidBcp47Tag('ZH-CMN-HANS-CN')).toBe(true);
    expect(isValidBcp47Tag('En-GB-Oed')).toBe(true);
    expect(isValidBcp47Tag('X-Business')).toBe(true);
  });
});
