import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithAppProviders } from '../test/appProviders'
import { PurchaseCTA } from './PurchaseCTA'
import { sampleBook } from '../content/fixtures/sample-book'

describe('PurchaseCTA — TW pre-delivery consent flow (#25)', () => {
  it('blocks submission until the consent checkbox is checked (fail closed)', async () => {
    const executor = vi.fn(async () => ({ ok: true, orderId: 'order-1', status: 'pending' }) as const)
    renderWithAppProviders(<PurchaseCTA book={sampleBook} jurisdiction="TW" />, {
      purchaseExecutor: executor,
    })

    fireEvent.click(screen.getByRole('button', { name: /購入する/ }))

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
      { bookId: sampleBook.id },
      expect.objectContaining({ jurisdiction: 'TW', consentGranted: true }),
    )
  })

  it('submits the JP proceeded-after-disclosure consent for a non-TW jurisdiction', async () => {
    const executor = vi.fn(async () => ({ ok: true, orderId: 'order-1', status: 'pending' }) as const)
    renderWithAppProviders(<PurchaseCTA book={sampleBook} />, {
      purchaseExecutor: executor,
    })

    fireEvent.click(screen.getByRole('button', { name: /購入する/ }))

    // No TW checkbox is shown for JP; the executor still receives a JP
    // ConsentSubmission so the server can persist order_compliance evidence.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(executor).toHaveBeenCalledWith(
      { bookId: sampleBook.id },
      expect.objectContaining({ jurisdiction: 'JP', consentGranted: true }),
    )
  })
})
