/**
 * ECPay CheckMacValue canonicalization (decision-record §5).
 *
 * THE single implementation of ECPay's signature algorithm. Every endpoint that
 * needs a CheckMacValue (AioCheckOut creation, ReturnURL callback verification,
 * QueryTradeInfo/V5 response verification, and any future ECPay API) MUST reuse
 * this module — never duplicate urlencode / signature logic elsewhere.
 *
 * Algorithm (§5, authoritative):
 *   all params EXCEPT CheckMacValue
 *     → sort keys alphabetically
 *     → join `k1=v1&k2=v2`
 *     → prepend `HashKey=<hashKey>&` and append `&HashIV=<hashIV>`
 *     → ECPay-compatible URL encode (encodeURIComponent semantics, then apply
 *       the documented substitutions %2d→-, %5f→_, %2e→., %21→!, %2a→*, %28→(,
 *       %29→))
 *     → lowercase the whole encoded string
 *     → SHA-256
 *     → uppercase
 *
 * `HashKey` / `HashIV` are server-only secrets (§15). This module never logs,
 * stores, or returns them; callers must pass them from server-side config and
 * never accept them from client-facing input.
 *
 * Uses the Web Crypto API (`crypto.subtle`) so it runs unchanged in both Deno
 * (Supabase Edge Functions) and Node (vitest).
 */

import { sha256Hex } from '../crypto.ts';

export { sha256Hex };

/**
 * The documented substitution step (§5). Applied to the output of a URL encoder;
 * on `encodeURIComponent` output these are no-ops (encodeURIComponent never
 * produces those escapes), but they normalize .NET-style encoders that do. Kept
 * as its own function so the substitution table is unit-testable in isolation.
 */
export function applyEcpayEncodeSubstitutions(encoded: string): string {
  return encoded
    .replace(/%2[dD]/g, '-')
    .replace(/%5[fF]/g, '_')
    .replace(/%2[eE]/g, '.')
    .replace(/%21/g, '!')
    .replace(/%2[aA]/g, '*')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')');
}

/**
 * ECPay-compatible URL encoding: `encodeURIComponent` semantics followed by the
 * documented substitutions. `encodeURIComponent` does not escape `- _ . ! ~ * ' ( )`,
 * so on its own output the substitutions are no-ops; they are applied so the
 * result is identical regardless of which encoder produced the escaped input
 * (e.g. .NET `HttpUtility.UrlEncode`, which escapes those characters).
 */
export function ecpayUrlEncode(input: string): string {
  return applyEcpayEncodeSubstitutions(encodeURIComponent(input));
}

/**
 * Compute the ECPay CheckMacValue for `params`. `CheckMacValue` (if present in
 * `params`) is excluded from canonicalization, so the same params object can be
 * passed for both generation and verification.
 */
export async function ecpayCheckMac(
  params: Record<string, string>,
  hashKey: string,
  hashIV: string,
): Promise<string> {
  const canonical = await canonicalCheckMacString(params, hashKey, hashIV);
  const digest = await sha256Hex(canonical);
  return digest.toUpperCase();
}

/**
 * The canonical signed string (§5 pipeline up to and including lowercase),
 * exposed for debugging / golden-path tests. Not part of the public signature
 * contract.
 */
export async function canonicalCheckMacString(
  params: Record<string, string>,
  hashKey: string,
  hashIV: string,
): Promise<string> {
  const keys = Object.keys(params)
    .filter((key) => key !== 'CheckMacValue')
    .sort();
  const joined = keys.map((key) => `${key}=${params[key]}`).join('&');
  const withSecrets = `HashKey=${hashKey}&${joined}&HashIV=${hashIV}`;
  return ecpayUrlEncode(withSecrets).toLowerCase();
}

/**
 * Verify an expected CheckMacValue against `params` (which may include the
 * received `CheckMacValue`; it is excluded from canonicalization). Comparison
 * is case-insensitive. A missing / empty expected value is always rejected.
 */
export async function verifyCheckMac(
  params: Record<string, string>,
  hashKey: string,
  hashIV: string,
  expected: string | undefined,
): Promise<boolean> {
  if (!expected) {
    return false;
  }
  const computed = await ecpayCheckMac(params, hashKey, hashIV);
  return computed === expected.toUpperCase();
}
