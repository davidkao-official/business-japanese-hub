import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithAppProviders } from '../test/appProviders'
import { PurchaseCTA } from './PurchaseCTA'
import { paidKeigoBook } from '../content/fixtures/paid-test-books'

describe('PurchaseCTA — consumer-jurisdiction declaration + consent flow (#25)', () => {
  it('asks for a consumer-jurisdiction declaration before checkout (unresolved fails closed)', async () => {
    const executor = vi.fn(async () => ({ ok: true, orderId: 'order-1', status: 'pending' }) as const)
    renderWithAppProviders(<PurchaseCTA book={paidKeigoBook} />, {
      purchaseExecutor: executor,
    })

    fireEvent.click(screen.getByRole('button', { name: /購入する/ }))

    // The declaration step appears; no executor call yet.
    expect(screen.getByText('お住まいの国・地域を選択してください')).toBeInTheDocument()
    expect(executor).not.toHaveBeenCalled()
  })

  it('declared JP proceeds with the JP proceeded-after-disclosure consent (no TW checkbox)', async () => {
    const executor = vi.fn(async () => ({ ok: true, orderId: 'order-1', status: 'pending' }) as const)
    renderWithAppProviders(<PurchaseCTA book={paidKeigoBook} />, {
      purchaseExecutor: executor,
    })

    fireEvent.click(screen.getByRole('button', { name: /購入する/ }))
    fireEvent.click(screen.getByRole('button', { name: '日本の消費者' }))

    expect(executor).toHaveBeenCalledTimes(1)
    expect(executor).toHaveBeenCalledWith(
      { bookId: paidKeigoBook.id },
      expect.objectContaining({ jurisdiction: 'JP', consentGranted: true }),
    )
  })

  it('declared TW still requires the TW pre-delivery consent checkbox (fail closed)', async () => {
    const executor = vi.fn(async () => ({ ok: true, orderId: 'order-1', status: 'pending' }) as const)
    renderWithAppProviders(<PurchaseCTA book={paidKeigoBook} />, {
      purchaseExecutor: executor,
    })

    fireEvent.click(screen.getByRole('button', { name: /購入する/ }))
    fireEvent.click(screen.getByRole('button', { name: '台湾の消費者' }))

    // The TW pre-delivery notice (from legal content) is shown.
    expect(screen.getByText(/クーリング・オフ/)).toBeInTheDocument()
    expect(screen.getByText(/若已於購買前取得/)).toBeInTheDocument()

    const confirm = screen.getByRole('button', { name: '同意して購入する' })

    // Unchecked → blocked, executor never called.
    fireEvent.click(confirm)
    expect(screen.getByRole('alert')).toHaveTextContent(
      '購入を続けるには上記に同意する必要があります。',
    )
    expect(executor).not.toHaveBeenCalled()

    // Checked → submission proceeds with the built ConsentSubmission.
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(confirm)
    expect(executor).toHaveBeenCalledTimes(1)
    expect(executor).toHaveBeenCalledWith(
      { bookId: paidKeigoBook.id },
      expect.objectContaining({ jurisdiction: 'TW', consentGranted: true }),
    )
  })

  it('an explicit TW jurisdiction prop skips the declaration step and shows consent', async () => {
    const executor = vi.fn(async () => ({ ok: true, orderId: 'order-1', status: 'pending' }) as const)
    renderWithAppProviders(<PurchaseCTA book={paidKeigoBook} jurisdiction="TW" />, {
      purchaseExecutor: executor,
    })

    fireEvent.click(screen.getByRole('button', { name: /購入する/ }))

    // No declaration step; the TW consent step is shown directly.
    expect(screen.queryByText('お住まいの国・地域を選択してください')).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '同意して購入する' }))
    expect(executor).toHaveBeenCalledWith(
      { bookId: paidKeigoBook.id },
      expect.objectContaining({ jurisdiction: 'TW', consentGranted: true }),
    )
  })

  it('an explicit JP jurisdiction prop skips declaration and submits the JP consent directly', async () => {
    const executor = vi.fn(async () => ({ ok: true, orderId: 'order-1', status: 'pending' }) as const)
    renderWithAppProviders(<PurchaseCTA book={paidKeigoBook} jurisdiction="JP" />, {
      purchaseExecutor: executor,
    })

    fireEvent.click(screen.getByRole('button', { name: /購入する/ }))

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(executor).toHaveBeenCalledWith(
      { bookId: paidKeigoBook.id },
      expect.objectContaining({ jurisdiction: 'JP', consentGranted: true }),
    )
  })

  it('does not double-submit a purchase (one executor call per intent)', async () => {
    let resolveExec!: (result: { ok: true; orderId: string; status: 'pending' }) => void
    const executor = vi.fn(
      async () =>
        new Promise<{ ok: true; orderId: string; status: 'pending' }>((res) => {
          resolveExec = res
        }),
    )
    renderWithAppProviders(<PurchaseCTA book={paidKeigoBook} jurisdiction="TW" />, {
      purchaseExecutor: executor,
    })

    fireEvent.click(screen.getByRole('button', { name: /購入する/ }))
    fireEvent.click(screen.getByRole('checkbox'))
    const confirm = screen.getByRole('button', { name: '同意して購入する' })
    fireEvent.click(confirm)
    // A second click while the submission is in flight must not start a second checkout.
    fireEvent.click(confirm)

    expect(executor).toHaveBeenCalledTimes(1)
    resolveExec({ ok: true, orderId: 'order-1', status: 'pending' })
  })
})
