/**
 * Sanitized operational logger (decision-record §15).
 *
 * Logs may contain ONLY: local order/payment ids, provider, MerchantTradeNo /
 * TradeNo (when available), normalized state, RtnCode, callback/event
 * fingerprint, verification/reconciliation result, and timestamps. Provider
 * secrets (HashKey / HashIV / MerchantID), tokens, and card data are never
 * logged — `sanitize` drops any field whose key looks sensitive as defense in
 * depth, independent of callers.
 *
 * The `Logger` interface is the injectable seam; tests use plain `vi.fn()`
 * objects. `createSanitizedLogger` is the production implementation wired in the
 * Deno entry.
 */

export interface Logger {
  info(fields: Record<string, unknown>, message?: string): void;
  warn(fields: Record<string, unknown>, message?: string): void;
  error(fields: Record<string, unknown>, message?: string): void;
}

const SENSITIVE_KEY = /(hashkey|hashiv|hash_?key|hash_?iv|secret|token|password|card|pan|cvv|authorization|checkmac)/i;

/** Drop fields whose key looks sensitive; keep the rest verbatim. */
export function sanitizeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!SENSITIVE_KEY.test(key)) out[key] = value;
  }
  return out;
}

function line(level: string, fields: Record<string, unknown>, message: string | undefined): string {
  const safe = sanitizeFields(fields);
  const serialized = Object.keys(safe).length > 0 ? ` ${JSON.stringify(safe)}` : '';
  return `[payments] ${new Date().toISOString()} ${level}${message ? ` ${message}` : ''}${serialized}`;
}

export function createSanitizedLogger(write: (text: string) => void = console.log): Logger {
  return {
    info: (fields, message) => write(line('info', fields, message)),
    warn: (fields, message) => write(line('warn', fields, message)),
    error: (fields, message) => write(line('error', fields, message)),
  };
}
