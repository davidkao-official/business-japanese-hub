/**
 * Server-side ECPay `MerchantTradeNo` generator (decision-record §4.6).
 *
 * Never client-supplied; ≤ 20 chars, alphanumeric, unique per Payment attempt,
 * never reused. Format `BJH<base36-timestamp><base36-random>` stays ≤ 20 chars
 * for any real clock value. Collision retry against the DB `UNIQUE(provider,
 * provider_merchant_ref)` lives in the checkout handler (re-generate + re-insert
 * on a duplicate-key error).
 *
 * `now` / `random` are injectable for deterministic tests.
 */
export const MERCHANT_REF_PREFIX = 'BJH';
export const MERCHANT_REF_MAX_LENGTH = 20;

export function generateMerchantReference(now: () => Date, random: () => number): string {
  const timestampBase36 = Math.floor(now().getTime()).toString(36).toUpperCase();
  const randomBase36 = Math.floor(random() * 36 ** 6)
    .toString(36)
    .padStart(6, '0')
    .toUpperCase();
  return `${MERCHANT_REF_PREFIX}${timestampBase36}${randomBase36}`;
}

/** True when a merchant reference is a valid ECPay value (validation rule §4.6). */
export function isValidMerchantReference(ref: string): boolean {
  return /^[A-Z0-9]{1,20}$/.test(ref);
}

/** True when a DB error looks like a unique-constraint violation on the ref. */
export function isMerchantRefCollision(message: string): boolean {
  return /duplicate key value violates unique constraint|payments_provider_merchant_ref|merchant_ref_key/i.test(
    message,
  );
}
