import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router-dom'
import { renderWithAppProviders } from '../test/appProviders'
import { PurchaseResultPage } from './PurchaseResultPage'
import type { OrderStatusResponse } from '../lib/payments/contract'

const BASE = 'https://edge.example/functions/v1'

// Mock only pollOrderStatus (the real bounded-polling loop is covered in
// executor.test.ts); keep resolveFunctionsBaseUrl + resultStateFor real so the
// page's server-driven mapping is still exercised.
const { pollOrderStatusMock } = vi.hoisted(() => ({ pollOrderStatusMock: vi.fn() }))
vi.mock('../lib/purchase/executor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/purchase/executor')>()
  return { ...actual, pollOrderStatus: pollOrderStatusMock }
})

function order(overrides: Partial<OrderStatusResponse> = {}): OrderStatusResponse {
  return {
    orderId: 'order-1',
    status: 'pending',
    paymentStatus: null,
    bookId: 'book-sample-bj-keigo',
    amount: { amount: 880, currency: 'JPY' },
    ...overrides,
  }
}

/** A promise the test resolves manually to control when the "poll" completes. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function renderResult(initialEntries: string[]) {
  return renderWithAppProviders(
    <Routes>
      <Route path="/purchase/result" element={<PurchaseResultPage />} />
    </Routes>,
    { initialEntries },
  )
}

describe('PurchaseResultPage — browser-return result (server-driven only)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_EDGE_FUNCTIONS_BASE_URL', BASE)
    pollOrderStatusMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('shows a missing-order state without an order query param', () => {
    renderResult(['/purchase/result'])
    expect(screen.getByText('注文番号がありません。')).toBeInTheDocument()
    expect(pollOrderStatusMock).not.toHaveBeenCalled()
  })

  it('polls pending → paid and renders the receipt (query params never drive the UI)', async () => {
    const poll = deferred<OrderStatusResponse>()
    pollOrderStatusMock.mockReturnValueOnce(poll.promise)

    // Browser-return query params (RtnCode/TradeStatus) are present but must be
    // ignored — only the orders-status response decides the view.
    renderResult(['/purchase/result?order=order-1&RtnCode=1&TradeStatus=1'])

    expect(pollOrderStatusMock).toHaveBeenCalledWith(
      'order-1',
      expect.objectContaining({ functionsBaseUrl: BASE }),
    )
    expect(screen.getByText('決済確認中…')).toBeInTheDocument()

    poll.resolve(order({ status: 'paid', paymentStatus: 'succeeded' }))
    await waitFor(() => expect(screen.getByText('購入が完了しました')).toBeInTheDocument())

    expect(screen.getByText('注文の領収書')).toBeInTheDocument()
    expect(screen.getByTestId('receipt-order-id')).toHaveTextContent('order-1')
    expect(screen.getByTestId('receipt-amount')).toHaveTextContent('¥880')
  })

  it('never treats browser-return query params as payment evidence', async () => {
    const poll = deferred<OrderStatusResponse>()
    pollOrderStatusMock.mockReturnValueOnce(poll.promise)

    renderResult(['/purchase/result?order=order-1&RtnCode=1&TradeStatus=1'])

    expect(screen.getByText('決済確認中…')).toBeInTheDocument()

    // The server reports pending forever — the page must stay pending even with
    // RtnCode=1 / TradeStatus=1 in the query string; no receipt, no success.
    poll.resolve(order({ status: 'pending' }))
    await waitFor(() => expect(screen.getByText(/まだ完了していません/)).toBeInTheDocument())

    expect(screen.getByText(/決済確認中/)).toBeInTheDocument()
    expect(screen.queryByText('注文の領収書')).not.toBeInTheDocument()
    expect(screen.queryByText('購入が完了しました')).not.toBeInTheDocument()
  })

  it('renders cancelled from the server order status', async () => {
    const poll = deferred<OrderStatusResponse>()
    pollOrderStatusMock.mockReturnValueOnce(poll.promise)

    renderResult(['/purchase/result?order=order-1'])

    poll.resolve(order({ status: 'cancelled' }))
    await waitFor(() => expect(screen.getByText('購入はキャンセルされました')).toBeInTheDocument())
    expect(screen.getByText('注文はキャンセルされました。')).toBeInTheDocument()
  })

  it('renders failed when the server reports a failed payment', async () => {
    const poll = deferred<OrderStatusResponse>()
    pollOrderStatusMock.mockReturnValueOnce(poll.promise)

    renderResult(['/purchase/result?order=order-1'])

    poll.resolve(order({ status: 'pending', paymentStatus: 'failed' }))
    await waitFor(() => expect(screen.getByText('決済に失敗しました')).toBeInTheDocument())
    expect(screen.getByText('決済が完了しませんでした。もう一度お試しください。')).toBeInTheDocument()
  })
})
