/**
 * Provider-neutral purchase seam (GitHub issue #6 / #9).
 *
 * The shared purchase contract is the architecture lock in
 * `src/lib/payments/contract.ts` (§15 Purchase seam). This file re-exports it
 * so existing consumers (`PurchaseContext`, `PurchaseCTA`) keep importing from
 * the seam without drifting from the locked contract.
 *
 * The client sends only `bookId`; amount / currency are never client-supplied.
 * #9 wires the real ECPay executor into `PurchaseProvider`.
 */

export type {
  PurchaseExecutor,
  PurchaseIntent,
  PurchaseResult,
} from '../payments/contract';
