/**
 * The #6 inert purchase executor.
 *
 * Payment is intentionally not implemented (#9). This executor always reports
 * "unavailable", so the purchase CTA surface and its failure feedback are real
 * and testable today; #9 replaces only the executor value.
 */

import type { PurchaseExecutor } from './types';

export const unavailablePurchaseExecutor: PurchaseExecutor = async () => ({
  ok: false,
  reason: 'unavailable',
  message: 'payment is not available yet',
});
