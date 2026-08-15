/**
 * PurchaseProvider — injects the provider-neutral purchase executor.
 *
 * Book Detail renders a `購入する` CTA that calls `execute(intent)` and reacts
 * to the result; #9 swaps the executor value (the ECPay flow) with no
 * interaction-model change. Without a provider the CTA degrades to the inert
 * "unavailable" executor.
 */

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { unavailablePurchaseExecutor } from './unavailable';
import type { PurchaseExecutor, PurchaseIntent, PurchaseResult } from './types';

export interface PurchaseContextValue {
  execute(intent: PurchaseIntent): Promise<PurchaseResult>;
}

export interface PurchaseProviderProps {
  /** The executor; #9 replaces this. Defaults to the inert unavailable executor. */
  executor?: PurchaseExecutor;
  children: ReactNode;
}

const PurchaseContext = createContext<PurchaseContextValue | null>(null);

export function PurchaseProvider({ executor, children }: PurchaseProviderProps) {
  const value = useMemo<PurchaseContextValue>(
    () => ({ execute: executor ?? unavailablePurchaseExecutor }),
    [executor],
  );
  return <PurchaseContext.Provider value={value}>{children}</PurchaseContext.Provider>;
}

export function usePurchase(): PurchaseContextValue {
  return useContext(PurchaseContext) ?? { execute: unavailablePurchaseExecutor };
}
