/**
 * Provider-neutral purchase seam (GitHub issue #6).
 *
 * #6 deliberately does NOT implement payment. It only defines the abstraction
 * a future ECPay integration (#9) can implement: the app describes "the user
 * wants to buy this book" as an inert `PurchaseIntent`, and the executor
 * resolves it. ECPay specifics (CheckMacValue, callbacks, order persistence,
 * merchant secrets) are strictly out of scope here.
 */

/** What the user intends to buy. Grows with the payment contract (#9). */
export interface PurchaseIntent {
  /** Stable content-model `Book.id`. */
  bookId: string;
  /** Display amount in the currency's major unit (snapshot, not used for arithmetic). */
  amount?: number;
  /** Uppercase ISO 4217 code. */
  currency?: string;
}

/** Outcome of attempting a purchase. */
export type PurchaseResult =
  | { ok: true }
  | { ok: false; reason: 'unavailable' | 'canceled' | 'failed'; message?: string };

/**
 * The single abstraction point: an async function that takes a purchase intent
 * and returns its outcome. #9 swaps this for the ECPay executor without any
 * Book Detail / Reader change.
 */
export type PurchaseExecutor = (intent: PurchaseIntent) => Promise<PurchaseResult>;
