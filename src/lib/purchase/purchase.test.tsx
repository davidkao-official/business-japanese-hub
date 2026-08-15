import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PurchaseProvider, usePurchase } from './PurchaseContext'
import { unavailablePurchaseExecutor } from './unavailable'

describe('purchase seam (provider-neutral, #6 does not implement payment)', () => {
  it('the inert executor reports unavailable for any intent', async () => {
    const result = await unavailablePurchaseExecutor({
      bookId: 'book-sample-bj-keigo',
      amount: 880,
      currency: 'JPY',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('unavailable')
    }
  })

  it('exposes the injected executor through the provider (the #9 swap point)', async () => {
    const executor = vi.fn(async () => ({ ok: true }) as const)
    const { result } = renderHook(() => usePurchase(), {
      wrapper: ({ children }) => (
        <PurchaseProvider executor={executor}>{children}</PurchaseProvider>
      ),
    })

    await result.current.execute({ bookId: 'book-sample-bj-keigo' })
    expect(executor).toHaveBeenCalledWith({ bookId: 'book-sample-bj-keigo' })
  })

  it('degrades to the inert executor without a provider', async () => {
    const { result } = renderHook(() => usePurchase())
    const outcome = await result.current.execute({ bookId: 'x' })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.reason).toBe('unavailable')
    }
  })
})
