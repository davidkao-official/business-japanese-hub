/**
 * Shared SHA-256 helper (Web Crypto API) so both Deno (Supabase Edge Functions)
 * and Node (vitest) run unchanged. Used for the payment-event fingerprint (§12)
 * and provider signature canonicalization.
 */

/**
 * SHA-256 hex digest of a UTF-8 string (lowercase hex), via the Web Crypto API.
 */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}
